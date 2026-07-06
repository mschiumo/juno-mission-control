/**
 * Pure indicator math over daily OHLCV bars. No I/O, no dates, no env — every
 * function is deterministic on its inputs so the strategy is unit-testable.
 * Bars are expected oldest → newest; all functions return undefined when there
 * is not enough history rather than guessing.
 */

import type { OhlcvBar, Technicals } from './provider';

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number | undefined {
  if (period <= 0 || values.length < period) return undefined;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/**
 * Wilder-smoothed RSI. Seeds with a simple average of the first `period`
 * gains/losses, then applies Wilder smoothing across the remaining bars.
 */
export function rsiWilder(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Wilder-smoothed ATR in price units. */
export function atrWilder(bars: OhlcvBar[], period = 14): number | undefined {
  if (bars.length < period + 1) return undefined;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose),
    );
    trs.push(tr);
  }
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i];
  atr /= period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/** Lowest low of the last `period` bars. */
export function lowestLow(bars: OhlcvBar[], period: number): number | undefined {
  if (period <= 0 || bars.length < period) return undefined;
  let low = Infinity;
  for (let i = bars.length - period; i < bars.length; i++) {
    if (bars[i].low < low) low = bars[i].low;
  }
  return Number.isFinite(low) ? low : undefined;
}

/** Average of close × volume over the last `period` bars, in USD. */
export function avgDollarVolume(bars: OhlcvBar[], period = 20): number | undefined {
  if (bars.length < period) return undefined;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    sum += bars[i].close * bars[i].volume;
  }
  return sum / period;
}

/** Compute the full technical snapshot from daily bars (oldest → newest). */
export function computeTechnicals(symbol: string, bars: OhlcvBar[]): Technicals | null {
  if (bars.length === 0) return null;
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  return {
    symbol,
    asOf: last.date,
    lastClose: last.close,
    barCount: bars.length,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsiWilder(closes, 14),
    atr14: atrWilder(bars, 14),
    swingLow10: lowestLow(bars, 10),
    avgDollarVolume20: avgDollarVolume(bars, 20),
  };
}
