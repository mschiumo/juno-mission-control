/**
 * Trading goal progress + pacing engine.
 *
 * Pure functions that measure a goal's current value from trade history and
 * derive pacing (required run-rate, projected finish) over a holiday-aware,
 * EST trading-day window. Realized P&L is attributed to the day a trade is
 * CLOSED, matching the daily-stats convention.
 */

import { Trade, TradeStatus, SetupQuality } from '@/types/trading';
import {
  GOAL_METRICS,
  type TradingGoal,
  type GoalProgress,
  type GoalMetric,
  type GoalDirection,
  type GoalOutcome,
  type GuardrailResult,
} from '@/types/trading-goals';
import { countTradingDays, tradingDaysInRange } from '@/lib/trading/trading-days';
import { getTodayInEST, getESTDateFromTimestamp } from '@/lib/date-utils';

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** The trading day a trade realizes on: exit date for closed trades, else entry date. */
function tradeDay(t: Trade): string {
  const ts = t.status === TradeStatus.CLOSED && t.exitDate ? t.exitDate : t.entryDate;
  return getESTDateFromTimestamp(ts);
}

function round2(n: number): number {
  if (!isFinite(n)) return n;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

interface MeasureContext {
  startDate: string;
  endDate: string;
  today: string;
  journaledDates?: Set<string>;
}

interface Measurement {
  current: number;
  /** Trades (or days, for journal_consistency) that fed the measurement. */
  sampleSize: number;
}

/** Closed trades carrying a realized P&L whose trading day falls in the window. */
function closedInWindow(trades: Trade[], ctx: MeasureContext): Trade[] {
  return trades.filter((t) => {
    if (t.status !== TradeStatus.CLOSED) return false;
    if (t.netPnL === undefined || t.netPnL === null) return false;
    const day = tradeDay(t);
    return day >= ctx.startDate && day <= ctx.endDate;
  });
}

function sumByDay(cw: Trade[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of cw) {
    const day = tradeDay(t);
    m.set(day, (m.get(day) || 0) + (t.netPnL || 0));
  }
  return m;
}

function countByDay(cw: Trade[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of cw) {
    const day = tradeDay(t);
    m.set(day, (m.get(day) || 0) + 1);
  }
  return m;
}

export function measureMetric(
  metric: GoalMetric,
  trades: Trade[],
  ctx: MeasureContext,
): Measurement {
  const cw = closedInWindow(trades, ctx);

  switch (metric) {
    case 'net_profit': {
      const sum = cw.reduce((s, t) => s + (t.netPnL || 0), 0);
      return { current: round2(sum), sampleSize: cw.length };
    }
    case 'win_rate': {
      if (cw.length === 0) return { current: 0, sampleSize: 0 };
      const wins = cw.filter((t) => (t.netPnL || 0) > 0).length;
      return { current: round2((wins / cw.length) * 100), sampleSize: cw.length };
    }
    case 'profit_factor': {
      const gp = cw
        .filter((t) => (t.netPnL || 0) > 0)
        .reduce((s, t) => s + (t.netPnL || 0), 0);
      const gl = Math.abs(
        cw.filter((t) => (t.netPnL || 0) < 0).reduce((s, t) => s + (t.netPnL || 0), 0),
      );
      const pf = gl > 0 ? gp / gl : gp > 0 ? Infinity : 0;
      return { current: isFinite(pf) ? round2(pf) : pf, sampleSize: cw.length };
    }
    case 'green_days': {
      const days = sumByDay(cw);
      let green = 0;
      for (const v of days.values()) if (v > 0) green++;
      return { current: green, sampleSize: days.size };
    }
    case 'max_drawdown': {
      const sorted = [...cw].sort((a, b) => tradeDay(a).localeCompare(tradeDay(b)));
      let peak = 0;
      let run = 0;
      let maxDD = 0;
      for (const t of sorted) {
        run += t.netPnL || 0;
        if (run > peak) peak = run;
        const dd = peak - run;
        if (dd > maxDD) maxDD = dd;
      }
      return { current: round2(maxDD), sampleSize: cw.length };
    }
    case 'max_daily_loss': {
      const days = sumByDay(cw);
      let worst = 0;
      for (const v of days.values()) if (v < worst) worst = v;
      return { current: round2(Math.max(0, -worst)), sampleSize: cw.length };
    }
    case 'max_trade_loss': {
      let worst = 0;
      for (const t of cw) {
        const p = t.netPnL || 0;
        if (p < worst) worst = p;
      }
      return { current: round2(Math.max(0, -worst)), sampleSize: cw.length };
    }
    case 'max_trades_per_day': {
      const counts = countByDay(cw);
      let max = 0;
      for (const c of counts.values()) if (c > max) max = c;
      return { current: max, sampleSize: cw.length };
    }
    case 'quality_setups': {
      const rated = cw.filter((t) => !!t.setupQuality);
      if (rated.length === 0) return { current: 0, sampleSize: 0 };
      const good = rated.filter(
        (t) => t.setupQuality === SetupQuality.EXCELLENT || t.setupQuality === SetupQuality.GOOD,
      ).length;
      return { current: round2((good / rated.length) * 100), sampleSize: rated.length };
    }
    case 'journal_consistency': {
      const elapsedEnd = ctx.today < ctx.endDate ? ctx.today : ctx.endDate;
      const days = tradingDaysInRange(ctx.startDate, elapsedEnd);
      if (days.length === 0) return { current: 0, sampleSize: 0 };
      const journaled = ctx.journaledDates || new Set<string>();
      const hit = days.filter((d) => journaled.has(d)).length;
      return { current: round2((hit / days.length) * 100), sampleSize: days.length };
    }
    default:
      return { current: 0, sampleSize: 0 };
  }
}

// ---------------------------------------------------------------------------
// Comparison + outcome
// ---------------------------------------------------------------------------

const EPS = 1e-9;

function isMet(direction: GoalDirection, current: number, target: number): boolean {
  const c = round2(current);
  const t = round2(target);
  return direction === 'gte' ? c >= t - EPS : c <= t + EPS;
}

function progressPct(direction: GoalDirection, current: number, target: number): number {
  if (target <= 0) {
    // A zero target: gte is trivially met; lte means "any value > 0 is over budget".
    return direction === 'gte' ? 100 : current > 0 ? 100 : 0;
  }
  if (!isFinite(current)) return 100;
  return clamp((current / target) * 100, 0, 100);
}

function deriveOutcome(args: {
  met: boolean;
  windowEnded: boolean;
  sampleSize: number;
  paced: boolean;
  projectedFinal?: number;
  target: number;
}): GoalOutcome {
  const { met, windowEnded, sampleSize, paced, projectedFinal, target } = args;
  if (sampleSize === 0 && !windowEnded) return 'no_data';
  if (windowEnded) return met ? 'achieved' : 'missed';
  if (met) return 'ahead';
  if (paced) {
    return projectedFinal !== undefined && projectedFinal >= target ? 'on_track' : 'behind';
  }
  return 'behind';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function computeGoalProgress(
  goal: TradingGoal,
  trades: Trade[],
  opts?: { journaledDates?: Set<string>; today?: string },
): GoalProgress {
  const today = opts?.today || getTodayInEST();
  const ctx: MeasureContext = {
    startDate: goal.startDate,
    endDate: goal.endDate,
    today,
    journaledDates: opts?.journaledDates,
  };
  const meta = GOAL_METRICS[goal.metric];
  const { current, sampleSize } = measureMetric(goal.metric, trades, ctx);

  // Trading-day window.
  const total = countTradingDays(goal.startDate, goal.endDate);
  let elapsed: number;
  let daysToEarn: number; // remaining trading days, counting today
  if (today < goal.startDate) {
    elapsed = 0;
    daysToEarn = total;
  } else if (today > goal.endDate) {
    elapsed = total;
    daysToEarn = 0;
  } else {
    elapsed = countTradingDays(goal.startDate, today);
    daysToEarn = countTradingDays(today, goal.endDate);
  }
  const windowEnded = today > goal.endDate;

  const met = isMet(goal.direction, current, goal.target);
  const pct = progressPct(goal.direction, current, goal.target);

  // Pacing — only for cumulative (paced) metrics, which are all gte.
  let requiredPerDay: number | undefined;
  let actualPerDay: number | undefined;
  let projectedFinal: number | undefined;
  if (meta.paced) {
    const gap = Math.max(0, goal.target - current);
    requiredPerDay = daysToEarn > 0 ? round2(gap / daysToEarn) : undefined;
    actualPerDay = elapsed > 0 ? round2(current / elapsed) : undefined;
    projectedFinal = actualPerDay !== undefined ? round2(actualPerDay * total) : undefined;
  }

  const outcome = deriveOutcome({
    met,
    windowEnded,
    sampleSize,
    paced: meta.paced,
    projectedFinal,
    target: goal.target,
  });

  // Guardrails.
  let guardrailResults: GuardrailResult[] | undefined;
  if (goal.guardrails && goal.guardrails.length > 0) {
    guardrailResults = goal.guardrails.map((g) => {
      const gMeta = GOAL_METRICS[g.metric];
      const m = measureMetric(g.metric, trades, ctx);
      return {
        metric: g.metric,
        label: gMeta.label,
        target: g.target,
        direction: g.direction,
        unit: gMeta.unit,
        current: m.current,
        breached: !isMet(g.direction, m.current, g.target),
      };
    });
  }

  return {
    goalId: goal.id,
    metric: goal.metric,
    unit: meta.unit,
    direction: goal.direction,
    target: goal.target,
    current,
    pct,
    met,
    outcome,
    tradingDaysTotal: total,
    tradingDaysElapsed: elapsed,
    tradingDaysRemaining: daysToEarn,
    paced: meta.paced,
    requiredPerDay,
    actualPerDay,
    projectedFinal,
    guardrailResults,
    sampleSize,
  };
}
