/**
 * Unit tests for the pairing / metrics / rules engines beyond the golden
 * fixture: zero-crossing fills, leftover open positions, scale-ins, tail
 * losses, and the pre-trade checks the execution service enforces.
 */

import { describe, expect, it } from 'vitest';
import { applyRiskUnit, pairExecutions } from '@/lib/confluence/review/pairing';
import { computeMetrics } from '@/lib/confluence/review/metrics';
import { checkPreTradeReviewRules, evaluateTradeRules } from '@/lib/confluence/review/rules';
import { parseAmount, splitCsvLine, tosTimestampToEt } from '@/lib/confluence/review/parser';
import { DEFAULT_RISK_CONFIG, type ReviewExecution, type RoundTrip } from '@/types/confluence-review';

let seq = 0;
function fill(
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
  at: string,
  fees = 0,
): ReviewExecution {
  return {
    id: `f${seq++}`,
    source: 'agentic_rh',
    symbol,
    side,
    qty,
    price,
    fees,
    executedAt: at,
    etDate: at.slice(0, 10),
  };
}

function rt(partial: Partial<RoundTrip> & { symbol: string; netPl: number; etDate: string }): RoundTrip {
  return {
    id: `rt${seq++}`,
    source: 'agentic_rh',
    direction: 'long',
    qty: 100,
    avgEntry: 10,
    avgExit: 10,
    grossPl: partial.netPl,
    fees: 0,
    openedAt: `${partial.etDate}T14:00:00.000Z`,
    closedAt: `${partial.etDate}T15:00:00.000Z`,
    holdingSeconds: 3600,
    executionIds: [],
    entryFills: 1,
    exitFills: 1,
    ...partial,
  };
}

describe('pairing — edge cases', () => {
  it('splits a fill that crosses through zero into two round trips', () => {
    // Long 500, then sell 800: 500 close the long, 300 open a short.
    const { roundTrips, openPositions } = pairExecutions([
      fill('XYZ', 'buy', 500, 10, '2026-07-01T14:00:00.000Z'),
      fill('XYZ', 'sell', 800, 11, '2026-07-01T15:00:00.000Z', 0.8),
      fill('XYZ', 'buy', 300, 10.5, '2026-07-01T16:00:00.000Z'),
    ]);
    expect(roundTrips.length).toBe(2);
    const [long, short] = roundTrips;
    expect(long.direction).toBe('long');
    expect(long.qty).toBe(500);
    expect(long.grossPl).toBeCloseTo(500, 2);
    expect(long.fees).toBeCloseTo(0.5, 2); // 500/800 of the crossing fill's fee
    expect(short.direction).toBe('short');
    expect(short.qty).toBe(300);
    expect(short.grossPl).toBeCloseTo(150, 2); // (11 − 10.5) × 300
    expect(short.fees).toBeCloseTo(0.3, 2);
    expect(openPositions.length).toBe(0);
  });

  it('reports a leftover position as open, not a round trip', () => {
    const { roundTrips, openPositions } = pairExecutions([
      fill('ABC', 'buy', 100, 20, '2026-07-01T14:00:00.000Z'),
      fill('ABC', 'buy', 50, 21, '2026-07-01T15:00:00.000Z'),
      fill('ABC', 'sell', 60, 22, '2026-07-01T16:00:00.000Z'),
    ]);
    expect(roundTrips.length).toBe(0);
    expect(openPositions).toEqual([
      expect.objectContaining({ symbol: 'ABC', qty: 90, openedAt: '2026-07-01T14:00:00.000Z' }),
    ]);
    expect(openPositions[0].avgCost).toBeCloseTo((100 * 20 + 50 * 21) / 150, 4);
  });

  it('averages scale-ins and scale-outs across a single round trip', () => {
    const { roundTrips } = pairExecutions([
      fill('SCL', 'buy', 100, 10, '2026-07-01T14:00:00.000Z'),
      fill('SCL', 'sell', 50, 11, '2026-07-01T14:30:00.000Z'),
      fill('SCL', 'buy', 100, 10.5, '2026-07-01T15:00:00.000Z'),
      fill('SCL', 'sell', 150, 11.5, '2026-07-01T16:00:00.000Z'),
    ]);
    expect(roundTrips.length).toBe(1);
    const t = roundTrips[0];
    expect(t.qty).toBe(200); // total entered
    expect(t.avgEntry).toBeCloseTo(10.25, 4);
    expect(t.avgExit).toBeCloseTo((50 * 11 + 150 * 11.5) / 200, 4);
    expect(t.grossPl).toBeCloseTo(50 * 11 + 150 * 11.5 - (100 * 10 + 100 * 10.5), 2);
    expect(t.entryFills).toBe(2);
    expect(t.exitFills).toBe(2);
  });
});

