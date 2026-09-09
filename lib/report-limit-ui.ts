/**
 * Client-safe half of the report rate limit.
 *
 * `lib/report-rate-limit.ts` pulls in the Redis client, so it can't be
 * imported from a component. The shape the API returns and the copy the
 * button shows live here instead, shared by both sides so they can't drift.
 */

export interface ReportRateLimit {
  allowed: boolean;
  limit: number;
  remaining: number;
  used: number;
}

/**
 * Tooltip for the generate button. Returns undefined while the limit is
 * still unknown, so the button carries no tooltip until we have real numbers.
 */
export function reportLimitTooltip(
  rateLimit: ReportRateLimit | null,
  noun = 'report',
): string | undefined {
  if (!rateLimit) return undefined;

  if (rateLimit.remaining > 0) {
    const { remaining, limit } = rateLimit;
    return `${remaining} of ${limit} ${noun} ${remaining === 1 ? 'generation' : 'generations'} left today`;
  }

  return `Daily limit reached — ${rateLimit.limit} per day. Your saved ${noun}s stay available, and the limit resets tomorrow.`;
}
