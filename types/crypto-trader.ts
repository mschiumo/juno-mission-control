/**
 * CryptoTrader — types for the crypto screener + agentic trading feature.
 *
 * Architecture mirrors ConfluenceTrading (stocks): proposal → approval → guardrail-gated
 * execution, with a paper broker by default and a live (wallet) broker behind a server
 * env gate. The LLM only ranks/vetoes candidates; every size, stop, and exposure limit
 * is enforced in code AFTER the model runs and can never be raised by it.
 */

export type CryptoChain = 'solana' | 'ethereum' | 'base';

// ---------------------------------------------------------------------------
// Screener
// ---------------------------------------------------------------------------

/** Normalized market snapshot for one token pair, sourced from DEX Screener. */
export interface ScreenerToken {
  chainId: CryptoChain;
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChangePct: { m5: number; h1: number; h6: number; h24: number };
  volumeUsd: { m5: number; h1: number; h6: number; h24: number };
  txns: { h1Buys: number; h1Sells: number; h24Buys: number; h24Sells: number };
  liquidityUsd: number;
  marketCapUsd: number;
  fdvUsd: number;
  /** Hours since the pair was created (fractional). */
  ageHours: number;
  /** DEX Screener boost/trending marker, when present. */
  boosted: boolean;
  url: string;
}

/** Composite safety verdict from the rug filter (RugCheck for Solana, GoPlus for EVM). */
export interface SafetyReport {
  /** 0–100, higher = safer. Buys below the configured minimum are rejected in code. */
  score: number;
  /** Hard failures — any entry here disqualifies the token from agent buys. */
  hardFails: string[];
  /** Softer concerns surfaced to the analyst and the UI. */
  warnings: string[];
  /** Which provider produced the underlying data. */
  source: 'rugcheck' | 'goplus' | 'unavailable';
  checkedAt: string;
}

/** A screener row: market snapshot + computed signals + safety. */
export interface ScreenerResult {
  token: ScreenerToken;
  /** 0–100 momentum composite (volume spike, buy pressure, price action, liquidity trend). */
  momentumScore: number;
  /** Human-readable signal tags, e.g. "vol 5x baseline", "buys 2.1x sells". */
  signals: string[];
  safety: SafetyReport;
  /** Market-cap tier used for filtering/presentation. */
  tier: 'micro' | 'small' | 'mid' | 'large';
}

export interface ScreenerFilters {
  chain: CryptoChain | 'all';
  minLiquidityUsd: number;
  minVolumeH24Usd: number;
  minAgeHours: number;
  maxAgeHours?: number;
  minMarketCapUsd: number;
  maxMarketCapUsd?: number;
  /** Hide tokens whose safety report contains hard failures. */
  safeOnly: boolean;
}

// ---------------------------------------------------------------------------
// System state & risk
// ---------------------------------------------------------------------------

/**
 * Safety-critical toggles and caps. Stored in Redis, editable only by the owner.
 * Defaults are conservative: kill switch OFF (trading disabled), paper mode ON,
 * auto-trade OFF.
 */
export interface CryptoSystemState {
  /** Master kill switch. false = no orders of any kind, paper included. */
  tradingEnabled: boolean;
  /** true = simulated fills against live prices; false = live wallet execution. */
  paperMode: boolean;
  /**
   * When true, agent proposals that pass guardrails execute without manual
   * approval. When false, proposals wait as `pending` for owner review.
   */
  autoTrade: boolean;
  /**
   * When true, external MCP agents may execute/close through /api/mcp/crypto
   * (still subject to every guardrail). When false, MCP agents can only
   * observe and create pending proposals for owner review.
   */
  mcpTradingEnabled: boolean;
  /** Simulated bankroll for paper mode, in USD. */
  paperBankrollUsd: number;
  perPositionCapUsd: number;
  totalExposureCapUsd: number;
  maxOpenPositions: number;
  /** Realized loss today at which buying halts until the next UTC day. */
  dailyLossLimitUsd: number;
  /** Minutes to block new buys after a realized losing exit. */
  cooldownMinutesAfterLoss: number;
  /** Minimum SafetyReport.score required for any agent buy. */
  minSafetyScore: number;
  minLiquidityUsd: number;
  /** Skip tokens younger than this — the sniper knife-fight window. */
  minTokenAgeHours: number;
  /** Max acceptable estimated slippage/price-impact for an entry, in bps. */
  maxSlippageBps: number;
  updatedAt: string;
  updatedBy?: string;
}

