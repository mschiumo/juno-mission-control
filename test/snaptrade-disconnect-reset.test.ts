/**
 * Integration exercise of the disconnect trade-reset cycle against a LOCAL
 * Redis sandbox: manual trades → connect (clearManualTrades + broker sync
 * replace) → disconnect (restore backup, drop it) → reconnect snapshots the
 * restored list fresh. Mirrors the sequence /api/snaptrade/disconnect runs.
 *
 * Runs ONLY when Redis is reachable on localhost (the dev sandbox). It skips
 * itself everywhere else — CI, Vercel, or a machine pointing at a remote
 * Redis — so it can never touch production state.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import type { Trade } from '@/types/trading';

const configuredUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
const isLocalRedis = /localhost|127\.0\.0\.1/.test(configuredUrl);

let redisUp = false;
if (isLocalRedis) {
  try {
    const { getRedisClient } = await import('@/lib/redis');
    const client = await Promise.race([
      getRedisClient(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    await client.ping();
    redisUp = true;
  } catch {
    redisUp = false;
  }
}

const userId = `disconnect-reset-${randomUUID()}`;

function makeTrade(id: string, source: Trade['source']): Trade {
  return {
    id,
    symbol: 'AAPL',
    side: 'LONG',
    status: 'CLOSED',
    entryDate: '2026-08-03T14:30:00.000Z',
    exitDate: '2026-08-03T15:30:00.000Z',
    entryPrice: 100,
    exitPrice: 101,
    quantity: 10,
    source,
    createdAt: '2026-08-03T15:30:00.000Z',
    updatedAt: '2026-08-03T15:30:00.000Z',
  } as unknown as Trade;
}

describe.runIf(redisUp)('disconnect trade reset (local redis)', () => {
  afterAll(async () => {
    const { getRedisClient } = await import('@/lib/redis');
    const redis = await getRedisClient();
    const keys = await redis.keys(`*${userId}*`);
    if (keys.length > 0) await redis.del(keys);
  });

  it('restores pre-broker trades and drops the backup so reconnect snapshots fresh', async () => {
    const {
      saveTrades,
      getAllTrades,
      clearManualTrades,
      replaceAllTrades,
      restoreTradesBackup,
      clearAllTrades,
      clearTradesBackup,
    } = await import('@/lib/db/trades-v2');

    // Pre-broker state: two hand-imported trades.
    await saveTrades([makeTrade('manual-1', 'csv'), makeTrade('manual-2', 'manual')], userId);

    // Connect: broker sync replaces the list, manual history backed up + cleared.
    await replaceAllTrades([makeTrade('broker-1', 'broker')], userId, { backup: true });
    await clearManualTrades(userId);
    expect((await getAllTrades(userId)).map(t => t.id)).toEqual(['broker-1']);

    // Disconnect: the route's reset sequence.
    const restored = await restoreTradesBackup(userId);
    if (restored === null) await clearAllTrades(userId);
    await clearTradesBackup(userId);

    expect(restored).toBe(2);
    expect((await getAllTrades(userId)).map(t => t.id).sort()).toEqual(['manual-1', 'manual-2']);

    // Reconnect: with the backup gone, the new snapshot captures the restored
    // list — not the stale first-connect one.
    const { backedUp } = await replaceAllTrades([makeTrade('broker-2', 'broker')], userId, {
      backup: true,
    });
    expect(backedUp).toBe(2);
    expect((await getAllTrades(userId)).map(t => t.id)).toEqual(['broker-2']);
  });

  it('clears the list outright for a user with no pre-broker backup', async () => {
    const freshUser = `${userId}-fresh`;
    const { replaceAllTrades, getAllTrades, restoreTradesBackup, clearAllTrades, clearTradesBackup } =
      await import('@/lib/db/trades-v2');
    const { getRedisClient } = await import('@/lib/redis');

    // Broker-only user: synced trades but the backup key was never written
    // (legacy pre-backup connect).
    await replaceAllTrades([makeTrade('broker-only', 'broker')], freshUser);

    const restored = await restoreTradesBackup(freshUser);
    if (restored === null) await clearAllTrades(freshUser);
    await clearTradesBackup(freshUser);

    expect(restored).toBeNull();
    expect(await getAllTrades(freshUser)).toEqual([]);

    const redis = await getRedisClient();
    const keys = await redis.keys(`*${freshUser}*`);
    if (keys.length > 0) await redis.del(keys);
  });
});
