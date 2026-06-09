/**
 * Intraday Movers Scanner
 *
 * Finds stocks that have moved more than `minMovePercent` over a rolling
 * intraday window (default 2h) — a mid-day momentum complement to the
 * overnight Gap Scanner. Only meaningful during the regular session.
 *
 * Strategy (on-demand, two-stage to bound API cost):
 *   1. One Polygon full-market snapshot (reused from the gap scanner) gives
 *      every ticker's current price, today's high/low, and volume.
 *   2. Cheap pre-filter. A stock that moved X% inside the day MUST have a
 *      full-day high-low range of at least X% (the move is a subset of the
 *      day's range). So we filter on day-range >= minMove, plus
 *      price / volume / market-cap / ETF-ADR. This is a NECESSARY condition —
 *      it cannot drop a real mover — and collapses thousands of names to a
 *      handful, so the next stage stays cheap.
 *   3. For each survivor, one Polygon aggregates call yields the price at the
 *      start of the window; we compute the true windowed move and keep
 *      |move| >= minMove.
 *
 * Partial window: before ~2h have elapsed since the 9:30 ET open, the window
 * is clamped to the session open and reported as "since open".
 */

import {
  getMarketSession,
  fetchAllSnapshots,
  isETFOrDerivative,
  isLikelyADRBySymbol,
  type PolygonSnapshot,
  type GapStock,
} from '@/lib/gap-scanner-polygon';
import { getAvgVolumeMap } from '@/lib/avg-volume';
import { getStockInfoMap, type StockInfo } from '@/lib/stock-universe';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

const REGULAR_OPEN_MIN = 9 * 60 + 30; // 9:30 AM ET in minutes-of-day

// Bound the per-ticker fan-out: confirm at most this many candidates, highest
// day-range first, and surface truncation rather than silently capping.
const MAX_SURVIVORS = 250;
const CONCURRENCY = 12;
const BAR_FETCH_TIMEOUT_MS = 8_000;

export interface IntradayScanResult {
  success: boolean;
  data: { gainers: GapStock[]; losers: GapStock[] };
  timestamp: string;
  source: string;
  scanned: number;
  found: number;
  durationMs: number;
  marketSession: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  marketStatus: 'open' | 'closed';
  windowHours: number;
  windowLabel: string;
  isPartialWindow: boolean;
  message?: string;
  filters: {
    minMovePercent: number;
    minVolume: number;
    minMarketCap: number;
    minPrice: number;
    maxPrice: number;
  };
  debug: {
    apiKeyPresent: boolean;
    preFiltered: number;
    barFetched: number;
    truncated: boolean;
    capFilterApplied: boolean;
    skipped: { range: number; volume: number; price: number; cap: number };
  };
}

// ── Time helpers (ET) ────────────────────────────────────────────────────────

