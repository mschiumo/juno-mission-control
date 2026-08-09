/**
 * POST /api/billing/checkout  { tier, cycle }
 *
 * With Stripe configured: creates a subscription Checkout Session and
 * returns its URL. Promotion codes are enabled at checkout, so referral
 * codes can live in Stripe once billing is real. The webhook — not this
 * route — writes the entitlement record when payment completes.
 *
 * Without Stripe env: answers BILLING_NOT_LIVE so the client steers users
 * to the free Gold trial (unchanged pre-launch behavior).
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { auth } from '@/auth';
import { requireUserId } from '@/lib/auth-session';
import { TIER_PRICING, PLATINUM_COMING_SOON, type Tier } from '@/lib/entitlements';
import { getStripe, isStripeConfigured, priceIdFor, getStripeCustomerId } from '@/lib/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  let tier: string | undefined;
  let cycle: string | undefined;
  try {
    const body = await request.json();
    tier = body?.tier;
    cycle = body?.cycle;
  } catch {
    // handled below
  }
  if (tier !== 'gold' && tier !== 'platinum') {
    // Silver is the free tier — there is nothing to buy.
    return NextResponse.json({ success: false, error: 'Unknown plan.' }, { status: 400 });
  }
  if (cycle !== 'monthly' && cycle !== 'annual') {
    return NextResponse.json({ success: false, error: 'Unknown billing cycle.' }, { status: 400 });
  }
  if (tier === 'platinum' && PLATINUM_COMING_SOON) {
    return NextResponse.json(
      { success: false, code: 'COMING_SOON', error: 'Platinum is coming soon — agent onboarding is being finalized.' },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  const priceId = priceIdFor(tier, cycle);
  if (!stripe || !isStripeConfigured() || !priceId) {
    const price = TIER_PRICING[tier as Tier][cycle as 'monthly' | 'annual'];
    return NextResponse.json(
      {
        success: false,
        code: 'BILLING_NOT_LIVE',
        error: 'Payments are almost ready. Start the free week of Gold, or check back soon.',
        selection: { tier, cycle, price },
      },
      { status: 503 },
    );
  }

  try {
    const session = await auth();
    const params = (customer: string | null): Stripe.Checkout.SessionCreateParams => ({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Bind the session to our user both ways: metadata for the webhook,
      // and the customer/email so Stripe dedupes billing profiles.
      ...(customer ? { customer } : { customer_email: session?.user?.email ?? undefined }),
      metadata: { userId },
      subscription_data: { metadata: { userId } },
      allow_promotion_codes: true,
      success_url: `${APP_URL}/plans?checkout=success`,
      cancel_url: `${APP_URL}/plans?checkout=cancelled`,
    });

    const existingCustomer = await getStripeCustomerId(userId);
    let checkout;
    try {
      checkout = await stripe.checkout.sessions.create(params(existingCustomer));
    } catch (error) {
      // A stored customer id from the other Stripe mode (test vs live) is
      // unknown here — drop it and start a fresh billing profile rather than
      // failing checkout. The webhook overwrites the stored id on success.
      const unknownCustomer =
        existingCustomer && error instanceof Error && /No such customer/i.test(error.message);
      if (!unknownCustomer) throw error;
      console.warn(`Stored Stripe customer ${existingCustomer} unknown in this mode; retrying without it.`);
      checkout = await stripe.checkout.sessions.create(params(null));
    }
    return NextResponse.json({ success: true, url: checkout.url });
  } catch (error) {
    console.error('Stripe checkout session failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not start checkout. Please try again.' },
      { status: 500 },
    );
  }
}
