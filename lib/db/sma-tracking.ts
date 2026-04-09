/**
 * SMA Tracking Database Layer
 *
 * Stores the set of tickers a user has enabled MA tracking on.
 */

import { getRedisClient } from '@/lib/redis';

const SMA_TRACKING_KEY = 'sma:tracked-tickers';

export async function getTrackedTickers(userId: string = 'default'): Promise<string[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${SMA_TRACKING_KEY}:${userId}`);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting tracked tickers:', error);
    return [];
  }
}

export async function addTrackedTicker(ticker: string, userId: string = 'default'): Promise<string[]> {
  const redis = await getRedisClient();
  const existing = await getTrackedTickers(userId);
  const upper = ticker.toUpperCase();
  if (existing.includes(upper)) return existing;
  const updated = [...existing, upper];
  await redis.set(`${SMA_TRACKING_KEY}:${userId}`, JSON.stringify(updated));
  return updated;
}

export async function removeTrackedTicker(ticker: string, userId: string = 'default'): Promise<string[]> {
  const redis = await getRedisClient();
  const existing = await getTrackedTickers(userId);
  const updated = existing.filter(t => t !== ticker.toUpperCase());
  await redis.set(`${SMA_TRACKING_KEY}:${userId}`, JSON.stringify(updated));
  return updated;
}
