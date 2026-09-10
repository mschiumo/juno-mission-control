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
 * The owner's own browsing is bucketed into parallel ":owner"-suffixed daily
 * keys so the dashboard can show real-visitor numbers without the owner's
 * constant testing drowning them out (see getUsageSummary's includeOwner).
 * The raw event feed stays in one list and is filtered on read by visitor id,
 * which means the feed excludes the owner retroactively while the aggregate
 * counters can only do so from the day the split shipped.
 *
 * Recording is strictly best-effort — an analytics write must never break a
 * user-facing flow. Days are bucketed in UTC, matching report-rate-limit.ts.
 */

import { getRedisClient } from '@/lib/redis';
import { getUserById, getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';

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
  /** False when the owner's own views, clicks and visits were left out. */
  includesOwner: boolean;
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

/** Owner traffic lives in a parallel key space so it can be excluded on read. */
const OWNER_SUFFIX = ':owner';
/** Scratch key for set unions; written and deleted within a single read. */
const RANGE_TMP_KEY = 'analytics:visitors:range-tmp';
/** How deep to scan the shared event list when filtering the owner out. */
const FEED_SCAN_DEPTH = 300;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayKeys(date: string, owner: boolean) {
  const suffix = owner ? OWNER_SUFFIX : '';
  return {
    pv: `analytics:pv:${date}${suffix}`,
    clicks: `analytics:clicks:${date}${suffix}`,
    visitors: `analytics:visitors:${date}${suffix}`,
  };
}

/** Strip the "|" hash-field separator and clamp length. Returns null if empty. */
export function sanitizeField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
  return clean.length > 0 ? clean : null;
}

/**
 * @param isOwner  Traffic from the owner's own account, routed to the parallel
 *                 ":owner" counters so the dashboard can hide it.
 */
export async function recordUsageEvents(
  visitor: string,
  events: UsageEventInput[],
  isOwner = false,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const day = utcDay();
    const { pv: pvKey, clicks: clicksKey, visitors: visitorsKey } = dayKeys(day, isOwner);
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

/**
 * The owner's visitor id ("u:{userId}"), or null if the account can't be
 * resolved — in which case the feed simply isn't filtered rather than blanked.
 */
async function getOwnerVisitorId(): Promise<string | null> {
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    return owner ? `u:${owner.id}` : null;
  } catch {
    return null;
  }
}

/**
 * @param dayCount      Window length in days, clamped to the retention window.
 * @param includeOwner  When false (the default) the owner's own traffic is left
 *                      out, so the numbers describe real visitors only.
 */
export async function getUsageSummary(dayCount = 14, includeOwner = false): Promise<UsageSummary> {
  const redis = await getRedisClient();
  const clamped = Math.min(Math.max(dayCount, 1), RETENTION_DAYS);
  const ownerVisitorId = await getOwnerVisitorId();

  const dates: string[] = [];
  const now = Date.now();
  for (let i = clamped - 1; i >= 0; i--) {
    dates.push(new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const pageTotals = new Map<string, number>();
  const clickTotals = new Map<string, number>();
  const days: UsageDay[] = [];
  let rangeViews = 0;

  // Each day is the public key space plus, when the owner is included, their
  // parallel one. Sets are unioned rather than summed so a visitor present in
  // both spaces (impossible today, but cheap to be right about) counts once.
  const visitorKeysFor = (date: string) =>
    includeOwner
      ? [dayKeys(date, false).visitors, dayKeys(date, true).visitors]
      : [dayKeys(date, false).visitors];

  for (const date of dates) {
    const spaces = includeOwner ? [false, true] : [false];
    const [pvParts, clickParts, visitors] = await Promise.all([
      Promise.all(spaces.map((owner) => redis.hGetAll(dayKeys(date, owner).pv))),
      Promise.all(spaces.map((owner) => redis.hGetAll(dayKeys(date, owner).clicks))),
      // Per-day sets hold a handful of ids, so a plain SUNION is cheaper than
      // a store + delete and avoids sharing the scratch key across requests.
      includeOwner
        ? redis.sUnion(visitorKeysFor(date)).then((members) => members.length)
        : redis.sCard(dayKeys(date, false).visitors),
    ]);

    let views = 0;
    for (const pv of pvParts) {
      for (const [page, count] of Object.entries(pv)) {
        const n = parseInt(count, 10) || 0;
        views += n;
        pageTotals.set(page, (pageTotals.get(page) ?? 0) + n);
      }
    }
    for (const clicks of clickParts) {
      for (const [field, count] of Object.entries(clicks)) {
        clickTotals.set(field, (clickTotals.get(field) ?? 0) + (parseInt(count, 10) || 0));
      }
    }
    rangeViews += views;
    days.push({ date, views, visitors });
  }

  const rangeVisitors = await redis.sUnionStore(
    RANGE_TMP_KEY,
    dates.flatMap(visitorKeysFor),
  );
  await redis.del(RANGE_TMP_KEY);

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

  // The feed is one shared list, so excluding the owner means over-reading and
  // filtering — otherwise a busy owner session would push everyone else out of
  // the first page. Filtering by visitor id also works on events recorded
  // before the owner key space existed.
  const rawEvents: string[] = await redis.lRange(EVENTS_KEY, 0, includeOwner ? 49 : FEED_SCAN_DEPTH - 1);
  const parsedEvents = rawEvents
    .map((r) => {
      try {
        return JSON.parse(r) as UsageEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is UsageEvent => !!e)
    .filter((e) => includeOwner || !ownerVisitorId || e.visitor !== ownerVisitorId)
    .slice(0, 50);

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
    includesOwner: includeOwner,
    days,
    rangeVisitors,
    rangeViews,
    topPages,
    topClicks,
    recentEvents,
  };
}
