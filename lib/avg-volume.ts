/**
 * 90-Day Average Volume Pre-computation
 *
 * Fetches grouped daily bars from Polygon, stores per-date volumes in Redis,
 * and computes a ticker -> avgVolume lookup map used by the gap scanner.
 *
 * Redis keys:
 *   avg_vol:day:{YYYY-MM-DD}  — JSON { [ticker]: volume } for one date
 *   avg_vol:dates              — JSON string[] of stored dates (sorted asc)
 *   avg_vol:map                — JSON { [ticker]: avgVolume } (computed result)
 *   avg_vol:updated            — ISO timestamp of last computation
 */

import { getRedisClient } from '@/lib/redis';
import { US_MARKET_HOLIDAYS } from '@/lib/cron-helpers';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const WINDOW_DAYS = 90;
const MIN_DAYS_FOR_AVG = 20; // require at least 20 days of data per ticker

// ── Trading day helpers ────────────────────────────────────────────────────

export function getTradingDays(endDate: Date, count: number): string[] {
  const days: string[] = [];
  const d = new Date(endDate);

  while (days.length < count) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const iso = d.toISOString().split('T')[0];
    if (US_MARKET_HOLIDAYS.includes(iso)) continue;
    days.push(iso);
  }

  return days.reverse(); // oldest first
}

// ── Polygon API ────────────────────────────────────────────────────────────

export async function fetchGroupedDaily(
  date: string,
): Promise<Record<string, number>> {
  if (!POLYGON_API_KEY) throw new Error('POLYGON_API_KEY is required');

  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Polygon grouped daily ${date}: ${res.status} - ${text}`);
  }

  const data = await res.json();
  if (!data.results || !Array.isArray(data.results)) {
    return {};
  }

  const volumes: Record<string, number> = {};
  for (const bar of data.results) {
    if (bar.T && bar.v > 0) {
      volumes[bar.T] = bar.v;
    }
  }
  return volumes;
}

// ── Redis storage ──────────────────────────────────────────────────────────

export async function storeDayVolume(
  date: string,
  volumes: Record<string, number>,
): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(`avg_vol:day:${date}`, JSON.stringify(volumes));

  // Update the dates list
  const raw = await redis.get('avg_vol:dates');
  const dates: string[] = raw ? JSON.parse(raw) : [];
  if (!dates.includes(date)) {
    dates.push(date);
    dates.sort();
    await redis.set('avg_vol:dates', JSON.stringify(dates));
  }
}

export async function getStoredDates(): Promise<string[]> {
  const redis = await getRedisClient();
  const raw = await redis.get('avg_vol:dates');
  return raw ? JSON.parse(raw) : [];
}

export async function pruneOldDates(keepCount: number): Promise<string[]> {
  const redis = await getRedisClient();
  const raw = await redis.get('avg_vol:dates');
  const dates: string[] = raw ? JSON.parse(raw) : [];

  if (dates.length <= keepCount) return [];

  const toRemove = dates.slice(0, dates.length - keepCount);
  const toKeep = dates.slice(dates.length - keepCount);

  for (const date of toRemove) {
    await redis.del(`avg_vol:day:${date}`);
  }
  await redis.set('avg_vol:dates', JSON.stringify(toKeep));

  return toRemove;
}

export async function recomputeAverages(): Promise<{ tickerCount: number }> {
  const redis = await getRedisClient();
  const dates = await getStoredDates();

  if (dates.length === 0) return { tickerCount: 0 };

  // Accumulate totals per ticker
  const totals: Record<string, { sum: number; count: number }> = {};

  for (const date of dates) {
    const raw = await redis.get(`avg_vol:day:${date}`);
    if (!raw) continue;
    const volumes: Record<string, number> = JSON.parse(raw);
    for (const [ticker, vol] of Object.entries(volumes)) {
      if (!totals[ticker]) totals[ticker] = { sum: 0, count: 0 };
      totals[ticker].sum += vol;
      totals[ticker].count++;
    }
  }

  // Compute averages (only for tickers with enough data)
  const avgMap: Record<string, number> = {};
  for (const [ticker, { sum, count }] of Object.entries(totals)) {
    if (count >= MIN_DAYS_FOR_AVG) {
      avgMap[ticker] = Math.round(sum / count);
    }
  }

  await redis.set('avg_vol:map', JSON.stringify(avgMap));
  await redis.set('avg_vol:updated', new Date().toISOString());

  return { tickerCount: Object.keys(avgMap).length };
}

/**
 * Fast-path lookup used by the gap scanner.
 * Returns the pre-computed ticker -> avgVolume map, or null if not yet populated.
 */
export async function getAvgVolumeMap(): Promise<Record<string, number> | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get('avg_vol:map');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getBackfillStatus(): Promise<{
  storedDays: number;
  targetDays: number;
  complete: boolean;
  dates: string[];
}> {
  const dates = await getStoredDates();
  return {
    storedDays: dates.length,
    targetDays: WINDOW_DAYS,
    complete: dates.length >= WINDOW_DAYS,
    dates,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch and store a batch of dates, respecting Polygon rate limits.
 * Returns the number of dates successfully fetched.
 */
export async function fetchBatch(
  dates: string[],
  delayMs = 12_500,
): Promise<{ fetched: number; errors: string[] }> {
  let fetched = 0;
  const errors: string[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      const volumes = await fetchGroupedDaily(date);
      await storeDayVolume(date, volumes);
      fetched++;
      console.log(`[AvgVolume] Stored ${date}: ${Object.keys(volumes).length} tickers`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${date}: ${msg}`);
      console.error(`[AvgVolume] Failed ${date}:`, msg);
    }

    // Rate-limit delay between calls (skip after last)
    if (i < dates.length - 1) {
      await sleep(delayMs);
    }
  }

  return { fetched, errors };
}
