/**
 * Approval-time freshness: the guard that stopped agentic entries from resting
 * at a limit computed off a superseded close.
 *
 * The August 2026 signature these lock in: a screen prices entry = 0.995 ×
 * close(session N); the owner approves during session N+1; the limit is then
 * ~1% under a market that has already moved, so the GFD order expires unfilled.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lastSettledSessionAt, repriceProposal } from '@/lib/confluence/agent/reprice';
import { evaluateInverseEtfHedge, evaluateValueTaPullback } from '@/lib/confluence/agent/strategies/value-ta-pullback';
import type { Technicals } from '@/lib/confluence/technicals';
import { DEFAULT_SYSTEM_STATE } from '@/types/confluence';
import type { Proposal, SystemState } from '@/types/confluence';

// The mock technicals provider's bars end on a fixed anchor date.
const MOCK_ASOF = '2026-06-30';

const state: SystemState = { ...DEFAULT_SYSTEM_STATE, updatedAt: '2026-08-18T00:00:00.000Z' };

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 'p1',
    createdAt: '2026-06-30T12:00:00.000Z',
    symbol: 'KO',
    direction: 'buy',
    thesis: 'test',
    strategyId: 'value-ta-pullback',
    suggestedLimitPrice: 60.3,
    suggestedQuantity: 1,
    fundamentals: [],
    status: 'pending',
    ...over,
  };
}

describe('lastSettledSessionAt', () => {
  it('uses the previous session before the close (an 8am ET screen prices off yesterday)', () => {
    // 2026-08-13 08:00 ET — the agent cron's slot, pre-open.
    expect(lastSettledSessionAt(new Date('2026-08-13T12:00:00Z'))).toBe('2026-08-12');
  });

  it('rolls to today once the session has settled', () => {
    // 2026-08-13 19:48 ET — the same evening, after the close.
    expect(lastSettledSessionAt(new Date('2026-08-13T23:48:00Z'))).toBe('2026-08-13');
  });

  it('is exactly the shift that made the Aug 13 D order stale', () => {
    // Priced at the 8am cron (basis Aug 12), approved that evening (basis Aug 13).
    const priced = lastSettledSessionAt(new Date('2026-08-13T12:00:00Z'));
    const approved = lastSettledSessionAt(new Date('2026-08-13T23:48:00Z'));
    expect(priced).not.toBe(approved);
  });

  it('rolls weekends back to Friday', () => {
    // Sunday 2026-08-09 08:35 ET.
    expect(lastSettledSessionAt(new Date('2026-08-09T12:35:00Z'))).toBe('2026-08-07');
    // Saturday 2026-08-08, any hour.
    expect(lastSettledSessionAt(new Date('2026-08-08T23:00:00Z'))).toBe('2026-08-07');
  });

  it('treats Monday pre-open as pricing off Friday', () => {
    expect(lastSettledSessionAt(new Date('2026-08-10T12:00:00Z'))).toBe('2026-08-07');
  });
});

describe('pricedAsOf stamp', () => {
  // The guard is only as good as the basis the screen records.
  const t: Technicals = {
    symbol: 'KO',
    asOf: '2026-08-12',
    barCount: 288,
    lastClose: 60.6,
    sma50: 60.0,
    sma200: 55.0,
    rsi14: 45,
    atr14: 0.7,
    avgDollarVolume20: 60e6,
    swingLow10: 58.9,
  };
  const ctx = { perPositionBudgetUsd: 1000, maxRiskPerTradeUsd: 40 };

  it('records the bar session the entry was priced from', async () => {
    const { MockFundamentalsProvider } = await import('@/lib/confluence/fundamentals/mock-provider');
    const f = await new MockFundamentalsProvider().getFundamentals('KO');
    const c = evaluateValueTaPullback(f!, t, ctx);
    expect(c).not.toBeNull();
    expect(c!.pricedAsOf).toBe('2026-08-12');
  });

  it('records it on hedge-sleeve candidates too', () => {
    const c = evaluateInverseEtfHedge('SH', { ...t, symbol: 'SH' }, ctx);
    expect(c).not.toBeNull();
    expect(c!.pricedAsOf).toBe('2026-08-12');
  });
});

describe('repriceProposal', () => {
  beforeEach(() => {
    process.env.CONFLUENCE_FUNDAMENTALS_PROVIDER = 'mock';
    process.env.CONFLUENCE_TECHNICALS_PROVIDER = 'mock';
  });
  afterEach(() => {
    delete process.env.CONFLUENCE_FUNDAMENTALS_PROVIDER;
    delete process.env.CONFLUENCE_TECHNICALS_PROVIDER;
  });

  it('passes a plan still priced off the latest settled session', async () => {
    const res = await repriceProposal(proposal({ pricedAsOf: MOCK_ASOF }), state);
    expect(res.code).toBe('fresh');
  });

  it('holds a plan priced off an older session and returns the refreshed numbers', async () => {
    const res = await repriceProposal(proposal({ pricedAsOf: '2026-06-26' }), state);
    expect(res.code).toBe('stale');
    if (res.code !== 'stale') return;
    expect(res.pricedAsOf).toBe('2026-06-26');
    expect(res.asOf).toBe(MOCK_ASOF);
    expect(res.plan.limitPrice).toBeGreaterThan(0);
    expect(res.plan.quantity).toBeGreaterThanOrEqual(1);
    // A refreshed plan is internally consistent: stop under entry, 2:1 target.
    expect(res.plan.stopPrice!).toBeLessThan(res.plan.limitPrice);
    const risk = res.plan.limitPrice - res.plan.stopPrice!;
    expect(res.plan.targetPrice!).toBeCloseTo(res.plan.limitPrice + 2 * risk, 1);
  });

  it('reports setup_gone when the symbol no longer clears its gates', async () => {
    // AAPL fails the mock value gate (P/E 29.1 > 25, fwd 26.4 > 22).
    const res = await repriceProposal(proposal({ symbol: 'AAPL', pricedAsOf: '2026-06-26' }), state);
    expect(res.code).toBe('setup_gone');
  });

  it('falls back to the createdAt session when pricedAsOf was never recorded', async () => {
    // Created 2026-06-26 pre-open → basis 2026-06-25, older than the mock asOf.
    const res = await repriceProposal(proposal({ createdAt: '2026-06-26T12:00:00.000Z' }), state);
    expect(res.code).toBe('stale');
  });

  it('fails open — an unfetchable symbol never blocks approval', async () => {
    const res = await repriceProposal(proposal({ symbol: 'ZZZZ', pricedAsOf: '2026-06-26' }), state);
    expect(res.code).toBe('unverified');
  });
});
