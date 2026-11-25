/**
 * Usage analytics — first-party page-visit and click tracking for two sites.
 *
 * Two independent properties report into this module and are kept in
 * separate key spaces so neither's traffic ever colours the other's numbers:
 *
 *   'app'       ConfluenceTrading itself. A single-page dashboard where
 *               "pages" are ?tab=/?subtab= state, so a page is a logical view
 *               path like `/trading/performance`, not a route. Tracked by
 *               components/UsageTracker.tsx.
 *   'mjswrites' mjswrites.com, the static Astro blog. Pages are real paths
 *               (`/blog/luster/`). Tracked by an inline script in that repo's
 *               Base.astro layout, which posts cross-origin to our ingest.
 *
 * Events arrive batched via POST /api/analytics/track and are aggregated into
 * per-day Redis counters; the owner reads them back through
 * GET /api/admin/analytics?site=…, one site at a time.
 *
 * Storage (all daily keys expire after RETENTION_DAYS; `{p}` is the site
 * prefix — "analytics:" for the app, "analytics:mjswrites:" for the blog):
 *   {p}pv:{date}        hash  page → view count
 *   {p}clicks:{date}    hash  "page|label" → click count
 *   {p}ref:{date}       hash  referrer host (or "direct") → pageview count
 *   {p}country:{date}   hash  ISO country → pageview count
 *   {p}visitors:{date}  set   visitor ids ("u:{userId}" or "a:{anonId}")
 *   {p}events           list  recent raw events, newest first, capped
 *
 * The owner's own browsing is bucketed into parallel ":owner"-suffixed daily
 * keys so the dashboard can show real-visitor numbers without the owner's
 * constant testing drowning them out (see getUsageSummary's includeOwner).
 * The raw event feed stays in one list per site and is filtered on read: by
 * the `owner` flag stamped at write time, and (for older app events written
 * before the flag existed) by the owner's visitor id. On the blog there is no
 * login, so the owner is recognised by a shared secret the browser presents
 * (see the ingest route) and only the flag applies.
 *
 * Recording is strictly best-effort — an analytics write must never break a
 * user-facing flow. Days are bucketed in UTC, matching report-rate-limit.ts.
 */

import { getRedisClient } from '@/lib/redis';
import { getUserById, getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';

export type UsageEventType = 'pageview' | 'click';

// Site type + parser live in a pure module so client components can import
// them without dragging this file's Redis client into the browser bundle.
import type { AnalyticsSite } from '@/lib/analytics-sites';
export { ANALYTICS_SITES, parseAnalyticsSite, type AnalyticsSite } from '@/lib/analytics-sites';

export interface UsageEventInput {
  type: UsageEventType;
  /** Logical view path, e.g. "/trading/performance" or "/landing". */
  page: string;
  /** Click target label (button/link text or data-track value). */
  label?: string;
  /**
   * Pageviews only: the external referrer's host ("google.com") or "direct".
   * The blog sends it; the app tracker doesn't, so it's absent there.
   */
  referrer?: string;
}

export interface UsageEvent extends UsageEventInput {
  at: string;
  visitor: string;
  /** Stamped when the event came from the owner, so the feed can hide it. */
  owner?: boolean;
  /** ISO 3166-1 alpha-2 from Vercel's geo header, when known. */
  country?: string;
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
  site: AnalyticsSite;
  generatedAt: string;
  /** False when the owner's own views, clicks and visits were left out. */
  includesOwner: boolean;
  days: UsageDay[];
  /** Unique visitors across the whole window (set union, not a sum of days). */
  rangeVisitors: number;
  rangeViews: number;
  topPages: { page: string; views: number }[];
  topClicks: { page: string; label: string; clicks: number }[];
  /** Where pageviews came from; "direct" when there was no external referrer. */
  topReferrers: { referrer: string; views: number }[];
  /** Pageviews by viewer country, from Vercel's geo header. */
  topCountries: { country: string; views: number }[];
  recentEvents: UsageEventWithLabel[];
}

const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;
const MAX_EVENTS = 500;
/** Hard cap per ingest request — the public endpoint must stay abuse-proof. */
export const MAX_EVENTS_PER_BATCH = 25;
const MAX_FIELD_LENGTH = 80;

/** Owner traffic lives in a parallel key space so it can be excluded on read. */
const OWNER_SUFFIX = ':owner';
/** How deep to scan the shared event list when filtering the owner out. */
const FEED_SCAN_DEPTH = 300;

/**
 * Key prefix per site. The app keeps the original un-namespaced keys so its
 * history survives; every other site is namespaced beneath "analytics:".
 */
function sitePrefix(site: AnalyticsSite): string {
  return site === 'app' ? 'analytics:' : `analytics:${site}:`;
}

function eventsKey(site: AnalyticsSite): string {
  return `${sitePrefix(site)}events`;
}

/** Scratch key for set unions; written and deleted within a single read. */
function rangeTmpKey(site: AnalyticsSite): string {
  return `${sitePrefix(site)}visitors:range-tmp`;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayKeys(site: AnalyticsSite, date: string, owner: boolean) {
  const suffix = owner ? OWNER_SUFFIX : '';
  const p = sitePrefix(site);
  return {
    pv: `${p}pv:${date}${suffix}`,
    clicks: `${p}clicks:${date}${suffix}`,
    ref: `${p}ref:${date}${suffix}`,
    country: `${p}country:${date}${suffix}`,
    visitors: `${p}visitors:${date}${suffix}`,
  };
}

/** Strip the "|" hash-field separator and clamp length. Returns null if empty. */
export function sanitizeField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
  return clean.length > 0 ? clean : null;
}

/**
 * Reduce a raw `document.referrer` to a bare host ("google.com"), or "direct"
 * when there was none. Only the host is kept: referrer paths can carry search
 * terms and other people's private URLs, which we have no business storing.
 * The client already drops same-site referrers, so anything here is external.
 */
export function sanitizeReferrer(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'direct';
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host ? host.slice(0, MAX_FIELD_LENGTH) : 'direct';
  } catch {
    // Not a URL — the client may already have sent a bare host.
    const host = value.trim().toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9.-]{1,80}$/.test(host) ? host : 'direct';
  }
}

