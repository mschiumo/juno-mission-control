/**
 * Golden-fixture tests for the Performance Review module (Milestone R-A).
 *
 * The parser + pairing engine MUST reproduce these numbers exactly — they
 * reconcile against the statement's own P/L Day column. Assertions here are
 * limited to the numbers pinned in the milestone spec, so they hold for the
 * synthesized fixture AND for the real 2026-07-02 export if it ever replaces
 * the file at test/fixtures/2026-07-02-AccountStatement.csv.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseAccountStatement } from '@/lib/confluence/review/parser';
import { applyRiskUnit, pairExecutions } from '@/lib/confluence/review/pairing';
import { computeMetrics } from '@/lib/confluence/review/metrics';
import { evaluateTradeRules, probationSymbols } from '@/lib/confluence/review/rules';
import { DEFAULT_RISK_CONFIG, type ReviewExecution } from '@/types/confluence-review';

const csv = readFileSync(join(__dirname, '..', 'fixtures', '2026-07-02-AccountStatement.csv'), 'utf8');

function toExecutions(fills: ReturnType<typeof parseAccountStatement>['fills']): ReviewExecution[] {
  return fills.map((f, i) => ({
    id: `x${i}`,
    source: 'manual_tos' as const,
    symbol: f.symbol,
    side: f.side,
    qty: f.qty,
    price: f.price,
    fees: f.fees,
    executedAt: f.executedAt,
    etDate: f.etDate,
    posEffect: f.posEffect,
    orderType: f.orderType,
  }));
}

describe('golden fixture — parser', () => {
  const parsed = parseAccountStatement(csv);

  it('reads the statement period end as the as-of date', () => {
    expect(parsed.asOfDate).toBe('2026-07-02');
  });

  it('parses all session fills onto the 7/2 ET session', () => {
    expect(parsed.fills.length).toBeGreaterThan(0);
    expect(new Set(parsed.fills.map((f) => f.etDate))).toEqual(new Set(['2026-07-02']));
  });

  it('finds $1.16 of misc fees on the day (Cash Balance section)', () => {
    expect(parsed.feesByDate['2026-07-02']).toBeCloseTo(1.16, 2);
    const attached = parsed.fills.reduce((s, f) => s + f.fees, 0);
    expect(attached + 0).toBeCloseTo(1.16, 2); // all fee rows matched to fills
    expect(parsed.unmatchedFeeRows).toBe(0);
  });

  it('survives the Order History quirks (REJECTED / TRIGGERED / CANCELED partials / STP continuations)', () => {
    expect(parsed.orderHistory.rejected).toBeGreaterThanOrEqual(1);
    expect(parsed.orderHistory.triggered).toBeGreaterThanOrEqual(1);
    expect(parsed.orderHistory.canceled).toBeGreaterThanOrEqual(1);
  });

  it('imports the Profits and Losses section: 158 symbols, OVERALL P/L YTD −$1,095.28', () => {
    expect(parsed.symbolPl.length).toBe(158);
    expect(parsed.overallPlYtd).toBeCloseTo(-1095.28, 2);
    const sum = parsed.symbolPl.reduce((s, r) => s + r.plYtd, 0);
    expect(sum).toBeCloseTo(-1095.28, 2);
  });

  it('reads per-symbol P/L Day for the traded names', () => {
    const day = Object.fromEntries(parsed.symbolPl.map((r) => [r.symbol, r.plDay]));
    expect(day.TZA).toBeCloseTo(-6.44, 2);
    expect(day.MSTR).toBeCloseTo(5.76, 2);
    expect(day.CWD).toBeCloseTo(1.55, 2);
    expect(day.CONL).toBeCloseTo(0.31, 2);
  });
});

describe('golden fixture — FIFO pairing', () => {
  const parsed = parseAccountStatement(csv);
  const { roundTrips, openPositions } = pairExecutions(toExecutions(parsed.fills));

  it('pairs exactly 11 round trips on 7/2: 8 × TZA, 1 × MSTR, 1 × CWD, 1 × CONL', () => {
    expect(roundTrips.length).toBe(11);
    const bySymbol = (sym: string) => roundTrips.filter((t) => t.symbol === sym).length;
    expect(bySymbol('TZA')).toBe(8);
    expect(bySymbol('MSTR')).toBe(1);
    expect(bySymbol('CWD')).toBe(1);
    expect(bySymbol('CONL')).toBe(1);
    expect(openPositions.length).toBe(0);
  });

  it('pairs the TZA SHORT round trip (SELL TO OPEN 500 @ 3.8101 → BUY TO CLOSE @ 3.8199, gross −$4.90)', () => {
    const short = roundTrips.find((t) => t.direction === 'short');
    expect(short).toBeDefined();
    expect(short!.symbol).toBe('TZA');
    expect(short!.qty).toBe(500);
    expect(short!.avgEntry).toBeCloseTo(3.8101, 4);
    expect(short!.avgExit).toBeCloseTo(3.8199, 4);
    expect(short!.grossPl).toBeCloseTo(-4.9, 2);
    // SELL TO OPEN at 21:24:15 UTC.
    expect(short!.openedAt).toBe('2026-07-02T21:24:15.000Z');
  });

  it('pairs the TZA SPLIT-EXIT round trip (BUY 500 @ 3.845; SELL 2 @ 3.85 + SELL 498 @ 3.8201, gross −$12.39)', () => {
    const split = roundTrips.find((t) => t.exitFills === 2 && t.symbol === 'TZA');
    expect(split).toBeDefined();
    expect(split!.direction).toBe('long');
    expect(split!.qty).toBe(500);
    expect(split!.avgEntry).toBeCloseTo(3.845, 4);
    expect(split!.grossPl).toBeCloseTo(-12.39, 2);
  });

  it('reproduces gross P/L by symbol and the +$1.18 session total', () => {
    const gross = (sym: string) =>
      roundTrips.filter((t) => t.symbol === sym).reduce((s, t) => s + t.grossPl, 0);
    expect(gross('TZA')).toBeCloseTo(-6.44, 2);
    expect(gross('MSTR')).toBeCloseTo(5.76, 2);
    expect(gross('CWD')).toBeCloseTo(1.55, 2);
    expect(gross('CONL')).toBeCloseTo(0.31, 2);
    expect(roundTrips.reduce((s, t) => s + t.grossPl, 0)).toBeCloseTo(1.18, 2);
  });

  it('reconciles gross P/L against the statement’s own P/L Day column', () => {
    const day = Object.fromEntries(parsed.symbolPl.map((r) => [r.symbol, r.plDay]));
    for (const sym of ['TZA', 'MSTR', 'CWD', 'CONL']) {
      const gross = roundTrips.filter((t) => t.symbol === sym).reduce((s, t) => s + t.grossPl, 0);
      expect(gross).toBeCloseTo(day[sym]!, 2);
    }
  });

  it('nets fees into the trades: session net = gross $1.18 − fees $1.16 = $0.02', () => {
    const net = roundTrips.reduce((s, t) => s + t.netPl, 0);
    const fees = roundTrips.reduce((s, t) => s + t.fees, 0);
    expect(fees).toBeCloseTo(1.16, 2);
    expect(net).toBeCloseTo(0.02, 2);
  });
});

describe('golden fixture — metrics engine', () => {
  const parsed = parseAccountStatement(csv);
  const { roundTrips } = pairExecutions(toExecutions(parsed.fills));
  const trades = applyRiskUnit(roundTrips, DEFAULT_RISK_CONFIG.riskUnitUsd);
  const metrics = computeMetrics(trades, DEFAULT_RISK_CONFIG, 'manual_tos');

  it('computes the session scorecard', () => {
    expect(metrics.trades).toBe(11);
    expect(metrics.wins).toBe(8);
    expect(metrics.losses).toBe(3);
    expect(metrics.winRate).toBeCloseTo(8 / 11, 3);
    expect(metrics.grossPl).toBeCloseTo(1.18, 2);
    expect(metrics.fees).toBeCloseTo(1.16, 2);
    expect(metrics.netPl).toBeCloseTo(0.02, 2);
    expect(metrics.breadth).toBe(4);
    expect(metrics.sessions).toBe(1);
  });

  it('applies R-multiples against the $50 risk unit', () => {
    const split = trades.find((t) => t.exitFills === 2 && t.symbol === 'TZA')!;
    expect(split.rMultiple).toBeCloseTo(-12.68 / 50, 2); // −12.39 gross − 0.29 fee
    expect(metrics.largestLossR).toBeCloseTo(-12.68 / 50, 2);
    // No trade blew through 1.5R × $50 = $75 → no tail losses on this day.
    expect(metrics.tailLosses).toEqual([]);
  });

  it('flags the 8-round-trip TZA session as churn (threshold 2)', () => {
    expect(metrics.churnEvents).toEqual([{ etDate: '2026-07-02', symbol: 'TZA', roundTrips: 8 }]);
  });
});

describe('golden fixture — rules engine (manual path, observed post-import)', () => {
  const parsed = parseAccountStatement(csv);
  const { roundTrips } = pairExecutions(toExecutions(parsed.fills));
  const trades = applyRiskUnit(roundTrips, DEFAULT_RISK_CONFIG.riskUnitUsd);

  it('puts TZA on probation (net-negative + churn over the window)', () => {
    const probation = probationSymbols(trades, DEFAULT_RISK_CONFIG);
    expect(probation.map((p) => p.symbol)).toEqual(['TZA']);
    expect(probation[0].netPl).toBeCloseTo(-7.6, 2); // −6.44 gross − 1.16 fees
  });

  it('writes churn + probation violations, no tail losses, no breadth breach', () => {
    const violations = evaluateTradeRules(trades, DEFAULT_RISK_CONFIG, 'manual_tos', '2026-07-02T22:00:00.000Z');
    const rules = violations.map((v) => v.rule).sort();
    expect(rules).toEqual(['churn', 'probation_symbol']);
    const churn = violations.find((v) => v.rule === 'churn')!;
    expect(churn.symbol).toBe('TZA');
    expect(churn.etDate).toBe('2026-07-02');
  });

  it('is deterministic: recomputing yields identical violation ids', () => {
    const a = evaluateTradeRules(trades, DEFAULT_RISK_CONFIG, 'manual_tos', '2026-07-02T22:00:00.000Z');
    const b = evaluateTradeRules(trades, DEFAULT_RISK_CONFIG, 'manual_tos', '2026-07-03T09:00:00.000Z');
    expect(a.map((v) => v.id)).toEqual(b.map((v) => v.id));
  });
});
