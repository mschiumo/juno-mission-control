/**
 * POST /api/billing/checkout  { tier, cycle }
 *
 * The seam Stripe plugs into. When billing goes live this will create a
 * Stripe Checkout Session for the chosen tier/cycle and return its URL; the
 * webhook that confirms payment will then write the entitlement record
 * (source: 'billing', billingRef: subscription id, expiresAt: period end).
 *
 * Until then it validates the selection and reports that payments aren't
 * live yet, so the client can steer users to the free Gold trial.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { TIER_PRICING, PLATINUM_COMING_SOON, type Tier } from '@/lib/entitlements';

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

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
