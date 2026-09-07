/**
 * General-purpose, Redis-backed fixed-window rate limiter for API routes.
 *
 * The app runs behind Vercel's Node runtime (not the edge), so route handlers
 * can talk to Redis directly — middleware cannot (edge runtime has no TCP), which
 * is why limiting lives in the handlers rather than middleware.
 *
 * Fail-open: if Redis is unavailable the limiter allows the request. A cache
 * outage must never take down signup or the app; abuse protection is a best
 * effort layered on top of the real auth checks.
 *
 * For the per-user daily cap on AI report generation see lib/report-rate-limit.ts.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

/** Best-effort client IP from Vercel/proxy headers. Falls back to 'unknown'. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface RateLimitOptions {
  /** Unique bucket identifier, e.g. `signup:${ip}` or `gap-scan:${userId}`. */
  key: string;
  /** Max requests permitted within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the current window resets (only meaningful when !ok). */
  retryAfter: number;
}

/**
 * Increment the counter for `key` and report whether the request is under the
 * limit. Uses INCR + EXPIRE — the first hit in a window sets the TTL, so the
 * window slides forward once it elapses. Fails open on any Redis error.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const redis = await getRedisClient();
    const redisKey = `ratelimit:${opts.key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, opts.windowSec);
    }
    if (count > opts.limit) {
      let ttl = await redis.ttl(redisKey);
      // TTL can be -1 (no expiry set) if EXPIRE raced/failed — repair it.
      if (ttl < 0) {
        await redis.expire(redisKey, opts.windowSec);
        ttl = opts.windowSec;
      }
      return { ok: false, remaining: 0, retryAfter: ttl };
    }
    return { ok: true, remaining: Math.max(0, opts.limit - count), retryAfter: 0 };
  } catch (err) {
    console.error('Rate limit check failed (failing open):', err);
    return { ok: true, remaining: opts.limit, retryAfter: 0 };
  }
}

/**
 * Convenience wrapper: returns a ready-to-send 429 NextResponse when the limit
 * is exceeded, or null when the request may proceed.
 */
export async function enforceRateLimit(
  opts: RateLimitOptions,
  message = 'Too many requests. Please slow down and try again shortly.',
): Promise<NextResponse | null> {
  const result = await checkRateLimit(opts);
  if (result.ok) return null;
  return NextResponse.json(
    { success: false, error: message },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, result.retryAfter)) } },
  );
}
