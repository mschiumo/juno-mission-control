/**
 * Per-user ConfluenceTrading settings + guardrail configuration.
 *
 * One JSON object per user under `confluence:settings:${userId}`. Reads always
 * return a fully-populated object (defaults merged in) so the execution service
 * can rely on the caps and kill switch being present. Starts in PAPER mode.
 */

import { getRedisClient } from '@/lib/redis';
import type { ConfluenceSettings } from '@/types/confluence';
import { DEFAULT_CONFLUENCE_SETTINGS } from '@/types/confluence';

function settingsKey(userId: string): string {
  return `confluence:settings:${userId}`;
}

/** Fetch settings, filling any missing field from defaults. Never null. */
export async function getSettings(userId: string): Promise<ConfluenceSettings> {
  const base: ConfluenceSettings = {
    userId,
    ...DEFAULT_CONFLUENCE_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
  try {
    const redis = await getRedisClient();
    const data = await redis.get(settingsKey(userId));
    if (!data) return base;
    const parsed = JSON.parse(data) as Partial<ConfluenceSettings>;
    return { ...base, ...parsed, userId };
  } catch (error) {
    console.error('Error getting ConfluenceTrading settings from Redis:', error);
    return base;
  }
}

/**
 * Merge-update settings. Identity (userId) is preserved and updatedAt is
 * re-stamped. Numeric caps are coerced to sane non-negative numbers by the
 * caller/API; this layer just persists.
 */
export async function updateSettings(
  userId: string,
  updates: Partial<Omit<ConfluenceSettings, 'userId' | 'updatedAt'>>,
): Promise<ConfluenceSettings> {
  const redis = await getRedisClient();
  const current = await getSettings(userId);
  const next: ConfluenceSettings = {
    ...current,
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(settingsKey(userId), JSON.stringify(next));
  return next;
}
