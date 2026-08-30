/**
 * Usage analytics — first-party page-visit and click tracking.
 *
 * The app is a single-page dashboard where "pages" are ?tab=/?subtab= state,
 * so a page here is a logical view path like `/trading/performance`, not a
 * route. Events arrive batched from the client tracker (components/
 * UsageTracker.tsx) via POST /api/analytics/track and are aggregated into
 * per-day Redis counters; the owner reads them back through
 * GET /api/admin/analytics.
 *
 * Storage (all daily keys expire after RETENTION_DAYS):
 *   analytics:pv:{date}       hash  page → view count
 *   analytics:clicks:{date}   hash  "page|label" → click count
 *   analytics:visitors:{date} set   visitor ids ("u:{userId}" or "a:{anonId}")
 *   analytics:events          list  recent raw events, newest first, capped
 *
 * Recording is strictly best-effort — an analytics write must never break a
 * user-facing flow. Days are bucketed in UTC, matching report-rate-limit.ts.
 */

import { getRedisClient } from '@/lib/redis';
import { getUserById } from '@/lib/db/users';

export type UsageEventType = 'pageview' | 'click';

export interface UsageEventInput {
  type: UsageEventType;
  /** Logical view path, e.g. "/trading/performance" or "/landing". */
  page: string;
  /** Click target label (button/link text or data-track value). */
  label?: string;
}

export interface UsageEvent extends UsageEventInput {
  at: string;
  visitor: string;
}

export interface UsageEventWithLabel extends UsageEvent {
  /** Human-readable visitor: account email, or "anonymous" for guests. */
  visitorLabel: string;
}

export interface UsageDay {
  date: string;
  views: number;
  visitors: number;
}

export interface UsageSummary {
  generatedAt: string;
  days: UsageDay[];
  /** Unique visitors across the whole window (set union, not a sum of days). */
  rangeVisitors: number;
  rangeViews: number;
  topPages: { page: string; views: number }[];
  topClicks: { page: string; label: string; clicks: number }[];
  recentEvents: UsageEventWithLabel[];
}

const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;
const EVENTS_KEY = 'analytics:events';
const MAX_EVENTS = 500;
/** Hard cap per ingest request — the public endpoint must stay abuse-proof. */
export const MAX_EVENTS_PER_BATCH = 25;
const MAX_FIELD_LENGTH = 80;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Strip the "|" hash-field separator and clamp length. Returns null if empty. */
export function sanitizeField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
  return clean.length > 0 ? clean : null;
}

export async function recordUsageEvents(visitor: string, events: UsageEventInput[]): Promise<void> {
  try {
    const redis = await getRedisClient();
    const day = utcDay();
    const pvKey = `analytics:pv:${day}`;
    const clicksKey = `analytics:clicks:${day}`;
    const visitorsKey = `analytics:visitors:${day}`;
    const at = new Date().toISOString();

    const multi = redis.multi();
    let touchedPv = false;
    let touchedClicks = false;

    for (const event of events.slice(0, MAX_EVENTS_PER_BATCH)) {
      if (event.type === 'pageview') {
        multi.hIncrBy(pvKey, event.page, 1);
        touchedPv = true;
      } else if (event.type === 'click' && event.label) {
        multi.hIncrBy(clicksKey, `${event.page}|${event.label}`, 1);
        touchedClicks = true;
      } else {
        continue;
      }
      const full: UsageEvent = { ...event, at, visitor };
      multi.lPush(EVENTS_KEY, JSON.stringify(full));
    }

    multi.sAdd(visitorsKey, visitor);
    // Refreshing the TTL on every write is one cheap command per key and
    // guarantees the retention window even for keys created before a deploy.
    if (touchedPv) multi.expire(pvKey, RETENTION_SECONDS);
    if (touchedClicks) multi.expire(clicksKey, RETENTION_SECONDS);
    multi.expire(visitorsKey, RETENTION_SECONDS);
    multi.lTrim(EVENTS_KEY, 0, MAX_EVENTS - 1);
    await multi.exec();
  } catch (error) {
    console.error('Failed to record usage events (non-fatal):', error);
  }
}

export async function getUsageSummary(dayCount = 14): Promise<UsageSummary> {
  const redis = await getRedisClient();
  const clamped = Math.min(Math.max(dayCount, 1), RETENTION_DAYS);

  const dates: string[] = [];
  const now = Date.now();
  for (let i = clamped - 1; i >= 0; i--) {
    dates.push(new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const pageTotals = new Map<string, number>();
  const clickTotals = new Map<string, number>();
  const days: UsageDay[] = [];
  let rangeViews = 0;

  for (const date of dates) {
    const [pv, clicks, visitors] = await Promise.all([
      redis.hGetAll(`analytics:pv:${date}`),
      redis.hGetAll(`analytics:clicks:${date}`),
      redis.sCard(`analytics:visitors:${date}`),
    ]);

    let views = 0;
    for (const [page, count] of Object.entries(pv)) {
      const n = parseInt(count, 10) || 0;
      views += n;
      pageTotals.set(page, (pageTotals.get(page) ?? 0) + n);
    }
    for (const [field, count] of Object.entries(clicks)) {
      clickTotals.set(field, (clickTotals.get(field) ?? 0) + (parseInt(count, 10) || 0));
    }
    rangeViews += views;
    days.push({ date, views, visitors });
  }

  const rangeVisitors = await redis.sUnionStore(
    'analytics:visitors:range-tmp',
    dates.map((d) => `analytics:visitors:${d}`),
  );
  await redis.del('analytics:visitors:range-tmp');

  const topPages = [...pageTotals.entries()]
    .map(([page, views]) => ({ page, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  const topClicks = [...clickTotals.entries()]
    .map(([field, clicks]) => {
      const sep = field.indexOf('|');
      return {
        page: sep >= 0 ? field.slice(0, sep) : field,
        label: sep >= 0 ? field.slice(sep + 1) : '',
        clicks,
      };
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 12);

  const rawEvents: string[] = await redis.lRange(EVENTS_KEY, 0, 49);
  const parsedEvents = rawEvents
    .map((r) => {
      try {
        return JSON.parse(r) as UsageEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is UsageEvent => !!e);

  // Resolve "u:{userId}" visitors to emails for the feed — one lookup per
  // distinct visitor, so at most a handful of Redis GETs.
  const visitorLabels = new Map<string, string>();
  for (const event of parsedEvents) {
    if (visitorLabels.has(event.visitor)) continue;
    if (event.visitor.startsWith('u:')) {
      const user = await getUserById(event.visitor.slice(2));
      visitorLabels.set(event.visitor, user?.email ?? 'deleted account');
    } else {
      visitorLabels.set(event.visitor, 'anonymous');
    }
  }
  const recentEvents: UsageEventWithLabel[] = parsedEvents.map((e) => ({
    ...e,
    visitorLabel: visitorLabels.get(e.visitor) ?? 'anonymous',
  }));

  return {
    generatedAt: new Date().toISOString(),
    days,
    rangeVisitors,
    rangeViews,
    topPages,
    topClicks,
    recentEvents,
  };
}
