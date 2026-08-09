/**
 * Entitlement storage.
 *
 * One record per user in Redis, plus an index of everyone holding a plan so
 * support and the nightly sweep can enumerate them without a keyspace scan.
 *
 * The owner is entitled unconditionally (Platinum) and is never written to
 * the store — that keeps the owner's access working even if billing is
 * misconfigured, and means no one can accidentally revoke it.
 */

import { getRedisClient } from '@/lib/redis';
import { recordPlanEvent } from '@/lib/db/plan-events';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL, isOwnerEmail } from '@/lib/owner';
import {
  type EntitlementRecord,
  type Entitlements,
  type Tier,
  type EntitlementSource,
  entitlementsFor,
  entitlementsForTier,
  isRecordActive,
  tierAtLeast,
  referralGrantFor,
  TRIAL_TIER,
  TRIAL_DAYS,
} from '@/lib/entitlements';

function entitlementKey(userId: string): string {
  return `user:entitlements:${userId}`;
}

/** Timestamp set once when the user consumes their free Gold trial. */
function trialUsedKey(userId: string): string {
  return `user:entitlements:trial-used:${userId}`;
}

/** Timestamp set once when the user redeems a referral code. */
function referralUsedKey(userId: string): string {
  return `user:entitlements:referral-used:${userId}`;
}

/** Set of userIds that hold (or held) a plan record; filter on read. */
const PLAN_INDEX_KEY = 'user:entitlements:paid';

export async function getEntitlementRecord(userId: string): Promise<EntitlementRecord | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(entitlementKey(userId));
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? (parsed as EntitlementRecord) : null;
  } catch (error) {
    console.error('Error reading entitlements:', error);
    return null;
  }
}

/**
 * Resolve a user's capabilities. Pass the session email when you have it to
 * short-circuit the owner check without a Redis read.
 */
export async function getEntitlements(userId: string, email?: string | null): Promise<Entitlements> {
  if (isOwnerEmail(email)) return entitlementsForTier('platinum');
  // No email to hand (crons, agent calls): fall back to resolving the owner id.
  if (email === undefined) {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (owner?.id === userId) return entitlementsForTier('platinum');
  }
  return entitlementsFor(await getEntitlementRecord(userId));
}

export async function setEntitlement(
  userId: string,
  input: {
    tier: Tier;
    source: EntitlementSource;
    expiresAt?: string;
    billingRef?: string;
    note?: string;
  },
): Promise<EntitlementRecord> {
  const redis = await getRedisClient();
  const record: EntitlementRecord = {
    tier: input.tier,
    source: input.source,
    updatedAt: new Date().toISOString(),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.billingRef ? { billingRef: input.billingRef } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  await redis.set(entitlementKey(userId), JSON.stringify(record));
  await redis.sAdd(PLAN_INDEX_KEY, userId);
  return record;
}

/** Remove the record entirely (admin revoke). Leaves the index for the sweep. */
export async function clearEntitlement(userId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(entitlementKey(userId));
}

// ---------------------------------------------------------------------------
// Trial
// ---------------------------------------------------------------------------

/**
 * Mark the one-per-account trial as consumed. Called by the Stripe webhook
 * when a trialing subscription starts — without it a user could cancel and
 * re-subscribe for a fresh free week every time.
 */
export async function markTrialUsed(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(trialUsedKey(userId), new Date().toISOString());
  } catch (error) {
    console.error('Error marking trial used:', error);
  }
}

export async function hasUsedTrial(userId: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    return !!(await redis.get(trialUsedKey(userId)));
  } catch (error) {
    console.error('Error reading trial flag:', error);
    // Fail closed: if we can't tell, don't hand out another trial.
    return true;
  }
}

/**
 * Start the one free week of Gold. Refuses if the trial was already used or
 * the user already holds an active record of Gold or better.
 */
export async function startTrial(
  userId: string,
): Promise<{ ok: true; record: EntitlementRecord } | { ok: false; reason: string }> {
  if (await hasUsedTrial(userId)) {
    return { ok: false, reason: 'Your free trial has already been used.' };
  }
  const existing = await getEntitlementRecord(userId);
  if (isRecordActive(existing) && tierAtLeast(existing!.tier, TRIAL_TIER)) {
    return { ok: false, reason: 'You already have access to everything the trial includes.' };
  }
  const redis = await getRedisClient();
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const record = await setEntitlement(userId, {
    tier: TRIAL_TIER,
    source: 'trial',
    expiresAt,
    note: `${TRIAL_DAYS}-day free trial`,
  });
  await redis.set(trialUsedKey(userId), new Date().toISOString());
  await recordPlanEvent({ type: 'trial_started', userId, detail: `Gold trial until ${expiresAt}` });
  return { ok: true, record };
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

export async function hasRedeemedReferral(userId: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    return !!(await redis.get(referralUsedKey(userId)));
  } catch (error) {
    console.error('Error reading referral flag:', error);
    // Fail closed: if we can't tell, don't allow another redemption.
    return true;
  }
}

/**
 * Redeem a referral code (one per user). The grant replaces the stored record
 * only when it's an upgrade — an active subscriber at the granted tier or
 * higher is told the code has nothing to add.
 */
export async function redeemReferralCode(
  userId: string,
  code: string,
): Promise<{ ok: true; record: EntitlementRecord } | { ok: false; reason: string }> {
  const grant = referralGrantFor(code);
  if (!grant) return { ok: false, reason: 'That referral code is not valid.' };

  if (await hasRedeemedReferral(userId)) {
    return { ok: false, reason: 'You have already redeemed a referral code.' };
  }
  const redis = await getRedisClient();
  const existing = await getEntitlementRecord(userId);
  if (isRecordActive(existing) && tierAtLeast(existing!.tier, grant.tier)) {
    return { ok: false, reason: 'Your current plan already includes everything this code grants.' };
  }
  const expiresAt = new Date(Date.now() + grant.days * 24 * 60 * 60 * 1000).toISOString();
  const record = await setEntitlement(userId, {
    tier: grant.tier,
    source: 'referral',
    expiresAt,
    note: `Referral code ${code.trim()}`,
  });
  await redis.set(referralUsedKey(userId), new Date().toISOString());
  await recordPlanEvent({
    type: 'referral_redeemed',
    userId,
    detail: `Code ${code.trim()} — ${grant.tier} until ${expiresAt}`,
  });
  return { ok: true, record };
}

// ---------------------------------------------------------------------------
// Enumeration for support and the nightly sweep
// ---------------------------------------------------------------------------

/** Every userId that has ever held a plan record — including lapsed ones. */
export async function listPlanUserIds(): Promise<string[]> {
  try {
    const redis = await getRedisClient();
    return await redis.sMembers(PLAN_INDEX_KEY);
  } catch (error) {
    console.error('Error listing plan users:', error);
    return [];
  }
}

/**
 * Users whose record has lapsed below Gold but who are still in the index —
 * i.e. people we may still be paying SnapTrade for. Drives the nightly sweep.
 */
export async function listLapsedBrokerageUserIds(): Promise<string[]> {
  const ids = await listPlanUserIds();
  const lapsed: string[] = [];
  for (const id of ids) {
    const record = await getEntitlementRecord(id);
    if (!isRecordActive(record) || !tierAtLeast(record!.tier, 'gold')) lapsed.push(id);
  }
  return lapsed;
}

/** Drop a user from the index once their lapsed access has been torn down. */
export async function clearPlanIndex(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.sRem(PLAN_INDEX_KEY, userId);
  } catch (error) {
    console.error('Error clearing plan index:', error);
  }
}
