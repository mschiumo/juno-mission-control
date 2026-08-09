/**
 * Plans and entitlements — what a user is allowed to use.
 *
 * Pure module (no Redis, no server-only imports) so client components can
 * import the types and predicates alongside API routes and crons.
 *
 * The model is deliberately provider-agnostic. Nothing here knows about Stripe
 * or any other biller: a payment webhook, an admin grant, a trial, a referral
 * redemption, and the owner override all converge on the same stored record,
 * and every gate reads that one record. Wiring up Stripe later means writing
 * to this store, not touching the gates.
 *
 * Tiers:
 *   silver   — THE FREE TIER. Journal via manual statement upload, Market
 *              News, Trade Management, Performance, Profit Projection, Docs.
 *              Deliberately excludes the two things that cost real money:
 *              SnapTrade connections and AI inference.
 *   gold     — everything in Silver, plus live brokerage sync, the full
 *              Market tab, daily briefing emails, Journal Insights (AI
 *              coaching), and the Goals tab.
 *   platinum — everything in Gold, plus Agents.
 *
 * Every signed-in user resolves to at least Silver — a missing or expired
 * record IS the free tier. The failure mode of a missed webhook or an
 * expired trial is "user degrades to free", never "we keep paying SnapTrade
 * for someone who stopped paying" (paid-only features die with the record).
 */

export type Tier = 'silver' | 'gold' | 'platinum';

export const TIER_ORDER: Record<Tier, number> = { silver: 1, gold: 2, platinum: 3 };

/** Capabilities a tier can carry. Add here as features appear. */
export interface Features {
  /** Trading journal with manual account-statement upload. */
  journal: boolean;
  /** Market News section of the Market tab. */
  marketNews: boolean;
  tradeManagement: boolean;
  performance: boolean;
  profitProjection: boolean;
  docs: boolean;
  /** Live brokerage sync via SnapTrade. Costs real money per connected user. */
  brokerageSync: boolean;
  /** The full Market tab beyond Market News. */
  marketFull: boolean;
  /** Daily market briefing emails. */
  emailBriefings: boolean;
  /** AI coaching / Journal Insights reports on the Performance tab. */
  journalInsights: boolean;
  /** Trading Goals tab. */
  goals: boolean;
  /** Agentic trading (ConfluenceTrading). */
  agents: boolean;
}

export interface Entitlements {
  tier: Tier;
  features: Features;
}

const SILVER_FEATURES: Features = {
  journal: true,
  brokerageSync: false,
  marketFull: false,
  emailBriefings: false,
  journalInsights: false,
  goals: false,
  agents: false,
  marketNews: true,
  tradeManagement: true,
  performance: true,
  profitProjection: true,
  docs: true,
};

const GOLD_FEATURES: Features = {
  ...SILVER_FEATURES,
  brokerageSync: true,
  marketFull: true,
  emailBriefings: true,
  journalInsights: true,
  goals: true,
};

const PLATINUM_FEATURES: Features = {
  ...GOLD_FEATURES,
  agents: true,
};

/** What every signed-in user gets with no stored record: free Silver. */
export const FREE_ENTITLEMENTS: Entitlements = { tier: 'silver', features: SILVER_FEATURES };

const TIER_FEATURES: Record<Tier, Features> = {
  silver: SILVER_FEATURES,
  gold: GOLD_FEATURES,
  platinum: PLATINUM_FEATURES,
};

export function entitlementsForTier(tier: Tier): Entitlements {
  return { tier, features: TIER_FEATURES[tier] };
}

/** Where an entitlement came from — for support, audit, and reconciliation. */
export type EntitlementSource = 'owner' | 'admin' | 'billing' | 'trial' | 'referral';

export interface EntitlementRecord {
  tier: Tier;
  source: EntitlementSource;
  updatedAt: string;
  /**
   * ISO expiry. Absent means "until explicitly revoked" (admin grants).
   * Billing sets this to the end of the paid period, trials/referrals to the
   * end of their window, so lapsed access degrades on its own even if a
   * webhook is missed.
   */
  expiresAt?: string;
  /** Opaque billing-provider reference (e.g. a Stripe subscription id). */
  billingRef?: string;
  /** Free-text reason for admin grants; shown in the admin list. */
  note?: string;
}

/** Whether a stored record is currently in force (unexpired). */
export function isRecordActive(record: EntitlementRecord | null, now: Date = new Date()): boolean {
  if (!record) return false;
  if (!record.expiresAt) return true;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

/** Resolve a stored record into capabilities. Expired or missing = free Silver. */
export function entitlementsFor(
  record: EntitlementRecord | null,
  now: Date = new Date(),
): Entitlements {
  if (!isRecordActive(record, now)) return FREE_ENTITLEMENTS;
  return entitlementsForTier(record!.tier);
}

export function tierAtLeast(tier: Tier, floor: Tier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[floor];
}

// ---------------------------------------------------------------------------
// Pricing. Annual is 10% off twelve months paid upfront.
// ---------------------------------------------------------------------------

export interface TierPricing {
  monthly: number;
  annual: number;
}

export const ANNUAL_DISCOUNT = 0.1;

function annualOf(monthly: number): number {
  return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT) * 100) / 100;
}

export const TIER_PRICING: Record<Tier, TierPricing> = {
  silver: { monthly: 0, annual: 0 },
  gold: { monthly: 29, annual: annualOf(29) },
  platinum: { monthly: 59, annual: annualOf(59) },
};

/** Tiers that can actually be purchased (Silver is free). */
export const PAID_TIERS: Tier[] = ['gold', 'platinum'];

/**
 * Platinum is announced but not yet purchasable — the agent-onboarding
 * walkthrough is still being finalized. Drives "Coming soon" badges on both
 * pricing surfaces and a checkout rejection. Flip to false to launch.
 * Admin grants and existing Platinum records are unaffected.
 */
export const PLATINUM_COMING_SOON = true;

export const TIER_LABELS: Record<Tier, string> = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

// ---------------------------------------------------------------------------
// Trial and referral windows.
// ---------------------------------------------------------------------------

/** Everyone gets one free week of Gold. */
export const TRIAL_TIER: Tier = 'gold';
export const TRIAL_DAYS = 7;

/**
 * Referral codes redeemable at checkout. Kept as data so adding a code is a
 * one-line change; when Stripe lands these become coupons and this map is the
 * source of truth for what each code grants.
 */
export interface ReferralGrant {
  tier: Tier;
  days: number;
}

const REFERRAL_CODES: Record<string, ReferralGrant> = {
  emmanueltrades: { tier: 'gold', days: 30 },
};

/** Case-insensitive lookup; returns null for unknown codes. */
export function referralGrantFor(code: string): ReferralGrant | null {
  return REFERRAL_CODES[code.trim().toLowerCase()] ?? null;
}
