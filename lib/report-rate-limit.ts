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
 * from the cap. Where the "is there anything to report on" check lives inside
 * the generator, consume first and `refundReportGeneration` when it comes
 * back empty.
 */

import { getRedisClient } from '@/lib/redis';
import type { ReportRateLimit } from '@/lib/report-limit-ui';

export type ReportFeature =
  | 'journal-insights'
  | 'personal-journal-report'
  | 'portfolio-review';

/**
 * Daily generations allowed per user. Portfolio reviews send the largest
 * context of the three, so they get the tightest cap.
 */
const DAILY_LIMITS: Record<ReportFeature, number> = {
  'journal-insights': 2,
  'personal-journal-report': 2,
  'portfolio-review': 1,
};

/** Per-feature env overrides, so a cap can be tuned without a deploy. */
const LIMIT_ENV_VARS: Record<ReportFeature, string> = {
  'journal-insights': 'JOURNAL_INSIGHTS_DAILY_LIMIT',
  'personal-journal-report': 'PERSONAL_JOURNAL_REPORT_DAILY_LIMIT',
  'portfolio-review': 'PORTFOLIO_REVIEW_DAILY_LIMIT',
};

export function dailyLimit(feature: ReportFeature): number {
  const parsed = Number(process.env[LIMIT_ENV_VARS[feature]]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DAILY_LIMITS[feature];
}

/** Shared with the client so the button and the enforcement agree. */
export type RateLimitResult = ReportRateLimit;

function counterKey(userId: string, feature: ReportFeature): string {
  const day = new Date().toISOString().slice(0, 10);
  return `report-rate-limit:${feature}:${userId}:${day}`;
}

/**
 * Read the current usage without consuming from it — for rendering the UI
 * before the user clicks. Fails open: a Redis blip should not disable
 * everyone's buttons, since the POST path still enforces the real cap.
 */
export async function getReportGenerationStatus(
  userId: string,
  feature: ReportFeature,
): Promise<RateLimitResult> {
  const limit = dailyLimit(feature);

  try {
    const redis = await getRedisClient();
    const raw = await redis.get(counterKey(userId, feature));
    const used = Math.max(0, Number(raw) || 0);
    return {
      allowed: used < limit,
      limit,
      remaining: Math.max(0, limit - used),
      used: Math.min(used, limit),
    };
  } catch (err) {
    console.error(`[RateLimit] Could not read ${feature} status:`, err);
    return { allowed: true, limit, remaining: limit, used: 0 };
  }
}

/**
 * Claim one generation. Increments first and then checks, so concurrent
 * clicks can never slip past the cap.
 */
export async function consumeReportGeneration(
  userId: string,
  feature: ReportFeature,
): Promise<RateLimitResult> {
  const limit = dailyLimit(feature);
  const key = counterKey(userId, feature);

  const redis = await getRedisClient();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60 * 60 * 48);
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    used: Math.min(count, limit),
  };
}

/**
 * Give a claimed generation back when it turned out there was nothing to
 * report on and Claude was never called.
 */
export async function refundReportGeneration(
  userId: string,
  feature: ReportFeature,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.decr(counterKey(userId, feature));
  } catch (err) {
    console.error(`[RateLimit] Could not refund ${feature} generation:`, err);
  }
}

export function rateLimitMessage(limit: number): string {
  return `Daily report limit reached (${limit} per day). Your saved reports are still available — try again tomorrow.`;
}