describe('metrics — tail losses and R distribution', () => {
  it('flags any loss beyond maxR × risk unit as a tail loss', () => {
    const trades = applyRiskUnit(
      [
        rt({ symbol: 'AAA', netPl: -80, etDate: '2026-07-01' }), // > $75 line
        rt({ symbol: 'BBB', netPl: -74, etDate: '2026-07-01' }),
        rt({ symbol: 'CCC', netPl: 120, etDate: '2026-07-01' }),
      ],
      DEFAULT_RISK_CONFIG.riskUnitUsd,
    );
    const m = computeMetrics(trades, DEFAULT_RISK_CONFIG, 'agentic_rh');
    expect(m.tailLosses.length).toBe(1);
    expect(m.tailLosses[0].symbol).toBe('AAA');
    expect(m.tailLosses[0].rMultiple).toBeCloseTo(-1.6, 2);
    expect(m.largestWinR).toBeCloseTo(2.4, 2);
    const bucket = (label: string) => m.rDistribution.find((b) => b.bucket === label)!.count;
    expect(bucket('-2R..-1R')).toBe(2);
    expect(bucket('> 2R')).toBe(1);
  });

  it('computes expectancy = winRate×avgWin − lossRate×avgLoss', () => {
    const trades = [
      rt({ symbol: 'AAA', netPl: 100, etDate: '2026-07-01' }),
      rt({ symbol: 'AAA', netPl: -50, etDate: '2026-07-01' }),
    ];
    const m = computeMetrics(trades, DEFAULT_RISK_CONFIG, 'all');
    expect(m.winRate).toBeCloseTo(0.5, 4);
    expect(m.payoffRatio).toBeCloseTo(2, 2);
    expect(m.expectancy).toBeCloseTo(0.5 * 100 - 0.5 * 50, 2);
  });
});

