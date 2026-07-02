/**
 * system_state — the single global control record for ConfluenceTrading
 * (kill switch + paper mode + pinned agentic account + exposure caps).
 *
 * The canonical schema models this as a single-row table. Here it's one Redis
 * object; since the feature is root-user-only it's keyed by the owner's userId.
 * Reads always return a fully-populated object (defaults merged) so the
 * execution service can rely on every control being present. Ships DISARMED
 * (trading_enabled = false) and in paper mode.
 */

import { getRedisClient } from '@/lib/redis';
import type { SystemState } from '@/types/confluence';
import { DEFAULT_SYSTEM_STATE } from '@/types/confluence';

function stateKey(userId: string): string {
  return `confluence:system-state:${userId}`;
}

/** Fetch system state, filling any missing field from defaults. Never null. */
export async function getSystemState(userId: string): Promise<SystemState> {
  const base: SystemState = { ...DEFAULT_SYSTEM_STATE, updatedAt: new Date().toISOString() };
  try {
    const redis = await getRedisClient();
    const data = await redis.get(stateKey(userId));
    if (!data) return base;
    const parsed = JSON.parse(data) as Partial<SystemState>;
    return { ...base, ...parsed };
  } catch (error) {
    console.error('Error getting ConfluenceTrading system state from Redis:', error);
    return base;
  }
}

/**
 * Merge-update system state, re-stamping updatedAt/updatedBy. Numeric caps are
 * coerced to sane non-negative numbers by the API; this layer just persists.
 */
export async function updateSystemState(
  userId: string,
  updates: Partial<Omit<SystemState, 'updatedAt'>>,
  updatedBy?: string,
): Promise<SystemState> {
  const redis = await getRedisClient();
  const current = await getSystemState(userId);
  const next: SystemState = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? current.updatedBy,
  };
  await redis.set(stateKey(userId), JSON.stringify(next));
  return next;
}
