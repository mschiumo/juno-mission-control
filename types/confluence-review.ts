/**
 * ConfluenceTrading — Performance Review module (Milestone R) types.
 *
 * Translated from the canonical PostgreSQL additions (executions, trades,
 * symbol_pl_summary, risk_config, rule_violations, weekly_reviews,
 * import_batches) into this repo's Redis-backed store, following the same
 * conventions as types/confluence.ts.
 *
 * NON-NEGOTIABLE PRINCIPLES (same as the rest of ConfluenceTrading):
 *   - Code computes, the LLM narrates. Every number in these records is
 *     produced by pure, tested functions (lib/confluence/review/*). The
 *     weekly-review agent only reads computed results and writes prose.
 *   - This module is READ-ONLY over trade history. Its only executable
 *     surface is ADDING pre-trade checks to the existing execution service.
 *   - The analyst never grades its own homework: the metrics engine that
 *     scores trades is separate from the agent that proposes them.
 */

/** Where a fill came from: a manual ThinkOrSwim/Schwab statement import, or
 * the agentic Robinhood account's own execution-service order log. */
export type ReviewSource = 'manual_tos' | 'agentic_rh';

export type ReviewFillSide = 'buy' | 'sell';

/** executions — one normalized raw fill, either parsed from a statement or
 * mapped from a filled execution-service order. */
export interface ReviewExecution {
  id: string;
  source: ReviewSource;
  symbol: string;
  side: ReviewFillSide;
  /** Always positive; side carries the sign. */
  qty: number;
  price: number;
  /** Misc/regulatory fees attached to this fill (0 when none matched). */
  fees: number;
  /** ISO UTC instant of the fill. */
  executedAt: string;
  /** YYYY-MM-DD trading-session date in America/New_York. */
  etDate: string;
  orderType?: string; // LMT / MKT / STP ...
  posEffect?: string; // TO OPEN / TO CLOSE
  /** Set for manual imports; identifies the statement batch. */
  importBatchId?: string;
}

/** trades — one FIFO-paired round trip (flat → position → flat). */
export interface RoundTrip {
  /** Deterministic hash of (source, symbol, openedAt, closedAt, qty) so
   * re-imports of overlapping statements converge on the same ids. */
  id: string;
  source: ReviewSource;
  symbol: string;
  direction: 'long' | 'short';
  /** Total shares entered over the round trip (scale-ins summed). */
  qty: number;
  avgEntry: number;
  avgExit: number;
  grossPl: number;
  fees: number;
  netPl: number;
  openedAt: string; // ISO UTC of the first entry fill
  closedAt: string; // ISO UTC of the final exit fill
  /** Session date (America/New_York) the round trip closed on. */
  etDate: string;
  holdingSeconds: number;
  executionIds: string[];
  entryFills: number;
  exitFills: number;
  /** netPl / risk_config.risk_unit — undefined until a risk unit is applied. */
  rMultiple?: number;
}

/** A leftover position whose exits haven't happened (or aren't in the data). */
export interface ReviewOpenPosition {
  source: ReviewSource;
  symbol: string;
  /** Signed: positive = long, negative = short. */
  qty: number;
  avgCost: number;
  openedAt: string;
}

/** risk_config — the configurable risk framework both rules paths read.
 * Defaults derived from the 2026-07-02 statement analysis. */
export interface RiskConfig {
  /** Dollar size of 1R — the observed modal stop-out size. */
  riskUnitUsd: number;
  /** Any loss beyond maxRMultiple × riskUnitUsd is a tail loss. */
  maxRMultiple: number;
  /** Max round trips per symbol per session before it counts as churn. */
  churnThreshold: number;
  /** Trailing sessions a symbol must prove itself over (probation lookback). */
  probationWindowSessions: number;
  /** Max distinct active symbols in the trailing window / open proposals. */
  breadthCap: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  riskUnitUsd: 50,
  maxRMultiple: 1.5,
  churnThreshold: 2,
  probationWindowSessions: 20,
  breadthCap: 15,
};

/** risk_config history entry — append new rows, never update. The current
 * config is the fold of DEFAULT_RISK_CONFIG plus entries in order. */
export interface RiskConfigEntry {
  id: string;
  key: keyof RiskConfig;
  value: number;
  createdAt: string;
  createdBy?: string;
}

/** symbol_pl_summary — YTD symbol P/L imported from the statement's Profits
 * and Losses section (summary context; never reconstructed from fills). */
