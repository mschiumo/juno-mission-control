/**
 * Entitlement storage.
 *
 * One record per user in Redis, plus an index of everyone holding a paid plan
 * so support and the nightly sweep can enumerate them without a keyspace scan.
 *
 * The owner is entitled unconditionally and is never written to the store —
 * that keeps the owner's access working even if billing is misconfigured, and
 * means no one can accidentally revoke it.
 */

import { getRedisClient } from '@/lib/redis';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL, isOwnerEmail } from '@/lib/owner';
import {
  type EntitlementRecord,
  type Entitlements,
  type Plan,
  type EntitlementSource,
  entitlementsFor,
  isRecordActive,
  PRO_ENTITLEMENTS,
} from '@/lib/entitlements';

function entitlementKey(userId: string): string {
  return `user:entitlements:${userId}`;
}

/** Set of userIds currently on a paid plan (may include lapsed ones; filter on read). */
const PAID_INDEX_KEY = 'user:entitlements:paid';

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
  if (isOwnerEmail(email)) return PRO_ENTITLEMENTS;
  // No email to hand (crons, agent calls): fall back to resolving the owner id.
  if (email === undefined) {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (owner?.id === userId) return PRO_ENTITLEMENTS;
  }
  return entitlementsFor(await getEntitlementRecord(userId));
}

export async function setEntitlement(
  userId: string,
  input: { plan: Plan; source: EntitlementSource; expiresAt?: string; billingRef?: string; note?: string },
): Promise<EntitlementRecord> {
  const redis = await getRedisClient();
  const record: EntitlementRecord = {
    plan: input.plan,
    source: input.source,
    updatedAt: new Date().toISOString(),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.billingRef ? { billingRef: input.billingRef } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  await redis.set(entitlementKey(userId), JSON.stringify(record));
  if (input.plan === 'pro') await redis.sAdd(PAID_INDEX_KEY, userId);
  else await redis.sRem(PAID_INDEX_KEY, userId);
  return record;
}

/** Every userId that has ever been marked paid — including lapsed records. */
export async function listPaidUserIds(): Promise<string[]> {
  try {
    const redis = await getRedisClient();
    return await redis.sMembers(PAID_INDEX_KEY);
  } catch (error) {
    console.error('Error listing paid users:', error);
    return [];
  }
}

/**
 * Users whose paid record has lapsed but who are still in the paid index —
 * i.e. people we may still be paying SnapTrade for. Drives the nightly sweep.
 */
export async function listLapsedUserIds(): Promise<string[]> {
  const ids = await listPaidUserIds();
  const lapsed: string[] = [];
  for (const id of ids) {
    const record = await getEntitlementRecord(id);
    if (!isRecordActive(record) || record?.plan !== 'pro') lapsed.push(id);
  }
  return lapsed;
}

/** Drop a user from the paid index once their brokerage access has been torn down. */
export async function clearPaidIndex(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.sRem(PAID_INDEX_KEY, userId);
  } catch (error) {
    console.error('Error clearing paid index:', error);
  }
}
