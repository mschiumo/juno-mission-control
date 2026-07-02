/**
 * ConfluenceTrading — agentic swing-trading types (Milestone 1).
 *
 * Translated from the canonical PostgreSQL schema into this repo's Redis-backed
 * store. The DDL's invariants are enforced here in code (there are no DB
 * triggers in Redis), and the field/enum vocabulary matches the schema so the
 * two stay legible against each other.
 *
 * INVARIANTS (enforced by the execution service — see lib/confluence/*):
 *   1. The agent writes ONLY proposals. It never creates orders.
 *   2. An order may exist only for a proposal whose status = 'approved'
 *      (the human gate: no order without an explicit user approval).
 *   3. The audit log is append-only. Never updated or deleted.
 *   4. Every equity order is a LIMIT order, in the dedicated agentic account only.
 *   5. Exposure caps (per-position, total) are checked in CODE before an order
 *      is staged — never trusted to the model.
 *   6. When trading_enabled = false (kill switch) or paper_mode = true, the
 *      execution service must not submit LIVE orders.
 *
 * The one non-negotiable principle: the LLM's job ends at producing a proposal.
 * A separate deterministic service turns an *approved* proposal into an order,
 * and only ever in response to an explicit user approval.
 */

export type TradeDirection = 'buy' | 'sell';

/** proposal_status enum. `superseded` = replaced by a newer run's proposal. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'superseded';

/** Limit-only for now (see invariant 4); widen later if ever needed. */
export type OrderType = 'limit';

/** time_in_force: good-for-day / good-till-cancelled. */
export type TimeInForce = 'gfd' | 'gtc';

/**
 * order_status enum. No intermediate "working" state — a live-at-broker but
 * unfilled order is `submitted`.
 *  - staged            — created by the execution service, not yet sent.
 *  - submitted         — sent to the broker, live, unfilled.
 *  - partially_filled  — some quantity filled, remainder live.
 *  - filled            — fully filled. Terminal.
 *  - cancelled         — cancelled before full fill. Terminal.
 *  - rejected          — broker rejected. Terminal.
 *  - failed            — a guardrail/adapter error stopped it. Terminal.
 */
export type OrderStatus =
  | 'staged'
  | 'submitted'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'failed';

export type AuditActor = 'agent' | 'user' | 'system';

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['filled', 'cancelled', 'rejected', 'failed'];
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = ['staged', 'submitted', 'partially_filled'];

export function isTerminalOrderStatus(s: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(s);
}
export function isActiveOrderStatus(s: OrderStatus): boolean {
  return ACTIVE_ORDER_STATUSES.includes(s);
}

/**
 * system_state — the single global control record (kill switch + paper mode +
 * pinned agentic account). Modelled as one owner-keyed Redis object since this
 * feature is root-user-only. The exposure caps are operational config; the
 * canonical DDL omits them (caps aren't "spendable" state) but they must be
 * stored somewhere editable, and this record is their natural home.
 */
export interface SystemState {
  /** Master kill switch. FALSE = disarmed; the execution service places nothing.
   * Starts OFF — execution must be consciously armed. */
  tradingEnabled: boolean;
  /** TRUE = simulated fills, no live submission. Starts ON (M1/M2). */
  paperMode: boolean;
  /** The dedicated agentic account number; live orders must target only this. */
  agenticAccount?: string;
  /** Per-position notional cap (limitPrice * quantity). Enforced pre-order. */
  perPositionCapUsd: number;
  /** Total notional cap across all active orders. Enforced pre-order. */
  totalExposureCapUsd: number;
  updatedAt: string; // ISO
  updatedBy?: string;
}

export const DEFAULT_SYSTEM_STATE: Omit<SystemState, 'updatedAt'> = {
  tradingEnabled: false,
  paperMode: true,
  perPositionCapUsd: 2000,
  totalExposureCapUsd: 10000,
};

/** agent_runs — observability for each scheduled scan (populated in Milestone 2). */
export interface AgentRun {
  id: string;
  startedAt: string; // ISO
  finishedAt?: string;
  cadence?: string; // 'nightly' | 'weekly' | 'manual'
  universeSize?: number;
  proposalsGenerated: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  metadata: Record<string, unknown>;
}

/** A single fundamentals data point behind the thesis (fundamentals_snapshot). */
export interface FundamentalMetric {
  label: string;
  value: string | number;
  hint?: string;
}

