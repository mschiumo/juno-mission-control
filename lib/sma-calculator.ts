/**
 * SMA Calculator
 *
 * Fetches aggregate candle data from Polygon and computes 20/200 SMAs.
 * Detects proximity and crossover signals.
 */

import {
  SmaTimeframe,
  SMA_TIMEFRAMES,
  TIMEFRAME_CONFIG,
  SmaValue,
  SmaSignal,
  TickerSmaData,
  SMA_PROXIMITY_THRESHOLD,
} from '@/types/sma-tracking';

interface PolygonCandle {
  c: number; // close
  h: number; // high
  l: number; // low
  o: number; // open
  t: number; // timestamp (ms)
  v: number; // volume
}

interface PolygonAggResponse {
  results?: PolygonCandle[];
  status: string;
  resultsCount?: number;
}

// In-memory cache keyed by "TICKER:TIMEFRAME", expires after 30s
const smaCache = new Map<string, { data: SmaValue & { prevSma20: number | null; prevSma200: number | null; prevClose: number | null }; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch aggregate candles from Polygon for a given ticker and timeframe.
 */
async function fetchAggregates(
  ticker: string,
  multiplier: number,
  apiKey: string,
): Promise<PolygonCandle[]> {
  // Need enough candles for 200-period SMA + 1 previous candle for crossover detection.
  // 15-min candles: ~26/day → need ~8 trading days → use 14 calendar days.
  const to = new Date();
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
    `/range/${multiplier}/minute/${formatDate(from)}/${formatDate(to)}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`Polygon aggs error for ${ticker} ${multiplier}min: ${res.status}`);
    return [];
  }

  const data: PolygonAggResponse = await res.json();
  return data.results ?? [];
}

/**
 * Compute a simple moving average over the last `window` close prices.
 */
function computeSma(closes: number[], window: number): number | null {
  if (closes.length < window) return null;
  const slice = closes.slice(-window);
  return slice.reduce((sum, v) => sum + v, 0) / window;
}

/**
 * For a single ticker + timeframe, fetch candles, compute SMAs, and return values.
 */
async function computeTimeframeSma(
  ticker: string,
  timeframe: SmaTimeframe,
  apiKey: string,
): Promise<SmaValue & { prevSma20: number | null; prevSma200: number | null; prevClose: number | null }> {
  const cacheKey = `${ticker}:${timeframe}`;
  const cached = smaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const { multiplier } = TIMEFRAME_CONFIG[timeframe];
  const candles = await fetchAggregates(ticker, multiplier, apiKey);

  if (candles.length === 0) {
    return { sma20: null, sma200: null, currentPrice: null, timestamp: 0, prevSma20: null, prevSma200: null, prevClose: null };
  }

  const closes = candles.map(c => c.c);

  // Current SMAs (all candles)
  const sma20 = computeSma(closes, 20);
  const sma200 = computeSma(closes, 200);
  const currentPrice = closes[closes.length - 1];
  const timestamp = candles[candles.length - 1].t;

  // Previous-candle SMAs (exclude last candle) for crossover detection
  const prevCloses = closes.slice(0, -1);
  const prevSma20 = computeSma(prevCloses, 20);
  const prevSma200 = computeSma(prevCloses, 200);
  const prevClose = prevCloses.length > 0 ? prevCloses[prevCloses.length - 1] : null;

  const result = { sma20, sma200, currentPrice, timestamp, prevSma20, prevSma200, prevClose };
  smaCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * Detect signals for a ticker + timeframe.
 */
function detectSignals(
  timeframe: SmaTimeframe,
  current: { sma20: number | null; sma200: number | null; currentPrice: number | null },
  prev: { sma20: number | null; sma200: number | null; close: number | null },
): SmaSignal[] {
  const signals: SmaSignal[] = [];
  const { currentPrice, sma20, sma200 } = current;
  const label = TIMEFRAME_CONFIG[timeframe].label;

  if (currentPrice == null) return signals;

  // --- Price ↔ SMA proximity & crossovers ---
  const checkSma = (smaVal: number | null, prevSmaVal: number | null, period: 20 | 200) => {
    if (smaVal == null) return;

    const distance = Math.abs(currentPrice - smaVal) / smaVal;
    const priceAbove = currentPrice > smaVal;
    const prevClose = prev.close;

    // Crossover detection (price crossed the SMA since previous candle)
    if (prevClose != null && prevSmaVal != null) {
      const wasAbove = prevClose > prevSmaVal;
      if (priceAbove && !wasAbove) {
        signals.push({
          type: `crossed_above_sma${period}` as SmaSignal['type'],
          timeframe,
          description: `Price crossed above ${period} SMA on ${label}`,
          severity: 'critical',
        });
        return; // Don't also show "approaching" if we just crossed
      }
      if (!priceAbove && wasAbove) {
        signals.push({
          type: `crossed_below_sma${period}` as SmaSignal['type'],
          timeframe,
          description: `Price crossed below ${period} SMA on ${label}`,
          severity: 'critical',
        });
        return;
      }
    }

    // Proximity detection
    if (distance <= SMA_PROXIMITY_THRESHOLD) {
      signals.push({
        type: (priceAbove ? `approaching_sma${period}_from_above` : `approaching_sma${period}_from_below`) as SmaSignal['type'],
        timeframe,
        description: `Price within ${(distance * 100).toFixed(2)}% of ${period} SMA on ${label}`,
        severity: 'warning',
      });
    }
  };

  checkSma(sma20, prev.sma20, 20);
  checkSma(sma200, prev.sma200, 200);

  // --- Golden Cross / Death Cross (20 SMA crosses 200 SMA) ---
  if (sma20 != null && sma200 != null && prev.sma20 != null && prev.sma200 != null) {
    const nowAbove = sma20 > sma200;
    const wasAbove = prev.sma20 > prev.sma200;

    if (nowAbove && !wasAbove) {
      signals.push({
        type: 'golden_cross',
        timeframe,
        description: `Golden Cross: 20 SMA crossed above 200 SMA on ${label}`,
        severity: 'critical',
      });
    } else if (!nowAbove && wasAbove) {
      signals.push({
        type: 'death_cross',
        timeframe,
        description: `Death Cross: 20 SMA crossed below 200 SMA on ${label}`,
        severity: 'critical',
      });
    }
  }

  return signals;
}

/**
 * Compute full SMA data + signals for a single ticker.
 */
export async function computeTickerSmaData(ticker: string, apiKey: string): Promise<TickerSmaData> {
  const timeframes: Record<string, SmaValue> = {};
  const allSignals: SmaSignal[] = [];

  await Promise.all(
    SMA_TIMEFRAMES.map(async (tf) => {
      const result = await computeTimeframeSma(ticker, tf, apiKey);

      timeframes[tf] = {
        sma20: result.sma20 != null ? Math.round(result.sma20 * 100) / 100 : null,
        sma200: result.sma200 != null ? Math.round(result.sma200 * 100) / 100 : null,
        currentPrice: result.currentPrice != null ? Math.round(result.currentPrice * 100) / 100 : null,
        timestamp: result.timestamp,
      };

      const signals = detectSignals(
        tf,
        { sma20: result.sma20, sma200: result.sma200, currentPrice: result.currentPrice },
        { sma20: result.prevSma20, sma200: result.prevSma200, close: result.prevClose },
      );
      allSignals.push(...signals);
    }),
  );

  return {
    ticker,
    timeframes: timeframes as Record<SmaTimeframe, SmaValue>,
    signals: allSignals,
    updatedAt: new Date().toISOString(),
  };
}
