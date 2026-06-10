/**
 * Intraday Alert scoring + storage.
 *
 * Turns the flat (ticker × window) movers from scanIntradayWindows() into a
 * ranked top-N alert list, and reads/writes the latest snapshot in Redis.
 *
 * Scoring ("what makes a trade optimal"): hard gates already happened in the
 * scan (price / volume / market-cap / day-range / max-spread). Survivors are
 * then ranked by a composite of three factors, each normalized within the run:
 *
 *   score = 0.50·move  +  0.30·relativeVolume  +  0.20·spreadTightness
 *
 * - move: |movePercent|, capped so one halted +300% name can't flatten the pool.
 * - relativeVolume: volume / 90-day avg — conviction, not raw share count.
 * - spreadTightness: inverse of bid-ask spread % (mostly a gate, lowest weight).
 *
 * Redis key: trading:intraday-alerts:latest (global — the scan is market-wide;
 * only the "add to watchlist" action is per-user).
 */

import { getRedisClient } from '@/lib/redis';
import { getMarketSession } from '@/lib/gap-scanner-polygon';
import type { WindowMover } from '@/lib/intraday-movers';
import type { IntradayAlert, IntradayAlertSnapshot } from '@/types/intraday-alerts';

const ALERTS_KEY = 'trading:intraday-alerts:latest';
const ALERTS_TTL_SECONDS = 6 * 60 * 60; // expire well before the next trading day
const TOP_N = 10;
const MAX_MOVE_FOR_SCORE = 50; // cap |move%| for normalization
const WEIGHTS = { move: 0.5, rvol: 0.3, spread: 0.2 };

function windowLabel(hours: number): string {
  return `${hours}H`;
}

/** Min-max normalize to [0,1]; when all values are equal, treat as best (1). */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return (value - min) / (max - min);
}

type ScoredAlert = Omit<IntradayAlert, 'isNew' | 'alreadyAdded'>;

/**
 * Score every (ticker × window) mover, dedupe to one row per ticker (its
 * highest-scoring window), and return the top-N by score.
 */
export function scoreMovers(movers: WindowMover[]): ScoredAlert[] {
  if (movers.length === 0) return [];

  const gVals = movers.map((m) => Math.min(Math.abs(m.movePercent), MAX_MOVE_FOR_SCORE));
  const rvolVals = movers.map((m) => (m.avgVolume && m.avgVolume > 0 ? m.volume / m.avgVolume : null));
  const spreadVals = movers.map((m) => (m.spreadPercent != null ? m.spreadPercent : null));

  const gMin = Math.min(...gVals);
  const gMax = Math.max(...gVals);
  const rvolKnown = rvolVals.filter((v): v is number => v != null);
  const rMin = rvolKnown.length ? Math.min(...rvolKnown) : 0;
  const rMax = rvolKnown.length ? Math.max(...rvolKnown) : 0;
  const spreadKnown = spreadVals.filter((v): v is number => v != null);
  const sMin = spreadKnown.length ? Math.min(...spreadKnown) : 0;
  const sMax = spreadKnown.length ? Math.max(...spreadKnown) : 0;

  const scored: ScoredAlert[] = movers.map((m, i) => {
    const g = normalize(gVals[i], gMin, gMax);
    const rvol = rvolVals[i];
    const v = rvol == null ? 0 : normalize(rvol, rMin, rMax);
    const spread = spreadVals[i];
    // Unknown spread is penalized (0), not treated as tight — an unquotable book
    // is a fill risk, so it shouldn't win on tightness it can't prove.
    const t = spread == null ? 0 : 1 - normalize(spread, sMin, sMax);
    const score = (WEIGHTS.move * g + WEIGHTS.rvol * v + WEIGHTS.spread * t) * 100;

    return {
      symbol: m.symbol,
      name: m.name,
      direction: m.direction,
      windowHours: m.windowHours,
      windowLabel: windowLabel(m.windowHours),
      movePercent: m.movePercent,
      price: m.price,
      spread: m.spread,
      spreadPercent: m.spreadPercent,
      volume: m.volume,
      rvol: rvol != null ? Number(rvol.toFixed(2)) : undefined,
      marketCap: m.marketCap,
      score: Number(score.toFixed(1)),
      triggeredWindows: [m.windowHours],
    };
  });

  // Dedupe by symbol → keep the highest-scoring window, but record every window
  // the ticker triggered under.
  const bySymbol = new Map<string, ScoredAlert>();
  for (const s of scored) {
    const existing = bySymbol.get(s.symbol);
    if (!existing) {
      bySymbol.set(s.symbol, { ...s });
      continue;
    }
    const triggeredWindows = [...new Set([...existing.triggeredWindows, s.windowHours])].sort((a, b) => a - b);
    if (s.score > existing.score) {
      bySymbol.set(s.symbol, { ...s, triggeredWindows });
    } else {
      existing.triggeredWindows = triggeredWindows;
    }
  }

  return [...bySymbol.values()]
    .sort((a, b) => b.score - a.score || Math.abs(b.movePercent) - Math.abs(a.movePercent))
    .slice(0, TOP_N);
}

/** Flag rows not present in the previous scan as new. */
export function markNewAlerts(current: ScoredAlert[], previousSymbols: string[]): IntradayAlert[] {
  const prev = new Set(previousSymbols);
  return current.map((a) => ({ ...a, isNew: !prev.has(a.symbol) }));
}

/** Read the latest snapshot, or null if absent or from a previous trading day. */
export async function getLatestAlerts(): Promise<IntradayAlertSnapshot | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(ALERTS_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as IntradayAlertSnapshot;
    const today = getMarketSession().tradingDate;
    if (snap.tradingDate && snap.tradingDate !== today) return null;
    return snap;
  } catch (err) {
    console.error('[IntradayAlerts] getLatestAlerts failed:', err);
    return null;
  }
}

export async function storeAlerts(snapshot: IntradayAlertSnapshot): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(ALERTS_KEY, JSON.stringify(snapshot), { EX: ALERTS_TTL_SECONDS });
}