/** Rolling daily risk counters — the circuit-breaker's memory. */
export interface RiskState {
  /** UTC day the counters apply to (YYYY-MM-DD); reset on rollover. */
  date: string;
  realizedPnlUsd: number;
  tradesToday: number;
  consecutiveLosses: number;
  lastLossAt?: string;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export type ProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed';

/** An agent (or manual) trade idea awaiting approval/execution. */
export interface CryptoProposal {
  id: string;
  runId?: string;
  chainId: CryptoChain;
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  direction: 'buy' | 'sell';
  /** Analyst rationale — shown in the UI and logged forever. */
  thesis: string;
  strategy: 'momentum-breakout' | 'manual';
  notionalUsd: number;
  entryPriceUsd: number;
  /** Hard stop, as an absolute price. */
  stopPriceUsd: number;
  /** Laddered take-profits; remainder rides a trailing stop. */
  takeProfitLadder: TakeProfitRung[];
  trailingStopPct: number;
  /** 0–100 model conviction (informational — never changes code-enforced caps). */
  conviction: number;
  safetyScore: number;
  signals: string[];
  status: ProposalStatus;
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  executionNote?: string;
}

export interface TakeProfitRung {
  /** Price multiple over entry at which this rung triggers (e.g. 2 = +100%). */
  multiple: number;
  /** Percent of the ORIGINAL position size to sell at this rung. */
  sellPct: number;
}

// ---------------------------------------------------------------------------
// Orders & positions
// ---------------------------------------------------------------------------

export type CryptoOrderStatus =
  | 'staged'
  | 'submitted'
  | 'filled'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export type OrderReason =
  | 'agent_entry'
  | 'manual_entry'
  | 'stop_loss'
  | 'take_profit'
  | 'trailing_stop'
  | 'manual_close';

export interface CryptoOrder {
  id: string;
  proposalId?: string;
  positionId?: string;
  chainId: CryptoChain;
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  side: 'buy' | 'sell';
  /** Buys are sized in USD; sells in tokens. */
  notionalUsd?: number;
  qtyTokens?: number;
  expectedPriceUsd: number;
  filledPriceUsd?: number;
  filledQtyTokens?: number;
  feeUsd?: number;
  /** Realized slippage vs expectedPriceUsd, in bps (positive = worse fill). */
  slippageBps?: number;
  status: CryptoOrderStatus;
  isPaper: boolean;
  reason: OrderReason;
  /** Idempotency key — retries reuse it; the broker layer dedupes on it. */
  refId: string;
  /** On-chain transaction signature (live mode only). */
  txSignature?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  history: { status: CryptoOrderStatus; at: string; note?: string }[];
}

export interface CryptoPosition {
  id: string;
  proposalId?: string;
  orderIds: string[];
  chainId: CryptoChain;
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  qtyTokens: number;
  /** Tokens bought originally — the base for ladder sellPct math. */
  initialQtyTokens: number;
  avgEntryPriceUsd: number;
  costUsd: number;
  stopPriceUsd: number;
  takeProfitLadder: TakeProfitRung[];
  /** Rungs already executed (indexes into takeProfitLadder). */
  laddersFilled: number[];
  trailingStopPct: number;
  /** Highest price seen since entry; drives the trailing stop. */
  highWaterMarkUsd: number;
  realizedPnlUsd: number;
  status: 'open' | 'closed';
  isPaper: boolean;
  thesis?: string;
  strategy: string;
  openedAt: string;
  closedAt?: string;
  closeReason?: OrderReason;
}

// ---------------------------------------------------------------------------
// Agent runs & audit
// ---------------------------------------------------------------------------

export interface CryptoAgentRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  trigger: 'manual' | 'cron';
  mode: 'claude' | 'deterministic';
  candidatesScreened: number;
  candidatesPassedSafety: number;
  proposalsCreated: number;
  autoExecuted: number;
  error?: string;
}

export type CryptoAuditEventType =
  | 'proposal.created'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'proposal.expired'
  | 'order.staged'
  | 'order.filled'
  | 'order.failed'
  | 'order.rejected'
  | 'position.opened'
  | 'position.scaled_out'
  | 'position.closed'
  | 'killswitch.activated'
  | 'killswitch.deactivated'
  | 'paper_mode.changed'
  | 'auto_trade.changed'
  | 'circuit_breaker.tripped'
  | 'system.updated'
  | 'agent.run';

export interface CryptoAuditEvent {
  id: string;
  occurredAt: string;
  actor: 'agent' | 'user' | 'system';
  actorId?: string;
  eventType: CryptoAuditEventType;
  entityType: 'proposal' | 'order' | 'position' | 'system' | 'run';
  entityId?: string;
  note?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export type GuardrailCode =
  | 'kill_switch'
  | 'invalid_order'
  | 'live_not_armed'
  | 'per_position_cap'
  | 'total_exposure_cap'
  | 'max_open_positions'
  | 'daily_loss_limit'
  | 'loss_cooldown'
  | 'safety_score'
  | 'liquidity_floor'
  | 'slippage_cap'
  | 'insufficient_bankroll'
  | 'duplicate_position';

export interface GuardrailResult {
  ok: boolean;
  code?: GuardrailCode;
  reason?: string;
}
