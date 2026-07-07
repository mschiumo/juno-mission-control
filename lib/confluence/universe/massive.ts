/**
 * Massive-backed dynamic screening universe.
 *
 * Builds the agent's watchlist from the whole US market instead of the
 * hardcoded CONFLUENCE_UNIVERSE list:
 *
 *   1. Full-market snapshot — ONE call returns every active US stock
 *      (~10k tickers) with price/volume. Available on Stocks Starter
 *      (15-min delayed, irrelevant for a weekly refresh). Liquidity filter:
 *      session dollar volume ≥ $20M and price ≥ $5.
 *   2. Ticker details for the top survivors by dollar volume — market cap
 *      lives here (the snapshot has none). Keep active US common stocks
 *      (type CS) with cap ≥ $10B.
 *   3. Cache the ranked list in Redis; a weekly cron refreshes it.
 *
 * SELECTION ONLY — nothing here trades or even proposes. The strategy's
 * value/technical gates still judge every symbol per run; a bigger universe
 * means more candidates, never bigger positions.
 *
 * Note: plain-ticker symbols only (A–Z, ≤5 chars). Share classes and units
 * with dots/dashes (BRK.B, preferreds) are deliberately skipped — the
 * downstream Robinhood data rails address plain symbols.
 */

import { getRedisClient } from '@/lib/redis';
import { ConfluenceNotConfigured } from '@/lib/confluence/robinhood/mcp-client';

const DEFAULT_BASE = 'https://api.massive.com';
const CACHE_KEY = 'confluence:universe:massive';
const REQUEST_TIMEOUT_MS = 30_000;

// Liquidity/size thresholds mirror the Value-TA strategy's own floors
// (minAvgDollarVolume, minMarketCapUsd) so the universe never feeds the
// strategy names it would reject on size/liquidity anyway.
const MIN_DOLLAR_VOLUME = 20e6;
const MIN_PRICE = 5;
const MIN_MARKET_CAP = 10e9;
/** How many liquidity survivors get a per-ticker details (market-cap) call. */
const DETAILS_BUDGET = 600;
/** Details-call concurrency — polite to rate limits, still ~20s for 600. */
const DETAILS_CONCURRENCY = 8;

function maxUniverse(): number {
  const n = Number(process.env.CONFLUENCE_UNIVERSE_MAX);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 250;
}

interface SnapshotTicker {
  ticker?: string;
  day?: { c?: number; v?: number; dv?: string | number };
  prevDay?: { c?: number; v?: number };
}

export interface LiquidityCandidate {
  symbol: string;
  dollarVolume: number;
}

export interface UniverseStats {
  snapshotTickers: number;
  liquidityPass: number;
  detailsChecked: number;
  detailsFailed: number;
  final: number;
}

export interface UniverseCache {
  symbols: string[];
  builtAt: string; // ISO
  stats: UniverseStats;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Pure liquidity screen over the snapshot: plain common-stock-looking symbols
 * priced ≥ $5 with ≥ $20M dollar volume, ranked by dollar volume, capped at
 * the details budget. Uses the better of today's and the previous session's
 * dollar volume so a weekend/half-day snapshot doesn't starve the list.
 */
export function liquidityCandidates(
  tickers: SnapshotTicker[],
  budget: number = DETAILS_BUDGET,
): LiquidityCandidate[] {
  const out: LiquidityCandidate[] = [];
  for (const t of tickers) {
    const symbol = (t.ticker || '').toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
    const dayClose = num(t.day?.c);
    const prevClose = num(t.prevDay?.c);
    const price = dayClose && dayClose > 0 ? dayClose : prevClose;
    if (!price || price < MIN_PRICE) continue;

    const dayDv = num(t.day?.dv) ?? (dayClose && num(t.day?.v) ? dayClose * num(t.day?.v)! : 0);
    const prevDv = prevClose && num(t.prevDay?.v) ? prevClose * num(t.prevDay?.v)! : 0;
    const dollarVolume = Math.max(dayDv ?? 0, prevDv);
    if (dollarVolume < MIN_DOLLAR_VOLUME) continue;

    out.push({ symbol, dollarVolume });
  }
  out.sort((a, b) => b.dollarVolume - a.dollarVolume);
  return out.slice(0, budget);
}

interface TickerDetails {
  market_cap?: number;
  type?: string;
  active?: boolean;
}

/** Pure cap/type filter: keep active common stocks with cap ≥ $10B, in rank order. */
export function capFilter(
  candidates: LiquidityCandidate[],
  details: Map<string, TickerDetails>,
  max: number,
): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    const d = details.get(c.symbol);
    if (!d) continue;
    if (d.active === false) continue;
    if (d.type !== undefined && d.type !== 'CS') continue;
    if (!(typeof d.market_cap === 'number' && d.market_cap >= MIN_MARKET_CAP)) continue;
    out.push(c.symbol);
    if (out.length >= max) break;
  }
  return out;
}

function apiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) {
    throw new ConfluenceNotConfigured(
      'Massive is not configured (MASSIVE_API_KEY unset) — required for CONFLUENCE_UNIVERSE_SOURCE=massive.',
    );
  }
  return key;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ConfluenceNotConfigured(`Massive rejected the request (${res.status}) — check MASSIVE_API_KEY.`);
    }
    throw new Error(`Massive request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Rebuild the universe from Massive and cache it in Redis. Throws on systemic
 * failure (bad key, snapshot down, majority of details calls failing) so the
 * cron/report surfaces it — never silently caches a gutted list.
 */
export async function refreshMassiveUniverse(): Promise<UniverseCache> {
  const key = apiKey();
  const base = process.env.MASSIVE_API_URL || DEFAULT_BASE;

  // 1. Whole-market snapshot.
  const snap = await fetchJson<{ tickers?: SnapshotTicker[] }>(
    `${base}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${encodeURIComponent(key)}`,
  );
  const tickers = snap.tickers ?? [];
  if (tickers.length === 0) {
    throw new Error('Massive snapshot returned no tickers — refusing to cache an empty universe.');
  }
  const candidates = liquidityCandidates(tickers);

  // 2. Market cap via ticker details, bounded concurrency, tolerant per symbol.
  const details = new Map<string, TickerDetails>();
  let failed = 0;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const c = candidates[cursor++];
      try {
        const body = await fetchJson<{ results?: TickerDetails }>(
          `${base}/v3/reference/tickers/${encodeURIComponent(c.symbol)}?apiKey=${encodeURIComponent(key)}`,
        );
        if (body.results) details.set(c.symbol, body.results);
        else failed++;
      } catch (err) {
        if (err instanceof ConfluenceNotConfigured) throw err; // auth is systemic — stop
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: DETAILS_CONCURRENCY }, () => worker()));

  if (candidates.length > 0 && failed > candidates.length / 2) {
    throw new Error(
      `Massive details lookups failed for ${failed}/${candidates.length} symbols — refusing to cache a gutted universe.`,
    );
  }

  const symbols = capFilter(candidates, details, maxUniverse());
  if (symbols.length === 0) {
    throw new Error('Universe build produced zero symbols — refusing to cache (check thresholds / entitlements).');
  }

  const cache: UniverseCache = {
    symbols,
    builtAt: new Date().toISOString(),
    stats: {
      snapshotTickers: tickers.length,
      liquidityPass: candidates.length,
      detailsChecked: details.size,
      detailsFailed: failed,
      final: symbols.length,
    },
  };
  const redis = await getRedisClient();
  await redis.set(CACHE_KEY, JSON.stringify(cache));
  return cache;
}

/** Read the cached universe (null when never built or unreadable). */
export async function readUniverseCache(): Promise<UniverseCache | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UniverseCache;
    return Array.isArray(parsed.symbols) && parsed.symbols.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
