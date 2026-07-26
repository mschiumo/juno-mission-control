/**
 * The buying-power gate: a live run must never propose a buy the account
 * can't fund at the suggested price × quantity, buys are charged against the
 * remaining balance in rank order, and sells pass through untouched.
 */

import { describe, expect, it } from 'vitest';
import { applyBuyingPowerGate } from '@/lib/confluence/agent/buying-power-gate';
import type { Candidate } from '@/lib/confluence/agent/strategy';

function buy(symbol: string, limit: number, qty: number, direction: Candidate['direction'] = 'buy'): Candidate {
  return {
    symbol,
    direction,
    thesis: 'test',
    suggestedLimitPrice: limit,
    suggestedQuantity: qty,
    fundamentals: [],
  };
}

describe('applyBuyingPowerGate', () => {
  it('rules out a buy whose notional exceeds buying power', () => {
    const { kept, ruledOut } = applyBuyingPowerGate([buy('AAPL', 200, 5)], 500);
    expect(kept).toHaveLength(0);
    expect(ruledOut).toEqual(['AAPL (needs $1,000, $500 available)']);
  });

  it('keeps a buy that fits exactly', () => {
    const { kept, ruledOut } = applyBuyingPowerGate([buy('AAPL', 100, 5)], 500);
    expect(kept).toHaveLength(1);
    expect(ruledOut).toHaveLength(0);
  });

  it('charges buys cumulatively in rank order', () => {
    // $500 available: first ($300) fits, second ($300) no longer does,
    // third ($150) fits in what remains.
    const { kept, ruledOut } = applyBuyingPowerGate(
      [buy('AAA', 100, 3), buy('BBB', 100, 3), buy('CCC', 150, 1)],
      500,
    );
    expect(kept.map((c) => c.symbol)).toEqual(['AAA', 'CCC']);
    expect(ruledOut).toEqual(['BBB (needs $300, $200 available)']);
  });

  it('never charges sells against buying power', () => {
    const { kept, ruledOut } = applyBuyingPowerGate(
      [buy('SELL1', 1000, 10, 'sell'), buy('AAA', 100, 4)],
      500,
    );
    expect(kept.map((c) => c.symbol)).toEqual(['SELL1', 'AAA']);
    expect(ruledOut).toHaveLength(0);
  });

  it('rules out every buy when buying power is zero, without negative "available"', () => {
    const { kept, ruledOut } = applyBuyingPowerGate([buy('AAA', 100, 1)], 0);
    expect(kept).toHaveLength(0);
    expect(ruledOut).toEqual(['AAA (needs $100, $0 available)']);
  });
});
