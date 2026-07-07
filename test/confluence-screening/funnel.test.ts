/**
 * Unit tests for the batched-screening funnel's pure helpers: symbol chunking,
 * skip-reason formatting, and the value-TA fundamentals prefilter that gates
 * the technicals fetch. MCP I/O is deliberately not tested here.
 */

import { describe, expect, it } from 'vitest';
import { chunk, formatSkip, MCP_SYMBOL_BATCH_SIZE } from '@/lib/confluence/batching';
import { valueTaPrefilter } from '@/lib/confluence/agent/strategies/value-ta-pullback';
import type { Fundamentals } from '@/lib/confluence/fundamentals';

describe('chunk', () => {
  it('splits into consecutive chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('leaves a short final chunk for remainders', () => {
    expect(chunk(['A', 'B', 'C', 'D', 'E'], 3)).toEqual([
      ['A', 'B', 'C'],
      ['D', 'E'],
    ]);
  });

  it('returns a single chunk when size exceeds the array', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns no chunks for an empty array', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('supports size 1 (degenerates to per-item)', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('rejects non-positive and fractional sizes', () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -3)).toThrow();
    expect(() => chunk([1], 2.5)).toThrow();
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3];
    chunk(input, 2);
    expect(input).toEqual([1, 2, 3]);
  });

  it('covers a 250-symbol universe in 25 MCP-sized chunks', () => {
    const universe = Array.from({ length: 250 }, (_, i) => `S${i}`);
    const chunks = chunk(universe, MCP_SYMBOL_BATCH_SIZE);
    expect(chunks).toHaveLength(25);
    expect(chunks.every((c) => c.length === MCP_SYMBOL_BATCH_SIZE)).toBe(true);
    expect(chunks.flat()).toEqual(universe);
  });
});

describe('formatSkip', () => {
  it('formats as SYM:reason', () => {
    expect(formatSkip('AAPL', 'fundamentals_failed')).toBe('AAPL:fundamentals_failed');
    expect(formatSkip('KO', 'technicals_failed')).toBe('KO:technicals_failed');
  });
});

describe('valueTaPrefilter', () => {
  // A name that clearly clears every value-gate check.
  const passing: Fundamentals = {
    symbol: 'GOOD',
    price: 100,
    peTtm: 18,
    pbRatio: 3,
    dividendYield: 0.025,
    marketCap: 50e9,
  };

  it('passes a large-cap, fairly valued dividend payer', () => {
    expect(valueTaPrefilter(passing)).toBe(true);
  });

  it('rejects small caps', () => {
    expect(valueTaPrefilter({ ...passing, marketCap: 2e9 })).toBe(false);
  });

  it('rejects missing/expensive valuation', () => {
    expect(valueTaPrefilter({ ...passing, peTtm: undefined })).toBe(false);
    expect(valueTaPrefilter({ ...passing, peTtm: 60 })).toBe(false);
  });

  it('rejects names with neither dividend nor positive FCF', () => {
    expect(valueTaPrefilter({ ...passing, dividendYield: 0, freeCashFlow: -1e9 })).toBe(false);
  });

  it('accepts positive FCF in place of a dividend', () => {
    expect(valueTaPrefilter({ ...passing, dividendYield: 0, freeCashFlow: 5e9 })).toBe(true);
  });
});