/**
 * proposals — an IMMUTABLE snapshot of the agent's suggestion. User edits are
 * NOT written back here: the approved (possibly edited) parameters live on the
 * order row, and the diff is captured in the audit log. Only `status` /
 * `decided*` change after creation.
 */
export interface Proposal {
  id: string;
  runId?: string;
  createdAt: string; // ISO
  symbol: string;
  direction: TradeDirection;
  /** Plain-language rationale — the agent's job ends here. */
  thesis: string;
  suggestedLimitPrice?: number;
  suggestedQuantity?: number; // shares (fractional allowed)
  suggestedStopPrice?: number;
  suggestedTargetPrice?: number;
  /** The Massive data behind the call (fundamentals_snapshot). */
  fundamentals: FundamentalMetric[];
  status: ProposalStatus;
  /** Stale proposals auto-expire on the swing horizon. */
  expiresAt?: string;
  decidedAt?: string;
  decidedBy?: string;
}

/** The finalized order parameters at approval time (proposal defaults + edits). */
export interface OrderParams {
  limitPrice: number;
  quantity: number;
  timeInForce: TimeInForce;
  stopPrice?: number;
  targetPrice?: number;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  ts: string; // ISO
  detail?: string;
}

/**
 * orders — created ONLY on approval, owned by the deterministic execution layer.
 */
export interface ExecutionOrder {
  id: string;
  proposalId: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Denormalized from the proposal for display/audit (orders reference proposals). */
  symbol: string;
  /** Must equal system_state.agenticAccount for live orders ('PAPER' in paper mode). */
  accountNumber: string;
  side: TradeDirection;
  type: OrderType;
  limitPrice: number;
  quantity: number;
  timeInForce: TimeInForce;
  /** Idempotency key sent to the broker; re-sent verbatim on retry. */
  refId: string;
  /** Broker's order id once submitted. */
  brokerOrderId?: string;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice?: number;
  /** true = simulated, no live submission. */
  isPaper: boolean;
  submittedAt?: string;
  filledAt?: string;
  lastError?: string;
  /** Local status trail (the audit log is the canonical, immutable record). */
  history: OrderStatusEvent[];
}

export type AuditEntityType = 'proposal' | 'order' | 'system';

/** event_type vocabulary the service emits (matches the canonical schema). */
export type AuditEventType =
  | 'proposal.created'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'proposal.edited'
  | 'proposal.expired'
  | 'order.staged'
  | 'order.submitted'
  | 'order.status_changed'
  | 'order.filled'
  | 'order.cancelled'
  | 'order.failed'
  | 'killswitch.activated'
  | 'killswitch.deactivated'
  | 'paper_mode.changed';

/**
 * audit_log — append-only, immutable. Every proposal → decision → order
 * transition writes one, with before/after state for changes.
 */
export interface AuditEvent {
  id: string;
  occurredAt: string; // ISO
  actor: AuditActor;
  /** user id, agent run id, or 'system'. */
  actorId?: string;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
}

/** A derived open position (netted from filled orders, or the live broker). */
export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  /** Latest price when a quote was available. */
  marketPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
}

/** One point on the account-value equity curve. */
export interface BalancePoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/** Performance snapshot for the Agents → Performance panel. */
export interface PerformanceStats {
  /** 'live' = real Robinhood portfolio; 'paper' = simulated from the order log. */
  source: 'live' | 'paper';
  accountValue: number;
  buyingPower: number;
  cash: number;
  /** Cost basis currently deployed in open positions. */
  investedCost: number;
  /** Notional of active (non-terminal) orders. */
  openExposure: number;
  totalExposureCapUsd: number;
  realizedPnl: number;
  /** Present only when quotes were available to mark positions. */
  unrealizedPnl?: number;
  positionsCount: number;
  /** Whether current quotes were fetched (mark-to-market available). */
  quotesAvailable: boolean;
  proposals: { pending: number; approved: number; rejected: number; expired: number; total: number };
  orders: { filled: number; active: number; closed: number; total: number };
}

export interface PerformanceResponse {
  stats: PerformanceStats;
  positions: Position[];
  history: BalancePoint[];
}

/** Result of the deterministic guardrail check run before any order is placed. */
export interface GuardrailResult {
  ok: boolean;
  reason?: string;
  code?:
    | 'kill_switch'
    | 'per_position_cap'
    | 'total_exposure_cap'
    | 'invalid_order'
    | 'account_unset'
    | 'duplicate_active_order'
    | 'proposal_not_approved';
}
