/**
 * POST /api/billing/portal — Stripe Customer Portal session.
 *
 * Card updates, invoices, and cancellation UI, all hosted by Stripe. Only
 * meaningful for users the webhook has associated with a Stripe customer.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getStripe, getStripeCustomerId } from '@/lib/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';

export async function POST(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ success: false, error: 'Billing is not live yet.' }, { status: 503 });
  }
  const customerId = await getStripeCustomerId(authResult.userId);
  if (!customerId) {
    return NextResponse.json(
      { success: false, error: 'No billing profile found for this account.' },
      { status: 404 },
    );
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/plans`,
    });
    return NextResponse.json({ success: true, url: portal.url });
  } catch (error) {
    console.error('Stripe portal session failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not open the billing portal.' },
      { status: 500 },
    );
  }
}
