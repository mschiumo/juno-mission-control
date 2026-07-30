/**
 * Plans and entitlements — what a user is allowed to use.
 *
 * Pure module (no Redis, no server-only imports) so client components can
 * import the types and predicates alongside API routes and crons.
 *
 * The model is deliberately provider-agnostic. Nothing here knows about Stripe
 * or any other biller: a payment webhook, an admin grant, and the owner
 * override all converge on the same stored record, and every gate reads that
 * one record. Swapping or adding a billing provider later means writing to
 * this store, not touching the gates.
 *
 * Cost note: brokerage access is the entitlement that costs real money —
 * SnapTrade bills per *connected user* per month. A user who loses the
 * entitlement must be deregistered with SnapTrade, or the charge continues for
 * someone who has stopped paying. See revokeBrokerageAccess in
 * lib/db/entitlements.ts; that rule is the whole point of this seam.
 */

export type Plan = 'free' | 'pro';

/** Capabilities a plan can carry. Add here as more paid features appear. */
export interface Entitlements {
  plan: Plan;
  /** Live brokerage sync via SnapTrade. The paid feature. */
  brokerageAccess: boolean;
}

/** Where an entitlement came from — for support, audit, and reconciliation. */
export type EntitlementSource = 'owner' | 'admin' | 'billing';

export interface EntitlementRecord {
  plan: Plan;
  source: EntitlementSource;
  updatedAt: string;
  /**
   * ISO expiry. Absent means "until explicitly revoked" (owner, admin grants).
   * Billing sets this to the end of the paid period, so a lapsed subscription
   * degrades to free on its own even if a webhook is missed.
   */
  expiresAt?: string;
  /** Opaque billing-provider reference (e.g. a subscription id). */
  billingRef?: string;
  /** Free-text reason for admin grants; shown in the admin list. */
  note?: string;
}

export const FREE_ENTITLEMENTS: Entitlements = { plan: 'free', brokerageAccess: false };
export const PRO_ENTITLEMENTS: Entitlements = { plan: 'pro', brokerageAccess: true };

/** Whether a stored record is currently in force (unexpired). */
export function isRecordActive(record: EntitlementRecord | null, now: Date = new Date()): boolean {
  if (!record) return false;
  if (!record.expiresAt) return true;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

/**
 * Resolve a stored record into capabilities. An expired or missing record is
 * free — the safe direction, since the failure mode is "user loses a paid
 * feature" rather than "we keep paying SnapTrade for a non-paying user".
 */
export function entitlementsFor(
  record: EntitlementRecord | null,
  now: Date = new Date(),
): Entitlements {
  if (!isRecordActive(record, now)) return FREE_ENTITLEMENTS;
  return record!.plan === 'pro' ? PRO_ENTITLEMENTS : FREE_ENTITLEMENTS;
}

/** Client-safe predicate mirroring the server gate. */
export function hasBrokerageAccess(entitlements: Entitlements | null | undefined): boolean {
  return entitlements?.brokerageAccess === true;
}