/** Offset (ms) to add to a UTC instant to get ET wall-clock. Negative. */
function getEtOffsetMs(at: Date): number {
  const etWall = new Date(at.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const utcWall = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return etWall.getTime() - utcWall.getTime();
}

/** UTC epoch (ms) of today's 9:30 AM ET regular-session open. */
function getSessionOpenMs(at: Date): number {
  const offset = getEtOffsetMs(at);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const mo = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  const openAsUtc = Date.UTC(y, mo - 1, d, Math.floor(REGULAR_OPEN_MIN / 60), REGULAR_OPEN_MIN % 60, 0);
  return openAsUtc - offset;
}

// ── Polygon per-ticker aggregates ────────────────────────────────────────────

/**
 * Price at the start of the window for one ticker: the open of the first
 * 5-minute bar at/after `fromMs`. Returns null on any failure so a single
 * bad ticker never fails the whole scan.
 */
async function fetchWindowStartPrice(ticker: string, fromMs: number, toMs: number): Promise<number | null> {
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
    `/range/5/minute/${fromMs}/${toMs}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BAR_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { t: number; o: number; c: number }[] };
    const bars = json.results;
    if (!bars || bars.length === 0) return null;
    return bars[0].o || bars[0].c || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Run `fn` over `items` with a bounded number of in-flight promises. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Core scan ────────────────────────────────────────────────────────────────

export async function runIntradayScan(
  options: {
    minMovePercent?: number;
    minVolume?: number;
    minMarketCap?: number;
    minPrice?: number;
    maxPrice?: number;
    windowHours?: number;
  } = {},
): Promise<IntradayScanResult> {
  const startTime = Date.now();
  const {
    minMovePercent = 5,
    minVolume = 1_000_000,
    minMarketCap = 50_000_000,
    minPrice = 1,
    maxPrice = 1000,
    windowHours = 2,
  } = options;

  const marketInfo = getMarketSession();

  const base = (extra: Partial<IntradayScanResult>): IntradayScanResult => ({
    success: true,
    data: { gainers: [], losers: [] },
    timestamp: new Date().toISOString(),
    source: 'polygon-intraday',
    scanned: 0,
    found: 0,
    durationMs: Date.now() - startTime,
    marketSession: marketInfo.session,
    marketStatus: marketInfo.marketStatus,
    windowHours,
    windowLabel: `${windowHours}h`,
    isPartialWindow: false,
    filters: { minMovePercent, minVolume, minMarketCap, minPrice, maxPrice },
    debug: {
      apiKeyPresent: !!POLYGON_API_KEY,
      preFiltered: 0,
      barFetched: 0,
      truncated: false,
      capFilterApplied: false,
      skipped: { range: 0, volume: 0, price: 0, cap: 0 },
    },
    ...extra,
  });

  // Intraday momentum only makes sense during the regular session.
  if (marketInfo.session !== 'market-open') {
    return base({ message: 'Intraday movers run during market hours (9:30 AM – 4:00 PM ET).' });
  }
  if (!POLYGON_API_KEY) {
    return base({ success: false, message: 'POLYGON_API_KEY not configured.' });
  }

  // Window bounds. Clamp the start to the session open so the first ~2h after
  // open report a partial "since open" window instead of reaching into
  // pre-market.
  const nowMs = Date.now();
  const sessionOpenMs = getSessionOpenMs(new Date(nowMs));
  const windowMs = windowHours * 60 * 60 * 1000;
  const fromMs = Math.max(sessionOpenMs, nowMs - windowMs);
  const isPartialWindow = nowMs - windowMs < sessionOpenMs;
  const elapsedMin = Math.max(1, Math.round((nowMs - fromMs) / 60_000));
  const windowLabel = isPartialWindow
    ? `since open · ${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`
    : `${windowHours}h`;

  // Stage 1: snapshot + enrichment maps in parallel.
  const [snapshots, avgVolumeMap, infoMap] = await Promise.all([
    fetchAllSnapshots(marketInfo.session),
    getAvgVolumeMap().catch(() => null),
    getStockInfoMap().catch(() => new Map<string, StockInfo>()),
  ]);
  const capFilterApplied = minMarketCap > 0 && infoMap.size > 0;

  // Stage 2: pre-filter on the necessary day-range condition + the standard
  // liquidity/price/cap filters.
  const skipped = { range: 0, volume: 0, price: 0, cap: 0 };
  type Candidate = { snap: PolygonSnapshot; price: number; volume: number; marketCap: number; name: string; dayRange: number };
  const candidates: Candidate[] = [];

  for (const snap of snapshots) {
    if (isETFOrDerivative(snap.ticker) || isLikelyADRBySymbol(snap.ticker)) continue;

    const high = snap.day?.h;
    const low = snap.day?.l;
    const price = snap.lastTrade?.p || snap.min?.c || snap.day?.c;
    if (!price || !high || !low) continue;

    if (price < minPrice || price > maxPrice) { skipped.price++; continue; }

    const avgVol = avgVolumeMap?.[snap.ticker] ?? 0;
    const volume = snap.day?.v || 0;
    const volumeForFilter = avgVol > 0 ? avgVol : volume;
    if (volumeForFilter < minVolume) { skipped.volume++; continue; }

    const info = infoMap.get(snap.ticker);
    const marketCap = info?.marketCap ?? 0;
    if (capFilterApplied && (!info || marketCap < minMarketCap)) { skipped.cap++; continue; }

    const dayRange = ((high - low) / low) * 100;
    if (dayRange < minMovePercent) { skipped.range++; continue; }

    candidates.push({ snap, price, volume, marketCap, name: info?.name || snap.ticker, dayRange });
  }

  // Bound the fan-out: widest day-range first (likeliest movers).
  candidates.sort((a, b) => b.dayRange - a.dayRange);
  const truncated = candidates.length > MAX_SURVIVORS;
  const survivors = candidates.slice(0, MAX_SURVIVORS);
  if (truncated) {
    console.warn(`[IntradayMovers] ${candidates.length} candidates exceeded cap; confirming top ${MAX_SURVIVORS} by day-range`);
  }

  // Stage 3: confirm each survivor's true windowed move via per-ticker bars.
  const startPrices = await mapWithConcurrency(survivors, CONCURRENCY, (c) =>
    fetchWindowStartPrice(c.snap.ticker, fromMs, nowMs),
  );

  const gainers: GapStock[] = [];
  const losers: GapStock[] = [];
  let barFetched = 0;

  survivors.forEach((c, i) => {
    const startPrice = startPrices[i];
    if (!startPrice || startPrice <= 0) return;
    barFetched++;

    const movePercent = ((c.price - startPrice) / startPrice) * 100;
    if (Math.abs(movePercent) < minMovePercent) return;

    const stock: GapStock = {
      symbol: c.snap.ticker,
      name: c.name,
      price: c.price,
      previousClose: startPrice, // window-start price (reuses the GapStock field for the UI)
      gapPercent: Number(movePercent.toFixed(2)),
      volume: c.volume,
      marketCap: c.marketCap,
      status: movePercent > 0 ? 'gainer' : 'loser',
    };
    (movePercent > 0 ? gainers : losers).push(stock);
  });

  gainers.sort((a, b) => b.gapPercent - a.gapPercent);
  losers.sort((a, b) => a.gapPercent - b.gapPercent);

  return base({
    data: { gainers, losers },
    scanned: snapshots.length,
    found: gainers.length + losers.length,
    durationMs: Date.now() - startTime,
    windowLabel,
    isPartialWindow,
    debug: {
      apiKeyPresent: true,
      preFiltered: candidates.length,
      barFetched,
      truncated,
      capFilterApplied,
      skipped,
    },
  });
}
