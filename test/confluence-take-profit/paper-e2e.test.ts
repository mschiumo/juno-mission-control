/**
 * Paper-mode integration exercise of the take-profit flow against a LOCAL
 * Redis sandbox: entry filled → protective stop placed → target hit →
 * stop cancelled + take-profit limit placed → poll fills it at the target →
 * stop re-placement stays blocked and a duplicate take-profit stands down.
 *
 * Runs ONLY when Redis is reachable on localhost (the dev sandbox). It skips
 * itself everywhere else — CI, Vercel, or a machine pointing at a remote
 * Redis — so it can never touch production state.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import type { ExecutionOrder } from '@/types/confluence';

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

const userId = `tp-e2e-${randomUUID()}`;

describe.runIf(redisUp)('take-profit paper-mode integration (local redis)', () => {
  afterAll(async () => {
    const { getRedisClient } = await import('@/lib/redis');
    const redis = await getRedisClient();
    // Everything this test wrote is namespaced by the throwaway userId,
    // except the paper adapter's per-refId simulation records (7-day TTL).
    const keys = await redis.keys(`*${userId}*`);
    if (keys.length > 0) await redis.del(keys);
  });

  it('runs the whole flow: stop out of the way, limit in at target, fill at target', async () => {
    const { updateSystemState } = await import('@/lib/db/confluence/system-state');
    const { getExitChildrenForEntry, getOrderById, saveOrder } = await import('@/lib/db/confluence/orders');
    const { placeProtectiveStop, placeTakeProfit, refreshOrderStatus } = await import(
      '@/lib/confluence/execution'
    );

    await updateSystemState(userId, { tradingEnabled: true, paperMode: true }, 'tp-e2e');

    // A filled BMY entry with the approved plan denormalized onto it.
    const now = new Date().toISOString();
    const entry: ExecutionOrder = {
      id: randomUUID(),
      proposalId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      symbol: 'BMY',
      accountNumber: 'PAPER',
      side: 'buy',
      type: 'limit',
      kind: 'entry',
      limitPrice: 56.42,
      quantity: 10,
      timeInForce: 'gfd',
      stopPrice: 52,
      targetPrice: 61.5,
      refId: randomUUID(),
      status: 'filled',
      filledQuantity: 10,
      avgFillPrice: 56.42,
      isPaper: true,
      history: [{ status: 'filled', ts: now }],
    };
    await saveOrder(entry, userId);

    // Protective stop chains normally after the fill.
    const stopResult = await placeProtectiveStop(entry.id, userId);
    expect(stopResult.ok).toBe(true);
    expect(stopResult.order?.kind).toBe('protective_stop');
    expect(stopResult.order?.status).toBe('submitted');

    // Target trades through → stop cancelled, take-profit limit placed.
    const tpResult = await placeTakeProfit(entry.id, 61.75, userId);
    expect(tpResult.ok).toBe(true);
    const tp = tpResult.order!;
    expect(tp.kind).toBe('take_profit');
    expect(tp.side).toBe('sell');
    expect(tp.limitPrice).toBe(61.5);
    expect(tp.quantity).toBe(10);
    expect(tp.timeInForce).toBe('gtc');
    expect(tp.status).toBe('submitted');

    const stopAfter = await getOrderById(stopResult.order!.id, userId);
    expect(stopAfter?.status).toBe('cancelled');

    // While the take-profit works, the stop must NOT come back…
    const stopRetry = await placeProtectiveStop(entry.id, userId);
    expect(stopRetry.ok).toBe(false);
    expect(stopRetry.code).toBe('take_profit_active');

    // …and a duplicate take-profit stands down.
    const tpRetry = await placeTakeProfit(entry.id, 61.8, userId);
    expect(tpRetry.ok).toBe(false);
    expect(tpRetry.code).toBe('already_placed');

    // The poll's refresh fills the paper limit at its price — target or better.
    const filled = await refreshOrderStatus(tp.id, userId);
    expect(filled?.status).toBe('filled');
    expect(filled?.avgFillPrice).toBe(61.5);
    expect(filled?.filledQuantity).toBe(10);

    // Position fully exited: entry bought 10, exits sold 10.
    const children = await getExitChildrenForEntry(entry.id, userId);
    const sold = children.reduce((s, c) => s + c.filledQuantity, 0);
    expect(sold).toBe(10);
  });

  it('retreat cycle: pulls the unfilled take-profit and re-arms the stop', async () => {
    const { getOrderById, saveOrder } = await import('@/lib/db/confluence/orders');
    const { placeProtectiveStop, placeTakeProfit, restoreProtectiveStop } = await import(
      '@/lib/confluence/execution'
    );

    const now = new Date().toISOString();
    const entry = {
      id: randomUUID(),
      proposalId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      symbol: 'KO',
      accountNumber: 'PAPER',
      side: 'buy',
      type: 'limit',
      kind: 'entry',
      limitPrice: 60,
      quantity: 5,
      timeInForce: 'gfd',
      stopPrice: 56,
      targetPrice: 66,
      refId: randomUUID(),
      status: 'filled',
      filledQuantity: 5,
      avgFillPrice: 60,
      isPaper: true,
      history: [{ status: 'filled', ts: now }],
    } as ExecutionOrder;
    await saveOrder(entry, userId);

    const stop1 = await placeProtectiveStop(entry.id, userId);
    expect(stop1.ok).toBe(true);

    // Target touched → OCO switches to the take-profit.
    const tp = await placeTakeProfit(entry.id, 66.1, userId);
    expect(tp.ok).toBe(true);

    // Inside the hysteresis band nothing moves…
    const hold = await restoreProtectiveStop(entry.id, 65.9, userId);
    expect(hold.ok).toBe(false);
    expect(hold.code).toBe('not_retreated');

    // …but a real retreat pulls the take-profit and re-arms the stop.
    const restored = await restoreProtectiveStop(entry.id, 65.0, userId);
    expect(restored.ok).toBe(true);
    expect(restored.order?.kind).toBe('protective_stop');
    expect(restored.order?.status).toBe('submitted');
    expect(restored.order?.quantity).toBe(5);

    const pulledTp = await getOrderById(tp.order!.id, userId);
    expect(pulledTp?.status).toBe('cancelled');
  });
});