describe('rules — pre-trade checks (agentic path, enforced in code)', () => {
  const ctx = { config: DEFAULT_RISK_CONFIG, agenticTrades: [] as RoundTrip[], activeOrderSymbols: [] as string[] };

  it('requires a stop on every order', () => {
    const res = checkPreTradeReviewRules({ symbol: 'KO', side: 'buy', limitPrice: 60, quantity: 1 }, ctx);
    expect(res).toMatchObject({ ok: false, code: 'stop_required' });
  });

  it('rejects a stop whose max loss exceeds maxR × risk unit ($75)', () => {
    const res = checkPreTradeReviewRules(
      { symbol: 'KO', side: 'buy', limitPrice: 60, quantity: 100, stopPrice: 59 },
      ctx,
    );
    expect(res).toMatchObject({ ok: false, code: 'stop_too_wide' }); // $100 max loss
  });

  it('rejects a stop on the wrong side of the entry (both directions)', () => {
    expect(
      checkPreTradeReviewRules({ symbol: 'KO', side: 'buy', limitPrice: 60, quantity: 10, stopPrice: 61 }, ctx).code,
    ).toBe('stop_too_wide');
    expect(
      checkPreTradeReviewRules({ symbol: 'KO', side: 'sell', limitPrice: 60, quantity: 10, stopPrice: 59 }, ctx).code,
    ).toBe('stop_too_wide');
  });

  it('accepts a correctly bounded stop, long and short', () => {
    expect(
      checkPreTradeReviewRules({ symbol: 'KO', side: 'buy', limitPrice: 60, quantity: 100, stopPrice: 59.3 }, ctx).ok,
    ).toBe(true);
    expect(
      checkPreTradeReviewRules({ symbol: 'KO', side: 'sell', limitPrice: 60, quantity: 100, stopPrice: 60.7 }, ctx).ok,
    ).toBe(true);
  });

  it('rejects proposals in symbols on probation', () => {
    // 3 losing round trips in one session = churn > 2 AND net-negative.
    const history = [
      rt({ symbol: 'TZA', netPl: -20, etDate: '2026-06-30' }),
      rt({ symbol: 'TZA', netPl: -10, etDate: '2026-06-30' }),
      rt({ symbol: 'TZA', netPl: -5, etDate: '2026-06-30' }),
    ];
    const res = checkPreTradeReviewRules(
      { symbol: 'TZA', side: 'buy', limitPrice: 4, quantity: 100, stopPrice: 3.8 },
      { ...ctx, agenticTrades: history },
    );
    expect(res).toMatchObject({ ok: false, code: 'symbol_probation' });
  });

  it('enforces the symbol-breadth cap over open proposals', () => {
    const activeOrderSymbols = Array.from({ length: 15 }, (_, i) => `S${i}`);
    const res = checkPreTradeReviewRules(
      { symbol: 'NEW', side: 'buy', limitPrice: 10, quantity: 10, stopPrice: 9.5 },
      { ...ctx, activeOrderSymbols },
    );
    expect(res).toMatchObject({ ok: false, code: 'breadth_cap' });
    // …but adding to an already-open symbol is fine.
    const ok = checkPreTradeReviewRules(
      { symbol: 'S3', side: 'buy', limitPrice: 10, quantity: 10, stopPrice: 9.5 },
      { ...ctx, activeOrderSymbols },
    );
    expect(ok.ok).toBe(true);
  });

  it('evaluateTradeRules emits tail-loss violations with critical severity', () => {
    const violations = evaluateTradeRules(
      [rt({ symbol: 'NVDA', netPl: -200, etDate: '2026-07-01' })],
      DEFAULT_RISK_CONFIG,
      'agentic_rh',
      '2026-07-02T00:00:00.000Z',
    );
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'tail_loss', severity: 'critical', symbol: 'NVDA' }),
    ]);
  });
});

describe('parser primitives', () => {
  it('parseAmount handles $, parens, thousands, signs, and junk', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('($1,095.28)')).toBe(-1095.28);
    expect(parseAmount('-$0.58')).toBe(-0.58);
    expect(parseAmount('+3.85')).toBe(3.85);
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('N/A')).toBeUndefined();
    expect(parseAmount('CANCELED')).toBeUndefined();
  });

  it('splitCsvLine respects quotes and unwraps Excel ="…" escapes', () => {
    expect(splitCsvLine('a,"1,234.56",=\"9876543210\",b')).toEqual(['a', '1,234.56', '9876543210', 'b']);
  });

  it('converts TOS UTC exec times to ET session dates (incl. the after-hours rollover)', () => {
    // 01:30 UTC on 7/3 is 21:30 ET on 7/2 — must stay on the 7/2 session.
    const late = tosTimestampToEt('7/3/26', '01:30:00');
    expect(late!.etDate).toBe('2026-07-02');
    const short = tosTimestampToEt('7/2/26', '21:24:15');
    expect(short!.etDate).toBe('2026-07-02');
    expect(short!.etTime).toBe('17:24:15');
  });
});
