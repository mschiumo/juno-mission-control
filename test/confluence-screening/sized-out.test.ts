/**
 * The sized-out observability seam: a candidate that passes BOTH strategy
 * gates but sizes to < 1 share must be reported via ctx.onSizedOut — and
 * nothing else may fire it. This is what distinguishes "risk budget too
 * small" from "no setups found" in run metadata.
 */

import { describe, expect, it, vi } from 'vitest';
import { evaluateValueTaPullback } from '@/lib/confluence/agent/strategies/value-ta-pullback';
import type { SizedOutCandidate, StrategyContext } from '@/lib/confluence/agent/strategy';
import type { Fundamentals } from '@/lib/confluence/fundamentals';
import type { Technicals } from '@/lib/confluence/technicals';

// Passes the value gate: large cap, cheap, dividend payer, off its high.
const fundamentals: Fundamentals = {
  symbol: 'GOOD',
  price: 100,
  peTtm: 18,
  pbRatio: 3,
  dividendYield: 0.025,
  marketCap: 50e9,
  high52w: 115,
};

// Passes the technical gate: uptrend, pulled back to SMA50, cool RSI, low ATR.
const technicals: Technicals = {
  symbol: 'GOOD',
  asOf: '2026-07-07',
  lastClose: 100,
  barCount: 220,
  sma50: 99,
  sma200: 90,
  rsi14: 45,
  atr14: 2,
  swingLow10: 95,
  avgDollarVolume20: 50e6,
};

const roomyCtx: StrategyContext = { perPositionBudgetUsd: 1000, maxRiskPerTradeUsd: 100 };

describe('value-TA pullback sized-out reporting', () => {
  it('proposes (and stays silent) when at least one share fits the risk budget', () => {
    const onSizedOut = vi.fn();
    const c = evaluateValueTaPullback(fundamentals, technicals, { ...roomyCtx, onSizedOut });
    expect(c).not.toBeNull();
    expect(c!.suggestedQuantity).toBeGreaterThanOrEqual(1);
    expect(onSizedOut).not.toHaveBeenCalled();
  });

  it('reports a gate-passer dropped by a too-small risk budget', () => {
    const reports: SizedOutCandidate[] = [];
    const ctx: StrategyContext = {
      perPositionBudgetUsd: 1000,
      maxRiskPerTradeUsd: 3, // one share risks ~$5 — sizes to zero
      onSizedOut: (info) => reports.push(info),
    };
    expect(evaluateValueTaPullback(fundamentals, technicals, ctx)).toBeNull();
    expect(reports).toHaveLength(1);
    expect(reports[0].symbol).toBe('GOOD');
    expect(reports[0].riskBudgetUsd).toBe(3);
    expect(reports[0].riskPerShare).toBeGreaterThan(3);
    expect(reports[0].entry).toBeCloseTo(99.5, 2);
    expect(reports[0].perPositionBudgetUsd).toBe(1000);
  });

  it('reports when the per-position budget cannot buy one share', () => {
    const onSizedOut = vi.fn();
    const ctx: StrategyContext = {
      perPositionBudgetUsd: 50, // entry ~$99.50 — budget cap sizes to zero
      maxRiskPerTradeUsd: 100,
      onSizedOut,
    };
    expect(evaluateValueTaPullback(fundamentals, technicals, ctx)).toBeNull();
    expect(onSizedOut).toHaveBeenCalledTimes(1);
  });

  it('never fires for gate failures — sized-out means "passed everything but sizing"', () => {
    const onSizedOut = vi.fn();
    const hotRsi: Technicals = { ...technicals, rsi14: 70 };
    expect(evaluateValueTaPullback(fundamentals, hotRsi, { ...roomyCtx, maxRiskPerTradeUsd: 3, onSizedOut })).toBeNull();
    const smallCap: Fundamentals = { ...fundamentals, marketCap: 2e9 };
    expect(evaluateValueTaPullback(smallCap, technicals, { ...roomyCtx, maxRiskPerTradeUsd: 3, onSizedOut })).toBeNull();
    expect(onSizedOut).not.toHaveBeenCalled();
  });

  it('is optional — evaluation works unchanged without the hook', () => {
    const ctx: StrategyContext = { perPositionBudgetUsd: 1000, maxRiskPerTradeUsd: 3 };
    expect(evaluateValueTaPullback(fundamentals, technicals, ctx)).toBeNull();
  });
});