export interface SymbolPlSummary {
  symbol: string;
  description?: string;
  plYtd: number;
  plDay?: number;
  asOfDate: string; // YYYY-MM-DD (statement period end)
  importBatchId: string;
}

/** import_batches — one per uploaded statement; rejects duplicate hashes. */
export interface ImportBatch {
  id: string;
  source: ReviewSource;
  fileName?: string;
  /** sha-256 of the raw file — idempotent re-import. */
  fileHash: string;
  status: 'imported' | 'rejected';
  rowCounts: {
    fills: number;
    /** Fills skipped because an identical fill already existed. */
    duplicates: number;
    orderHistoryRows: number;
    cashRows: number;
    plRows: number;
  };
  warnings: string[];
  error?: string;
  sessionDates: string[];
  createdAt: string;
}

export type ReviewRule =
  | 'stop_loss_bound' // approved proposal must carry a stop with max loss ≤ maxR × riskUnit
  | 'tail_loss' // realized loss beyond maxR × riskUnit
  | 'probation_symbol' // trading a symbol that's net-negative + churny over the window
  | 'symbol_breadth' // too many distinct symbols in play
  | 'churn'; // too many round trips in one symbol in one session

export type RuleSeverity = 'info' | 'warning' | 'critical';

/** rule_violations — written post-import for the manual account (observed,
 * nothing blocked) and recorded when pre-trade checks reject agentic orders. */
export interface RuleViolation {
  /** Deterministic hash of (source, rule, symbol, tradeId, etDate) so
   * recomputes on re-import don't duplicate rows. */
  id: string;
  source: ReviewSource;
  rule: ReviewRule;
  severity: RuleSeverity;
  symbol?: string;
  tradeId?: string;
  etDate?: string;
  detail: string;
  detectedAt: string;
}

/** One bucket of the R-multiple histogram. */
export interface RBucket {
  /** e.g. "< -2R", "-2R..-1R", "-1R..0", "0..1R", "1R..2R", "> 2R" */
  bucket: string;
  count: number;
}

export interface SymbolAggregate {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  grossPl: number;
  fees: number;
  netPl: number;
  /** Distinct sessions this symbol traded in. */
  sessions: number;
  /** Highest round-trips-in-one-session count. */
  maxSessionChurn: number;
}

/** Everything the metrics engine computes over a set of round trips.
 * Produced only by lib/confluence/review/metrics.ts — never by the LLM. */
export interface ReviewMetrics {
  source: ReviewSource | 'all';
  trades: number;
  wins: number;
  losses: number;
  scratches: number;
  /** wins / (wins + losses), 0..1. Undefined when no decided trades. */
  winRate?: number;
  avgWin?: number;
  avgLoss?: number; // positive magnitude
  /** avgWin / avgLoss. */
  payoffRatio?: number;
  /** Expected net P/L per trade: winRate*avgWin − lossRate*avgLoss. */
  expectancy?: number;
  grossPl: number;
  fees: number;
  netPl: number;
  /** fees / |grossPl| — how much of the gross move fees consumed. */
  feeDragPct?: number;
  rDistribution: RBucket[];
  largestLossR?: number;
  largestWinR?: number;
  /** Trades whose loss exceeded maxRMultiple × riskUnit. */
  tailLosses: { tradeId: string; symbol: string; netPl: number; rMultiple: number }[];
  perSymbol: SymbolAggregate[];
  /** Distinct symbols traded in the window. */
  breadth: number;
  /** Distinct sessions in the window. */
  sessions: number;
  /** Sessions × symbols where round trips exceeded the churn threshold. */
  churnEvents: { etDate: string; symbol: string; roundTrips: number }[];
}

/** weekly_reviews — computed metrics snapshot + the agent's narrative. */
export interface WeeklyReview {
  id: string;
  /** Monday of the reviewed week, YYYY-MM-DD (ET). */
  weekStart: string;
  weekEnd: string;
  /** metrics_json — all numbers computed in code before the agent runs. */
  metrics: {
    manual?: ReviewMetrics;
    agentic?: ReviewMetrics;
    violationsThisWeek: number;
    priorWeek?: {
      manual?: ReviewMetrics;
      agentic?: ReviewMetrics;
    };
  };
  narrative: string;
  agentRunId?: string;
  model?: string;
  createdAt: string;
}

/** Result of the review-rules pre-trade check (additive to GuardrailResult). */
export interface ReviewRuleCheck {
  ok: boolean;
  code?: 'stop_required' | 'stop_too_wide' | 'symbol_probation' | 'breadth_cap';
  reason?: string;
}
