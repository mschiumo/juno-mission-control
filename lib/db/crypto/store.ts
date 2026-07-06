import { getRedisClient } from '@/lib/redis';

/**
 * Shared Redis JSON helpers for the CryptoTrader feature.
 * All keys are namespaced `crypto:` and scoped by userId, matching the
 * `confluence:*:{userId}` convention used by the stock trading feature.
 */

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`crypto store read failed for ${key}:`, error);
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const redis = await getRedisClient();
  const payload = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.set(key, payload, { EX: ttlSeconds });
  } else {
    await redis.set(key, payload);
  }
}

/** Acquire a short-lived mutex (SET NX). Returns true if acquired. */
export async function acquireLock(key: string, ttlSeconds = 60): Promise<boolean> {
  const redis = await getRedisClient();
  const result = await redis.set(key, '1', { NX: true, EX: ttlSeconds });
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(key);
  } catch {
    // Lock expires on its own; ignore.
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
