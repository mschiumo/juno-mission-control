/**
 * Brokerage access teardown — the cost-control half of entitlements.
 *
 * SnapTrade bills per connected user per month, so "user lost Gold" must end
 * in "user deregistered with SnapTrade", not just a hidden button. This is
 * the single teardown path shared by the disconnect route, admin revocation,
 * and the nightly entitlements sweep.
 *
 * If SnapTrade's deleteUser call fails we queue the snaptradeUserId in a
 * dead-letter set and retry from the nightly sweep — otherwise a transient
 * outage during disconnect would leak a connection we pay for forever.
 */

import { getRedisClient } from '@/lib/redis';
import { isSnapTradeConfigured, deleteUser } from '@/lib/snaptrade';
import { getBrokerConnection, deleteBrokerConnection } from '@/lib/db/broker-connections';
import { clearBrokerDailyBalances } from '@/lib/db/balances';
import { clearBrokerDailyFees } from '@/lib/db/fees';

const ORPHAN_KEY = 'broker:snaptrade:orphaned-users';

async function recordOrphan(snaptradeUserId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.sAdd(ORPHAN_KEY, snaptradeUserId);
  } catch (error) {
    console.error('Failed to queue orphaned SnapTrade user for retry:', error);
  }
}

export interface DisconnectResult {
  disconnected: boolean;
  hadConnection: boolean;
  deregistered: boolean;
  /** True when deleteUser failed and the id was queued for the nightly retry. */
  orphaned: boolean;
}

/**
 * Remove a user's brokerage connection end to end: deregister with SnapTrade,
 * delete our stored connection record, and clear the broker-derived balance
 * and fee series so the equity curve falls back to statement uploads instead
 * of a stale broker series. Imported trades in trades-v2 are left intact.
 */
export async function disconnectBrokerage(userId: string): Promise<DisconnectResult> {
  const connection = await getBrokerConnection(userId);
  if (!connection) {
    return { disconnected: true, hadConnection: false, deregistered: false, orphaned: false };
  }

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
  await clearBrokerDailyBalances(userId);
  await clearBrokerDailyFees(userId);
  return { disconnected: true, hadConnection: true, deregistered, orphaned };
}

/** Retry SnapTrade deregistration for every queued orphan. */
export async function retryOrphanedDeregistrations(): Promise<{ retried: number; cleared: number }> {
  if (!isSnapTradeConfigured()) return { retried: 0, cleared: 0 };
  const redis = await getRedisClient();
  const orphans: string[] = await redis.sMembers(ORPHAN_KEY);
  let cleared = 0;
  for (const snaptradeUserId of orphans) {
    try {
      await deleteUser(snaptradeUserId);
      await redis.sRem(ORPHAN_KEY, snaptradeUserId);
      cleared++;
    } catch (error) {
      console.error(`Retry deregistration failed for ${snaptradeUserId}:`, error);
    }
  }
  return { retried: orphans.length, cleared };
}