/** Vercel's `x-vercel-ip-country` is ISO alpha-2; anything else is dropped. */
export function sanitizeCountry(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value) ? value : null;
}

export interface RecordUsageOptions {
  /** Which property the events belong to. Defaults to the app itself. */
  site?: AnalyticsSite;
  /**
   * Traffic from the owner, routed to the parallel ":owner" counters so the
   * dashboard can hide it. Decided by the caller (session or shared secret).
   */
  isOwner?: boolean;
  /** Viewer country from Vercel's geo header, already sanitized. */
  country?: string | null;
}

export async function recordUsageEvents(
  visitor: string,
  events: UsageEventInput[],
  options: RecordUsageOptions = {},
): Promise<void> {
  const { site = 'app', isOwner = false, country = null } = options;
  try {
    const redis = await getRedisClient();
    const day = utcDay();
    const {
      pv: pvKey,
      clicks: clicksKey,
      ref: refKey,
      country: countryKey,
      visitors: visitorsKey,
    } = dayKeys(site, day, isOwner);
    const eventsListKey = eventsKey(site);
    const at = new Date().toISOString();

    const multi = redis.multi();
    let touchedPv = false;
    let touchedClicks = false;
    let touchedRef = false;
    let touchedCountry = false;

    for (const event of events.slice(0, MAX_EVENTS_PER_BATCH)) {
      if (event.type === 'pageview') {
        multi.hIncrBy(pvKey, event.page, 1);
        touchedPv = true;
        if (event.referrer) {
          multi.hIncrBy(refKey, event.referrer, 1);
          touchedRef = true;
        }
        if (country) {
          multi.hIncrBy(countryKey, country, 1);
          touchedCountry = true;
        }
      } else if (event.type === 'click' && event.label) {
        multi.hIncrBy(clicksKey, `${event.page}|${event.label}`, 1);
        touchedClicks = true;
      } else {
        continue;
      }
      const full: UsageEvent = { ...event, at, visitor };
      if (isOwner) full.owner = true;
      if (country) full.country = country;
      multi.lPush(eventsListKey, JSON.stringify(full));
    }

    multi.sAdd(visitorsKey, visitor);
    // Refreshing the TTL on every write is one cheap command per key and
    // guarantees the retention window even for keys created before a deploy.
    if (touchedPv) multi.expire(pvKey, RETENTION_SECONDS);
    if (touchedClicks) multi.expire(clicksKey, RETENTION_SECONDS);
    if (touchedRef) multi.expire(refKey, RETENTION_SECONDS);
    if (touchedCountry) multi.expire(countryKey, RETENTION_SECONDS);
    multi.expire(visitorsKey, RETENTION_SECONDS);
    multi.lTrim(eventsListKey, 0, MAX_EVENTS - 1);
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
 * @param site          Which property to summarise; sites never mix.
 * @param dayCount      Window length in days, clamped to the retention window.
 * @param includeOwner  When false (the default) the owner's own traffic is left
 *                      out, so the numbers describe real visitors only.
 */
export async function getUsageSummary(
  site: AnalyticsSite,
  dayCount = 14,
  includeOwner = false,
): Promise<UsageSummary> {
  const redis = await getRedisClient();
  const clamped = Math.min(Math.max(dayCount, 1), RETENTION_DAYS);
  // Only the app has owner events that predate the `owner` flag; on the blog
  // the owner has no account, so the flag is the whole story.
  const ownerVisitorId = site === 'app' ? await getOwnerVisitorId() : null;

  const dates: string[] = [];
  const now = Date.now();
  for (let i = clamped - 1; i >= 0; i--) {
    dates.push(new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const pageTotals = new Map<string, number>();
  const clickTotals = new Map<string, number>();
  const refTotals = new Map<string, number>();
  const countryTotals = new Map<string, number>();
  const days: UsageDay[] = [];
  let rangeViews = 0;

  // Each day is the public key space plus, when the owner is included, their
  // parallel one. Sets are unioned rather than summed so a visitor present in
  // both spaces (impossible today, but cheap to be right about) counts once.
  const visitorKeysFor = (date: string) =>
    includeOwner
      ? [dayKeys(site, date, false).visitors, dayKeys(site, date, true).visitors]
      : [dayKeys(site, date, false).visitors];

  const addInto = (totals: Map<string, number>, hash: Record<string, string>) => {
    for (const [field, count] of Object.entries(hash)) {
      totals.set(field, (totals.get(field) ?? 0) + (parseInt(count, 10) || 0));
    }
  };

  for (const date of dates) {
    const spaces = includeOwner ? [false, true] : [false];
    const [pvParts, clickParts, refParts, countryParts, visitors] = await Promise.all([
      Promise.all(spaces.map((owner) => redis.hGetAll(dayKeys(site, date, owner).pv))),
      Promise.all(spaces.map((owner) => redis.hGetAll(dayKeys(site, date, owner).clicks))),
      Promise.all(spaces.map((owner) => redis.hGetAll(dayKeys(site, date, owner).ref))),
      Promise.all(spaces.map((owner) => redis.hGetAll(dayKeys(site, date, owner).country))),
      // Per-day sets hold a handful of ids, so a plain SUNION is cheaper than
      // a store + delete and avoids sharing the scratch key across requests.
      includeOwner
        ? redis.sUnion(visitorKeysFor(date)).then((members) => members.length)
        : redis.sCard(dayKeys(site, date, false).visitors),
    ]);

    let views = 0;
    for (const pv of pvParts) {
      for (const [page, count] of Object.entries(pv)) {
        const n = parseInt(count, 10) || 0;
        views += n;
        pageTotals.set(page, (pageTotals.get(page) ?? 0) + n);
      }
    }
    for (const clicks of clickParts) addInto(clickTotals, clicks);
    for (const refs of refParts) addInto(refTotals, refs);
    for (const countries of countryParts) addInto(countryTotals, countries);
    rangeViews += views;
    days.push({ date, views, visitors });
  }

  const tmpKey = rangeTmpKey(site);
  const rangeVisitors = await redis.sUnionStore(tmpKey, dates.flatMap(visitorKeysFor));
  await redis.del(tmpKey);

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

  const topReferrers = [...refTotals.entries()]
    .map(([referrer, views]) => ({ referrer, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  const topCountries = [...countryTotals.entries()]
    .map(([country, views]) => ({ country, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  // The feed is one shared list per site, so excluding the owner means
  // over-reading and filtering — otherwise a busy owner session would push
  // everyone else out of the first page. The `owner` flag covers everything
  // written since it existed; the visitor-id match covers older app events.
  const rawEvents: string[] = await redis.lRange(
    eventsKey(site),
    0,
    includeOwner ? 49 : FEED_SCAN_DEPTH - 1,
  );
  const parsedEvents = rawEvents
    .map((r) => {
      try {
        return JSON.parse(r) as UsageEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is UsageEvent => !!e)
    .filter((e) => includeOwner || !(e.owner || (ownerVisitorId !== null && e.visitor === ownerVisitorId)))
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
    site,
    generatedAt: new Date().toISOString(),
    includesOwner: includeOwner,
    days,
    rangeVisitors,
    rangeViews,
    topPages,
    topClicks,
    topReferrers,
    topCountries,
    recentEvents,
  };
}
