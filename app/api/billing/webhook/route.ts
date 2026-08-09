/**
 * POST /api/billing/webhook — Stripe events → entitlement records.
 *
 * Authenticated by Stripe's signature (middleware exempts this path from
 * session auth). All state flows through the same setEntitlement /
 * clearEntitlement seam as trials and admin grants, so the feature gates
 * never know Stripe exists.
 *
 * Handled events:
 *   checkout.session.completed              → learn the customer id
 *   customer.subscription.created/updated   → write/extend the entitlement
 *   customer.subscription.deleted           → clear entitlement + teardown
 *   invoice.payment_failed                  → owner-visible plan event only
 *     (access is NOT cut here — the record's expiresAt handles true lapses,
 *      and Stripe retries payment on its own schedule)
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, tierForPriceId, expiryFromSubscription, saveStripeCustomerId } from '@/lib/stripe';
import { setEntitlement, clearEntitlement, clearPlanIndex } from '@/lib/db/entitlements';
import { disconnectBrokerage } from '@/lib/brokerage-access';
import { recordPlanEvent } from '@/lib/db/plan-events';

export async function POST(request: Request): Promise<NextResponse> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (userId && customerId) await saveStripeCustomerId(userId, customerId);
        // The entitlement itself is written by the subscription.created/updated
        // event that accompanies this session.
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        const tier = tierForPriceId(sub.items.data[0]?.price?.id);
        if (!tier || tier === 'silver') break;

        if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
          // past_due keeps access until expiresAt lapses — Stripe is retrying.
          await setEntitlement(userId, {
            tier,
            source: 'billing',
            billingRef: sub.id,
            expiresAt: expiryFromSubscription(sub),
          });
          if (event.type === 'customer.subscription.created') {
            await recordPlanEvent({
              type: 'subscription_started',
              userId,
              detail: `${tier} · ${sub.id}`,
            });
          }
        } else if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'incomplete_expired') {
          await endSubscription(userId, sub.id, sub.status);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (userId) await endSubscription(userId, sub.id, 'deleted');
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await recordPlanEvent({
          type: 'payment_failed',
          userId: invoice.metadata?.userId ?? 'unknown',
          email: invoice.customer_email ?? undefined,
          detail: `Invoice ${invoice.id}`,
        });
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`Stripe webhook handling failed for ${event.type}:`, error);
    // 500 so Stripe retries — handlers above are idempotent.
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function endSubscription(userId: string, subId: string, reason: string): Promise<void> {
  const teardown = await disconnectBrokerage(userId);
  await clearEntitlement(userId);
  await clearPlanIndex(userId);
  await recordPlanEvent({
    type: 'subscription_ended',
    userId,
    detail: `${subId} (${reason}); brokerage ${teardown.hadConnection ? (teardown.deregistered ? 'disconnected' : 'queued for retry') : 'not connected'}`,
  });
}
