/**
 * Stripe wiring — the billing provider behind the entitlement seam.
 *
 * Everything is env-gated: with no STRIPE_SECRET_KEY the app behaves exactly
 * as before Stripe existed (checkout answers BILLING_NOT_LIVE). To go live:
 *
 *   STRIPE_SECRET_KEY            sk_test_… / sk_live_…
 *   STRIPE_WEBHOOK_SECRET        whsec_… (from the webhook endpoint config)
 *   STRIPE_PRICE_GOLD_MONTHLY    price_…
 *   STRIPE_PRICE_GOLD_ANNUAL     price_…
 *   STRIPE_PRICE_PLATINUM_MONTHLY / _ANNUAL   (optional until Platinum launches)
 *
 * Design notes:
 * - The webhook writes the same entitlement records as trials/admin grants —
 *   gates never change. `expiresAt` = item period end + 1 day grace, so a
 *   missed renewal webhook degrades the user one day late instead of never.
 * - Referral codes ride Stripe's own promotion-code machinery at checkout
 *   (allow_promotion_codes); the in-app EmmanuelTrades redemption stays for
 *   the no-card path.
 */

import Stripe from 'stripe';
import { getRedisClient } from '@/lib/redis';
import type { Tier } from '@/lib/entitlements';

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

const PRICE_ENV: Record<string, string | undefined> = {
  'gold:monthly': process.env.STRIPE_PRICE_GOLD_MONTHLY,
  'gold:annual': process.env.STRIPE_PRICE_GOLD_ANNUAL,
  'platinum:monthly': process.env.STRIPE_PRICE_PLATINUM_MONTHLY,
  'platinum:annual': process.env.STRIPE_PRICE_PLATINUM_ANNUAL,
};

export function priceIdFor(tier: 'gold' | 'platinum', cycle: 'monthly' | 'annual'): string | null {
  return PRICE_ENV[`${tier}:${cycle}`] ?? null;
}

/** Reverse lookup: which tier does a Stripe price belong to? */
export function tierForPriceId(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null;
  if (priceId === PRICE_ENV['gold:monthly'] || priceId === PRICE_ENV['gold:annual']) return 'gold';
  if (priceId === PRICE_ENV['platinum:monthly'] || priceId === PRICE_ENV['platinum:annual']) return 'platinum';
  return null;
}

// ---------------------------------------------------------------------------
// Customer-id storage — the webhook learns it, the portal needs it.
// ---------------------------------------------------------------------------

function customerKey(userId: string): string {
  return `user:stripe-customer:${userId}`;
}

export async function saveStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(customerKey(userId), customerId);
}

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const redis = await getRedisClient();
  const id = await redis.get(customerKey(userId));
  return typeof id === 'string' && id ? id : null;
}

/**
 * Entitlement expiry for a subscription: the item's period end plus one day
 * of grace (renewal webhooks re-extend it every cycle).
 */
export function expiryFromSubscription(sub: Stripe.Subscription): string {
  const periodEnd = sub.items.data[0]?.current_period_end;
  const base = typeof periodEnd === 'number' ? periodEnd * 1000 : Date.now();
  return new Date(base + 24 * 60 * 60 * 1000).toISOString();
}
