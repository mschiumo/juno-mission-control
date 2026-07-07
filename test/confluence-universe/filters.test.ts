import { describe, expect, it } from 'vitest';
import { capFilter, liquidityCandidates } from '@/lib/confluence/universe/massive';

const bar = (c: number, v: number, dv?: number) => ({ c, v, ...(dv !== undefined ? { dv } : {}) });

describe('liquidityCandidates', () => {
  it('keeps liquid plain symbols and ranks by dollar volume', () => {
    const out = liquidityCandidates([
      { ticker: 'AAA', day: bar(50, 1_000_000) }, // $50M
      { ticker: 'BBB', day: bar(20, 5_000_000) }, // $100M
      { ticker: 'CCC', day: bar(30, 100_000) }, // $3M — too thin
    ]);
    expect(out.map((c) => c.symbol)).toEqual(['BBB', 'AAA']);
  });

  it('prefers the explicit dollar-volume field and falls back to prevDay', () => {
    const out = liquidityCandidates([
      // day.dv provided as a string-ish number (API returns strings)
      { ticker: 'DVS', day: { c: 10, v: 100, dv: 25_000_000 } },
      // weekend snapshot: empty day, liquid prevDay
      { ticker: 'WKD', day: { c: 0, v: 0 }, prevDay: { c: 40, v: 1_000_000 } },
    ]);
    expect(out.map((c) => c.symbol).sort()).toEqual(['DVS', 'WKD']);
  });

  it('drops sub-$5 names, dotted/dashed share classes, and blanks', () => {
    const out = liquidityCandidates([
      { ticker: 'PNY', day: bar(3, 50_000_000) }, // $150M but $3 stock
      { ticker: 'BRK.B', day: bar(400, 1_000_000) },
      { ticker: 'X-W', day: bar(50, 1_000_000) },
      { ticker: '', day: bar(50, 1_000_000) },
      { ticker: 'OK', day: bar(50, 1_000_000) },
    ]);
    expect(out.map((c) => c.symbol)).toEqual(['OK']);
  });

  it('caps at the details budget, keeping the most liquid', () => {
    const tickers = Array.from({ length: 10 }, (_, i) => ({
      ticker: `S${String.fromCharCode(65 + i)}`,
      day: bar(10, (i + 3) * 1_000_000),
    }));
    const out = liquidityCandidates(tickers, 3);
    expect(out).toHaveLength(3);
    expect(out[0].dollarVolume).toBeGreaterThan(out[2].dollarVolume);
  });
});

describe('capFilter', () => {
  const ranked = [
    { symbol: 'BIG', dollarVolume: 900e6 },
    { symbol: 'ETF', dollarVolume: 800e6 },
    { symbol: 'SML', dollarVolume: 700e6 },
    { symbol: 'DEAD', dollarVolume: 600e6 },
    { symbol: 'ALSO', dollarVolume: 500e6 },
  ];
  const details = new Map(
    Object.entries({
      BIG: { market_cap: 50e9, type: 'CS', active: true },
      ETF: { market_cap: 60e9, type: 'ETF', active: true }, // not common stock
      SML: { market_cap: 2e9, type: 'CS', active: true }, // under $10B
      DEAD: { market_cap: 30e9, type: 'CS', active: false }, // delisted
      ALSO: { market_cap: 12e9, type: 'CS', active: true },
    }),
  );

  it('keeps only active $10B+ common stocks, in liquidity order', () => {
    expect(capFilter(ranked, details, 250)).toEqual(['BIG', 'ALSO']);
  });

  it('honors the max-universe cap', () => {
    expect(capFilter(ranked, details, 1)).toEqual(['BIG']);
  });

  it('skips symbols whose details lookup failed rather than guessing', () => {
    expect(capFilter([{ symbol: 'MISS', dollarVolume: 1e9 }], new Map(), 250)).toEqual([]);
  });
});
