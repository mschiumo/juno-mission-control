/**
 * Metrics engine for the Performance Review module.
 *
 * PURE FUNCTIONS ONLY — no I/O, no Redis, no LLM. Every number that reaches
 * the UI or the weekly-review narrative is computed here and unit-tested
 * against the golden fixture. The weekly-review agent reads these results;
 * it never does arithmetic that lands in the UI.
 */

import type {
  RBucket,
  ReviewMetrics,
  ReviewSource,
  RiskConfig,
  RoundTrip,
  SymbolAggregate,
} from '@/types/confluence-review';
import { round2 } from './parser';

/** A win/loss must clear this to not be a scratch (avoids 1-cent "wins"). */
const SCRATCH_EPSILON_USD = 0.005;

export interface MetricsOptions {
  source: ReviewSource | 'all';
  /** Restrict to the trailing N distinct sessions (by ET date). */
  trailingSessions?: number;
  /** Restrict to trades whose session date is within [from, to] (YYYY-MM-DD). */
  from?: string;
  to?: string;
}

/** The trailing N distinct ET session dates present in the trades. */
export function trailingSessionDates(trades: RoundTrip[], n: number): string[] {
  const dates = [...new Set(trades.map((t) => t.etDate))].sort();
  return n > 0 ? dates.slice(-n) : dates;
}

export function filterTrades(trades: RoundTrip[], opts: MetricsOptions): RoundTrip[] {
  let out = opts.source === 'all' ? trades : trades.filter((t) => t.source === opts.source);
  if (opts.from) out = out.filter((t) => t.etDate >= opts.from!);
  if (opts.to) out = out.filter((t) => t.etDate <= opts.to!);
  if (opts.trailingSessions) {
    const keep = new Set(trailingSessionDates(out, opts.trailingSessions));
    out = out.filter((t) => keep.has(t.etDate));
  }
  return out;
}

/** Lower bound inclusive, upper exclusive; the ends are open. */
const R_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '< -2R', min: -Infinity, max: -2 },
  { label: '-2R..-1R', min: -2, max: -1 },
  { label: '-1R..0', min: -1, max: 0 },
  { label: '0..1R', min: 0, max: 1 },
  { label: '1R..2R', min: 1, max: 2 },
  { label: '> 2R', min: 2, max: Infinity },
];

function rDistribution(rs: number[]): RBucket[] {
  return R_BUCKETS.map(({ label, min, max }) => ({
    bucket: label,
    count: rs.filter((r) => r >= min && r < max).length,
  }));
}

export function perSymbolAggregates(trades: RoundTrip[]): SymbolAggregate[] {
  const bySymbol = new Map<string, RoundTrip[]>();
  for (const t of trades) {
    const list = bySymbol.get(t.symbol) ?? [];
    list.push(t);
    bySymbol.set(t.symbol, list);
  }
  return [...bySymbol.entries()]
    .map(([symbol, ts]) => {
      const sessions = new Map<string, number>();
      for (const t of ts) sessions.set(t.etDate, (sessions.get(t.etDate) || 0) + 1);
      return {
        symbol,
        trades: ts.length,
        wins: ts.filter((t) => t.netPl > SCRATCH_EPSILON_USD).length,
        losses: ts.filter((t) => t.netPl < -SCRATCH_EPSILON_USD).length,
        grossPl: round2(ts.reduce((s, t) => s + t.grossPl, 0)),
        fees: round2(ts.reduce((s, t) => s + t.fees, 0)),
        netPl: round2(ts.reduce((s, t) => s + t.netPl, 0)),
        sessions: sessions.size,
        maxSessionChurn: Math.max(...sessions.values()),
      };
    })
    .sort((a, b) => b.netPl - a.netPl || a.symbol.localeCompare(b.symbol));
}

/** (session, symbol) pairs whose round-trip count exceeded the threshold. */
export function churnEvents(
  trades: RoundTrip[],
  churnThreshold: number,
): { etDate: string; symbol: string; roundTrips: number }[] {
  const counts = new Map<string, number>();
  for (const t of trades) {
    const key = `${t.etDate}|${t.symbol}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > churnThreshold)
    .map(([key, roundTrips]) => {
      const [etDate, symbol] = key.split('|');
      return { etDate, symbol, roundTrips };
    })
    .sort((a, b) => b.roundTrips - a.roundTrips || a.etDate.localeCompare(b.etDate));
}

/**
 * Compute the full scorecard over an already-filtered set of round trips.
 * R-based figures need each trade's rMultiple set (applyRiskUnit) — trades
 * without one are excluded from the R distribution but counted everywhere
 * else.
 */
export function computeMetrics(
  trades: RoundTrip[],
  config: RiskConfig,
  source: ReviewSource | 'all',
): ReviewMetrics {
  const wins = trades.filter((t) => t.netPl > SCRATCH_EPSILON_USD);
  const losses = trades.filter((t) => t.netPl < -SCRATCH_EPSILON_USD);
  const scratches = trades.length - wins.length - losses.length;
  const decided = wins.length + losses.length;

  const grossPl = round2(trades.reduce((s, t) => s + t.grossPl, 0));
  const fees = round2(trades.reduce((s, t) => s + t.fees, 0));
  const netPl = round2(trades.reduce((s, t) => s + t.netPl, 0));

  const winRate = decided > 0 ? wins.length / decided : undefined;
  const avgWin = wins.length > 0 ? round2(wins.reduce((s, t) => s + t.netPl, 0) / wins.length) : undefined;
  const avgLoss =
    losses.length > 0 ? round2(Math.abs(losses.reduce((s, t) => s + t.netPl, 0) / losses.length)) : undefined;
  const payoffRatio =
    avgWin !== undefined && avgLoss !== undefined && avgLoss > 0
      ? Math.round((avgWin / avgLoss) * 100) / 100
      : undefined;
  const expectancy =
    winRate !== undefined && decided > 0
      ? round2(winRate * (avgWin ?? 0) - (1 - winRate) * (avgLoss ?? 0))
      : undefined;

  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== undefined);
  const tailThresholdUsd = config.maxRMultiple * config.riskUnitUsd;
  const tailLosses = trades
    .filter((t) => t.netPl < -tailThresholdUsd)
    .map((t) => ({
      tradeId: t.id,
      symbol: t.symbol,
      netPl: t.netPl,
      rMultiple: t.rMultiple ?? Math.round((t.netPl / config.riskUnitUsd) * 10000) / 10000,
    }))
    .sort((a, b) => a.netPl - b.netPl);

  return {
    source,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    scratches,
    winRate: winRate !== undefined ? Math.round(winRate * 10000) / 10000 : undefined,
    avgWin,
    avgLoss,
    payoffRatio,
    expectancy,
    grossPl,
    fees,
    netPl,
    feeDragPct: grossPl !== 0 ? Math.round((fees / Math.abs(grossPl)) * 10000) / 10000 : undefined,
    rDistribution: rDistribution(rs),
    largestLossR: rs.length > 0 ? Math.min(...rs) : undefined,
    largestWinR: rs.length > 0 ? Math.max(...rs) : undefined,
    tailLosses,
    perSymbol: perSymbolAggregates(trades),
    breadth: new Set(trades.map((t) => t.symbol)).size,
    sessions: new Set(trades.map((t) => t.etDate)).size,
    churnEvents: churnEvents(trades, config.churnThreshold),
  };
}
