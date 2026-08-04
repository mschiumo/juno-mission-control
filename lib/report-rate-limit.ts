/**
 * Per-user daily cap on AI report generation.
 *
 * The report endpoints call the Anthropic API on the app's key, so an
 * unthrottled "Regenerate" button lets any signed-in user run up the bill.
 * Each generation increments a per-user, per-feature counter in Redis that
 * expires after two days (long enough to cover any timezone skew on the
 * UTC day bucket).
 *
 * Only count a generation when we're actually about to call Claude — cached
 * reads, archive fetches, and empty-period early returns must not consume
 * from the cap.
 */

import { getRedisClient } from '@/lib/redis';

const DEFAULT_DAILY_LIMIT = 5;

function dailyLimit(): number {
  const parsed = Number(process.env.REPORT_GENERATION_DAILY_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
}

export async function consumeReportGeneration(
  userId: string,
  feature: 'journal-insights' | 'personal-journal-report',
): Promise<RateLimitResult> {
  const limit = dailyLimit();
  const day = new Date().toISOString().slice(0, 10);
  const key = `report-rate-limit:${feature}:${userId}:${day}`;

  const redis = await getRedisClient();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60 * 60 * 48);
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
  };
}

export function rateLimitMessage(limit: number): string {
  return `Daily report limit reached (${limit} per day). Your saved reports are still available — try again tomorrow.`;
}
