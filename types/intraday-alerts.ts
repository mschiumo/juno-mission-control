/**
 * Shared types for the intraday alert system.
 *
 * Kept separate from lib/intraday-alerts.ts (which pulls in Redis and other
 * server-only modules) so client components can import the shapes without
 * dragging server code into the browser bundle.
 */

export interface IntradayAlert {
  symbol: string;
  name: string;
  direction: 'up' | 'down';
  /** Winning (highest-scoring) window for this ticker. */
  windowHours: number;
  /** Display label for the winning window, e.g. "1H". */
  windowLabel: string;
  /** Signed percentage move over the winning window. */
  movePercent: number;
  price: number;
  spread?: number;
  spreadPercent?: number;
  volume: number;
  /** Relative volume = session volume / 90-day average. Undefined when unknown. */
  rvol?: number;
  marketCap: number;
  /** Composite score, 0–100 (move size + relative volume + spread tightness). */
  score: number;
  /** True when this ticker was not present in the previous scan. */
  isNew: boolean;
  /** Every window this ticker qualified under (sorted ascending). */
  triggeredWindows: number[];
  /** Set per-user at read time: already in this user's watchlist / favorites. */
  alreadyAdded?: boolean;
}

export interface IntradayAlertSnapshot {
  /** ISO timestamp of the scan that produced this snapshot. */
  generatedAt: string;
  /** ET trading date (MM/DD/YYYY) the snapshot belongs to. */
  tradingDate: string;
  marketSession: string;
  /** Windows that were eligible (fully elapsed) for this run. */
  eligibleWindows: number[];
  /** Top-N alerts, ranked by score. */
  alerts: IntradayAlert[];
  scanned: number;
  /** Present when there are no alerts (warming up, market closed, none found). */
  message?: string;
}
