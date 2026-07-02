/**
 * Daily account-value snapshots for the Performance equity curve.
 *
 * One point per calendar day under `confluence:balance-history:${userId}`
 * (upsert today's). The curve is built as these accumulate — real once the
 * feature is running day to day (and once live balances are available). No
 * external data is stored; just {date, value}.
 */

import { getRedisClient } from '@/lib/redis';
import type { BalancePoint } from '@/types/confluence';

const MAX_POINTS = 400; // ~13 months of daily points

function key(userId: string): string {
  return `confluence:balance-history:${userId}`;
}

export async function getBalanceHistory(userId: string): Promise<BalancePoint[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(key(userId));
    if (!data) return [];
    return (JSON.parse(data).points as BalancePoint[]) || [];
  } catch (error) {
    console.error('Error reading ConfluenceTrading balance history:', error);
    return [];
  }
}

/** Record (or overwrite) today's account-value point. `date` is YYYY-MM-DD. */
export async function recordBalancePoint(userId: string, date: string, value: number): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getBalanceHistory(userId);
    const idx = existing.findIndex((p) => p.date === date);
    if (idx >= 0) {
      existing[idx] = { date, value };
    } else {
      existing.push({ date, value });
    }
    existing.sort((a, b) => (a.date < b.date ? -1 : 1));
    const capped = existing.slice(-MAX_POINTS);
    await redis.set(key(userId), JSON.stringify({ points: capped }));
  } catch (error) {
    console.error('Error recording ConfluenceTrading balance point:', error);
  }
}
