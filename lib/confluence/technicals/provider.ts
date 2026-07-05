/**
 * Technicals data-source seam for the analysis agent.
 *
 * Mirrors the FundamentalsProvider pattern: the strategy reads ONLY this
 * snapshot shape, so the bar source (mock vs Robinhood historicals) can swap
 * without touching the strategy. All indicator math lives in ./indicators and
 * is pure; providers fetch bars and delegate the computation.
 */

/** One completed daily bar. */
export interface OhlcvBar {
  /** Bar date, YYYY-MM-DD. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * A per-symbol technical snapshot computed from daily bars. Indicator fields
 * are undefined when there is not enough history to compute them — the
 * strategy treats missing indicators as a failed gate, never a pass.
 */
export interface Technicals {
  symbol: string;
  /** Date of the last bar the snapshot was computed from (YYYY-MM-DD). */
  asOf: string;
  lastClose: number;
  /** Number of daily bars the snapshot was computed from. */
  barCount: number;
  sma50?: number;
  sma200?: number;
  /** Wilder-smoothed RSI over 14 bars. */
  rsi14?: number;
  /** Wilder-smoothed ATR over 14 bars, in price units. */
  atr14?: number;
  /** Lowest low of the last 10 completed bars (swing-stop anchor). */
  swingLow10?: number;
  /** 20-bar average of close × volume, USD (liquidity gate). */
  avgDollarVolume20?: number;
}

export interface TechnicalsProvider {
  /** Human label for run metadata, e.g. "mock" or "robinhood". */
  readonly name: string;
  /** Technical snapshot for one symbol, or null if bars are unavailable. */
  getTechnicals(symbol: string): Promise<Technicals | null>;
}
