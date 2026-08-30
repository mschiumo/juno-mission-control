/**
 * POST /api/user/plan/cancel
 *
 * Downgrade to the free Silver tier, effective immediately. Two spend taps
 * get shut off in order: the Stripe subscription (if the plan came from
 * billing) and then the SnapTrade connection — disconnection is part of
 * cancellation itself, not deferred to the nightly sweep.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { clearEntitlement, clearPlanIndex } from '@/lib/db/entitlements';
import { disconnectBrokerage } from '@/lib/brokerage-access';
import { disconnectPortfolio } from '@/lib/portfolio-access';
import { recordPlanEvent } from '@/lib/db/plan-events';
import { getEntitlementRecord } from '@/lib/db/entitlements';
import { auth } from '@/auth';
import { getStripe } from '@/lib/stripe';

export async function POST(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  try {
    const record = await getEntitlementRecord(userId);
    const session = await auth();

    // A billing-sourced plan must cancel at Stripe FIRST — clearing our
    // record while the subscription keeps charging would be the worst bug
    // this app could have.
    if (record?.source === 'billing' && record.billingRef) {
      const stripe = getStripe();
      if (!stripe) {
        return NextResponse.json(
          { success: false, error: 'Billing is unavailable right now — try again shortly.' },
          { status: 503 },
        );
      }
      try {
        await stripe.subscriptions.cancel(record.billingRef);
      } catch (error) {
        const alreadyGone =
          error instanceof Error && /No such subscription|canceled/i.test(error.message);
        if (!alreadyGone) {
          console.error('Stripe subscription cancel failed:', error);
          return NextResponse.json(
            { success: false, error: 'Could not cancel the subscription — please try again or contact support.' },
            { status: 502 },
          );
        }
      }
    }

    const teardown = await disconnectBrokerage(userId);
    const portfolioTeardown = await disconnectPortfolio(userId);
    await clearEntitlement(userId);
    await clearPlanIndex(userId);
    await recordPlanEvent({
      type: 'plan_cancelled',
      userId,
      email: session?.user?.email ?? undefined,
      detail:
        `Was ${record?.tier ?? 'silver'} (${record?.source ?? 'none'}); brokerage ${teardown.hadConnection ? (teardown.deregistered ? 'disconnected' : 'queued for retry') : 'not connected'}; ` +
        `portfolio ${portfolioTeardown.hadConnection ? (portfolioTeardown.deregistered ? 'disconnected' : 'queued for retry') : 'not connected'}`,
    });
    return NextResponse.json({ success: true, teardown, portfolioTeardown });
  } catch (error) {
    console.error('Plan cancellation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not cancel the plan. Please try again.' },
      { status: 500 },
    );
  }
}
