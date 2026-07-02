/**
 * Fundamentals data-source seam for the analysis agent (Milestone 2).
 *
 * Mirrors the BrokerAdapter pattern: the agent runner talks ONLY to this
 * interface, so the real Massive REST/MCP integration can be dropped in later
 * without touching the runner or the strategy. Milestone 1/2 ships the
 * deterministic {@link MockFundamentalsProvider}.
 *
 * ACTION (owner open item): confirm the Massive plan tier includes the
 * fundamentals/statements endpoints, then implement a MassiveFundamentalsProvider
 * here and swap it in via getFundamentalsProvider().
 */

/**
 * A per-symbol fundamentals snapshot. Deliberately a superset of common metrics
 * plus a `raw` bag — the strategy decides which fields matter (that's the user's
 * edge). `price` is the latest quote, used to derive a limit price.
 */
export interface Fundamentals {
  symbol: string;
  /** Latest price (for limit-price derivation). */
  price?: number;
  peTtm?: number;
  forwardPe?: number;
  pbRatio?: number;
  psRatio?: number;
  grossMargin?: number; // 0..1
  operatingMargin?: number; // 0..1
  returnOnEquity?: number; // 0..1
  returnOnAssets?: number; // 0..1
  debtToEquity?: number;
  currentRatio?: number;
  revenueGrowthYoY?: number; // 0..1
  freeCashFlow?: number; // absolute USD
  marketCap?: number; // absolute USD
  dividendYield?: number; // 0..1 (fraction, not percent)
  sector?: string;
  industry?: string;
  high52w?: number;
  low52w?: number;
  /** Anything else the provider returned, verbatim. */
  raw?: Record<string, unknown>;
}

export interface FundamentalsProvider {
  /** Human label for the audit/run metadata, e.g. "mock" or "massive". */
  readonly name: string;
  /** The symbols to screen this run. */
  getUniverse(): Promise<string[]>;
  /** Fundamentals for one symbol, or null if unavailable. */
  getFundamentals(symbol: string): Promise<Fundamentals | null>;
}
