import { afterEach, describe, expect, it } from 'vitest';
import { evaluateInverseEtfHedge, hedgeSleeveSymbols } from '@/lib/confluence/agent/strategies/value-ta-pullback';
import { STRATEGY_META } from '@/lib/confluence/strategies-meta';
import type { Technicals } from '@/lib/confluence/technicals';

// An inverse ETF in a textbook pullback-in-uptrend (i.e. the index is in a
// downtrend that just bounced): above rising SMAs, at the 50-day, RSI mid-band.
const setup: Technicals = {
  symbol: 'SH',
  asOf: '2026-07-06',
  barCount: 288,
  lastClose: 15.0,
  sma50: 14.9,
  sma200: 13.8,
  rsi14: 45,
  atr14: 0.18, // 1.2% of price
  avgDollarVolume20: 60e6,
  swingLow10: 14.55,
};

const ctx = { perPositionBudgetUsd: 100, maxRiskPerTradeUsd: 4 };

afterEach(() => {
  delete process.env.CONFLUENCE_INVERSE_ETFS;
});

describe('evaluateInverseEtfHedge', () => {
  it('proposes a LONG with stop below entry and 2:1 target on a valid setup', () => {
    const c = evaluateInverseEtfHedge('SH', setup, ctx);
    expect(c).not.toBeNull();
    expect(c!.direction).toBe('buy');
    expect(c!.displayStrategyId).toBe('value-ta-hedge');
    expect(c!.suggestedStopPrice!).toBeLessThan(c!.suggestedLimitPrice);
    expect(c!.suggestedTargetPrice!).toBeGreaterThan(c!.suggestedLimitPrice);
    const risk = c!.suggestedLimitPrice - c!.suggestedStopPrice!;
    expect(c!.suggestedTargetPrice!).toBeCloseTo(c!.suggestedLimitPrice + 2 * risk, 1);
    expect(c!.suggestedQuantity).toBeGreaterThanOrEqual(1);
  });

  it('rejects when the inverse ETF is in a downtrend (index uptrend — no hedge)', () => {
    const c = evaluateInverseEtfHedge('SH', { ...setup, lastClose: 13.0, sma50: 13.5, sma200: 14.5 }, ctx);
    expect(c).toBeNull();
  });

  it('rejects when extended above the pullback band (index capitulating — too late to chase)', () => {
    const c = evaluateInverseEtfHedge('SH', { ...setup, lastClose: 16.5 }, ctx);
    expect(c).toBeNull();
  });

  it('returns null without technicals', () => {
    expect(evaluateInverseEtfHedge('SH', null, ctx)).toBeNull();
  });
});

describe('hedgeSleeveSymbols', () => {
  it('defaults to the 1x index inverse set', () => {
    expect(hedgeSleeveSymbols()).toEqual(['SH', 'PSQ', 'DOG', 'RWM']);
  });
  it('is overridable and can be disabled with an empty value', () => {
    process.env.CONFLUENCE_INVERSE_ETFS = 'sh, psq';
    expect(hedgeSleeveSymbols()).toEqual(['SH', 'PSQ']);
    process.env.CONFLUENCE_INVERSE_ETFS = '';
    expect(hedgeSleeveSymbols()).toEqual([]);
  });
});

describe('hedge badge identity', () => {
  it('value-ta-hedge has its own unique badge', () => {
    const hedge = STRATEGY_META['value-ta-hedge'];
    expect(hedge).toBeDefined();
    const others = Object.values(STRATEGY_META).filter((m) => m.id !== 'value-ta-hedge');
    expect(others.some((m) => m.short === hedge.short || m.color === hedge.color)).toBe(false);
  });
});
