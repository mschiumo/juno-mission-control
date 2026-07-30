/**
 * Brokerage teardown — the cost-control half of entitlements.
 *
 * SnapTrade bills per *connected user* per month, so a user who stops paying
 * must be deregistered, not merely blocked in the UI. Gating the buttons alone
 * would leave the authorization live and the monthly charge running for
 * someone on the free plan.
 *
 * Deregistration can fail (SnapTrade outage) at a moment when we still want to
 * clear our local record — otherwise a user can get stuck unable to
 * disconnect. That trade-off loses the snaptradeUserId, so failures are pushed
 * to a dead-letter set and retried by the nightly sweep. Without it, an
 * orphaned registration bills forever and is invisible.
 */

import { isSnapTradeConfigured, deleteUser } from '@/lib/snaptrade';
import { getBrokerConnection, deleteBrokerConnection } from '@/lib/db/broker-connections';
import { getRedisClient } from '@/lib/redis';

/** SnapTrade userIds whose deregistration failed and still needs retrying. */
const ORPHAN_KEY = 'broker:snaptrade:orphaned-users';

async function recordOrphan(snaptradeUserId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.sAdd(ORPHAN_KEY, snaptradeUserId);
  } catch (error) {
    console.error('Failed to record orphaned SnapTrade user:', snaptradeUserId, error);
  }
}

export interface DisconnectResult {
  hadConnection: boolean;
  deregistered: boolean;
  /** True when SnapTrade deregistration failed and was queued for retry. */
  orphaned: boolean;
}

/**
 * Fully disconnect a user's brokerage: deregister with SnapTrade (which
 * disables every authorization, stopping the charge) and drop our record.
 * Already-synced trades are left alone — disconnecting is not a delete.
 */
export async function disconnectBrokerage(userId: string): Promise<DisconnectResult> {
  const connection = await getBrokerConnection(userId);
  if (!connection) return { hadConnection: false, deregistered: false, orphaned: false };

  let deregistered = false;
  let orphaned = false;

  if (isSnapTradeConfigured()) {
    try {
      await deleteUser(connection.snaptradeUserId);
      deregistered = true;
    } catch (error) {
      console.error('SnapTrade deleteUser failed; queueing for retry:', error);
      await recordOrphan(connection.snaptradeUserId);
      orphaned = true;
    }
  }

  await deleteBrokerConnection(userId);
  return { hadConnection: true, deregistered, orphaned };
}

/**
 * Retry deregistrations that failed earlier. Each success removes the entry;
 * failures stay queued for the next run.
 */
export async function retryOrphanedDeregistrations(): Promise<{ retried: number; cleared: number }> {
  if (!isSnapTradeConfigured()) return { retried: 0, cleared: 0 };
  let ids: string[] = [];
  try {
    const redis = await getRedisClient();
    ids = await redis.sMembers(ORPHAN_KEY);
  } catch (error) {
    console.error('Failed to read orphaned SnapTrade users:', error);
    return { retried: 0, cleared: 0 };
  }

  let cleared = 0;
  for (const snaptradeUserId of ids) {
    try {
      await deleteUser(snaptradeUserId);
      const redis = await getRedisClient();
      await redis.sRem(ORPHAN_KEY, snaptradeUserId);
      cleared += 1;
    } catch (error) {
      // Already-deleted users also land here on some SnapTrade errors; leaving
      // them queued is harmless since deleteUser is idempotent in effect.
      console.error('Retry of SnapTrade deleteUser failed for', snaptradeUserId, error);
    }
  }
  return { retried: ids.length, cleared };
}
