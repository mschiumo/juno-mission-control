/**
 * Deterministic MOCK technicals provider (paper-mode scaffolding).
 *
 * Synthesizes ~260 daily bars per symbol with a seeded PRNG — an uptrend that
 * ends in a mild pullback toward the 50-day average — so the value-TA strategy
 * has realistic-shaped inputs to screen without any market-data credentials.
 * NONE of these bars are real market data. Symbols end at the same last price
 * as the mock fundamentals provider so the two mock sources agree.
 */

import type { OhlcvBar, Technicals, TechnicalsProvider } from './provider';
import { computeTechnicals } from './indicators';

/** End prices aligned with MockFundamentalsProvider's `price` per symbol. */
const MOCK_END_PRICE: Record<string, number> = {
  AAPL: 184.2,
  MSFT: 409.0,
  KO: 60.6,
  NVDA: 121.4,
  JNJ: 152.1,
  PG: 167.3,
};

/** Small deterministic PRNG (mulberry32) so bars are stable run to run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BAR_COUNT = 260;
const PULLBACK_BARS = 12;

/**
 * Build a synthetic daily series: a steady geometric uptrend into a local peak
 * ~3% above the target end price, then a gentle 12-bar drift down to it. That
 * shape leaves price a touch above a rising 50-day SMA with RSI in the low-40s
 * — a textbook pullback-in-uptrend, which is what the strategy screens for.
 */
function synthesizeBars(symbol: string, endPrice: number): OhlcvBar[] {
  const rand = mulberry32(seedFromSymbol(symbol));
  const trendBars = BAR_COUNT - PULLBACK_BARS;
  const peak = endPrice * 1.03;
  const start = peak / 1.28; // ~28% run-up across the trend segment
  const trendGrowth = Math.pow(peak / start, 1 / (trendBars - 1));
  const pullbackDecay = Math.pow(endPrice / peak, 1 / PULLBACK_BARS);

  // Ideal deterministic path first, then NON-compounding noise around it —
  // compounded noise is a random walk that can wander far enough to break the
  // engineered pullback shape (and crater RSI when the end pin snaps it back).
  // The pullback alternates down-big / up-small (weights sum to the bar count,
  // so the segment still lands exactly on endPrice): a monotonic slide would
  // pin RSI in the 20s, which reads as breakdown, not a buyable dip.
  const ideal: number[] = [];
  let price = start;
  for (let i = 0; i < BAR_COUNT; i++) {
    if (i > 0) {
      if (i < trendBars) {
        price *= trendGrowth;
      } else {
        const j = i - trendBars;
        const weight = j % 2 === 0 ? 2.35 : -0.35;
        price *= Math.pow(pullbackDecay, weight);
      }
    }
    ideal.push(price);
  }
  const closes = ideal.map((p, i) =>
    // ±0.3% jitter keeps RSI/ATR realistic without breaking the shape.
    i === BAR_COUNT - 1 ? endPrice : p * (1 + (rand() - 0.5) * 0.006),
  );

  // Deterministic weekday-ish calendar counting back from a fixed anchor date.
  const anchor = Date.UTC(2026, 5, 30); // 2026-06-30, fixed so bars are stable
  const dayMs = 24 * 60 * 60 * 1000;
  const bars: OhlcvBar[] = closes.map((close, i) => {
    const spread = close * (0.004 + rand() * 0.006);
    const open = close * (1 + (rand() - 0.5) * 0.006);
    const date = new Date(anchor - (BAR_COUNT - 1 - i) * dayMs).toISOString().slice(0, 10);
    return {
      date,
      open: round2(open),
      high: round2(Math.max(open, close) + spread),
      low: round2(Math.min(open, close) - spread),
      close: round2(close),
      volume: Math.round(4_000_000 + rand() * 2_000_000),
    };
  });
  return bars;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export class MockTechnicalsProvider implements TechnicalsProvider {
  readonly name = 'mock';

  async getTechnicals(symbol: string): Promise<Technicals | null> {
    const endPrice = MOCK_END_PRICE[symbol.toUpperCase()];
    if (endPrice == null) return null;
    return computeTechnicals(symbol.toUpperCase(), synthesizeBars(symbol.toUpperCase(), endPrice));
  }
}
