/**
 * ConfluenceTrading — agentic swing-trading types.
 *
 * The one non-negotiable design principle: the agent never has execution
 * authority. An LLM produces a {@link Proposal} and nothing more. A separate,
 * deterministic execution service turns an *approved* proposal into an
 * {@link ExecutionOrder} — and it only ever runs in response to an explicit
 * user approval. These types encode that one-directional flow:
 *
 *   agent run → Proposal(pending) → [user taps Approve] → ExecutionOrder → fills
 *
 * Every state transition also appends an immutable {@link AuditEvent}.
 */

/** Which system produced a proposal. The LLM path is `agent`; `manual` covers
 * hand-entered or seeded proposals (used to exercise the spine in paper mode). */
export type ProposalSource = 'agent' | 'manual';

/** Buy = open/add a long swing entry; sell = trim/close. Equities-only for now. */
export type TradeDirection = 'buy' | 'sell';

/**
 * Proposal lifecycle. This is the human gate:
 *  - `pending`  — awaiting the user's decision. The only state an agent creates.
 *  - `approved` — user approved; an ExecutionOrder has been (or is being) staged.
 *  - `rejected` — user rejected; terminal, no order is ever created.
 *  - `expired`  — the proposal aged out before a decision (staleness guard).
 */
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** A single fundamentals data point the agent cited in its thesis. Kept as a
 * flat labelled list so the review UI can render "the fundamentals behind it"
 * without the frontend knowing the shape of every metric. */
export interface FundamentalMetric {
  /** e.g. "P/E (TTM)", "Revenue growth YoY", "Free cash flow". */
  label: string;
  /** Display value; string so we can carry units/formatting ("18.4%", "$1.2B"). */
  value: string | number;
  /** Optional one-line context, e.g. "vs 22 sector median". */
  hint?: string;
}

/** Records how a proposal's numbers were changed before approval, so the audit
 * trail shows the human's edits distinct from the agent's original suggestion. */
export interface ProposalEdit {
  field: 'suggestedLimitPrice' | 'suggestedShares' | 'stopPrice' | 'targetPrice' | 'timeInForce';
  from: string | number | undefined;
  to: string | number | undefined;
}

export interface ProposalDecision {
  action: 'approved' | 'rejected';
  /** Owner email that made the call — the only actor allowed to decide. */
  decidedBy: string;
  decidedAt: string; // ISO
  note?: string;
}

export interface Proposal {
  id: string;
  userId: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO

  source: ProposalSource;
  /** The agent run that produced this proposal (set for source === 'agent'). */
  runId?: string;

  status: ProposalStatus;

  ticker: string;
  direction: TradeDirection;

  /** Plain-language rationale — the agent's job ends here. */
  thesis: string;
  /** The fundamentals the thesis rests on, for the review screen. */
  fundamentals: FundamentalMetric[];

  /** Suggested LIMIT price for a staged swing entry (never market orders). */
  suggestedLimitPrice: number;
  /** Suggested position size in shares. */
  suggestedShares: number;
  stopPrice?: number;
  targetPrice?: number;
  timeInForce: 'day' | 'gtc';

  /** Present once the user decides. */
  decision?: ProposalDecision;
  /** Human edits applied before approval (empty/absent if accepted as-is). */
  edits?: ProposalEdit[];
  /** The order staged when this proposal was approved. */
  orderId?: string;
}

/** Fields the user may change while a proposal is still `pending`. */
export interface ProposalPatch {
  suggestedLimitPrice?: number;
  suggestedShares?: number;
  stopPrice?: number | null;
  targetPrice?: number | null;
  timeInForce?: 'day' | 'gtc';
}

/**
 * Execution-side order lifecycle. Distinct from ProposalStatus on purpose: the
 * proposal captures the *decision*, the order captures what the broker did.
 *  - `staged`           — created by the execution service, not yet sent.
 *  - `submitted`        — handed to the broker adapter.
 *  - `working`          — live/open at the broker, unfilled or partially filled.
 *  - `filled`           — fully filled. Terminal.
 *  - `partially_filled` — some shares filled, remainder still working.
 *  - `canceled`         — canceled before full fill. Terminal.
 *  - `rejected`         — broker rejected the order. Terminal.
 *  - `failed`           — a guardrail or adapter error stopped it. Terminal.
 */
export type OrderStatus =
  | 'staged'
  | 'submitted'
  | 'working'
  | 'partially_filled'
  | 'filled'
  | 'canceled'
  | 'rejected'
  | 'failed';

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'filled',
  'canceled',
  'rejected',
  'failed',
];

export function isTerminalOrderStatus(s: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(s);
}

/** `paper` = execution stubbed by the deterministic paper adapter (Milestone 1).
 * `live` = real Robinhood MCP order placement (Milestone 3, gated + capped). */
export type ExecutionMode = 'paper' | 'live';

export interface OrderStatusEvent {
  status: OrderStatus;
  ts: string; // ISO
  detail?: string;
}

export interface ExecutionOrder {
  id: string;
  userId: string;
  proposalId: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO

  mode: ExecutionMode;
  side: TradeDirection;
  ticker: string;
  orderType: 'limit'; // staged swing entries are always limit orders
  limitPrice: number;
  shares: number;
  timeInForce: 'day' | 'gtc';

  status: OrderStatus;
  filledShares: number;
  avgFillPrice?: number;

  /** Adapter/broker id, once submitted. */
  brokerOrderId?: string;
  /** Append-only status trail for this order. */
  history: OrderStatusEvent[];
  /** Set when status is `failed`/`rejected`. */
  error?: string;
}

/** Who caused an audited event. */
export type AuditActor = 'agent' | 'user' | 'system';

export type AuditEventType =
  | 'proposal_created'
  | 'proposal_edited'
  | 'proposal_approved'
  | 'proposal_rejected'
  | 'proposal_expired'
  | 'order_staged'
  | 'order_submitted'
  | 'order_status'
  | 'order_filled'
  | 'order_canceled'
  | 'order_failed'
  | 'guardrail_blocked'
  | 'kill_switch'
  | 'mode_changed'
  | 'settings_changed';

/**
 * Immutable audit record. Every proposal → decision → order transition writes
 * one. Stored append-only (Redis list) so the trail can never be rewritten.
 */
export interface AuditEvent {
  id: string;
  userId: string;
  ts: string; // ISO
  actor: AuditActor;
  type: AuditEventType;
  /** Human-readable one-liner for the audit view. */
  summary: string;
  proposalId?: string;
  orderId?: string;
  /** Optional structured payload (edited fields, guardrail detail, etc.). */
  data?: Record<string, unknown>;
}

/**
 * Per-user ConfluenceTrading configuration and the hard guardrails enforced in
 * code (never in prompts). The execution service reads these on every run.
 */
export interface ConfluenceSettings {
  userId: string;
  /** Feature master switch for the UI/agent. */
  enabled: boolean;
  /** paper (stubbed) vs live (real MCP). Starts paper; flipping to live is the
   * Milestone-3 gate. */
  mode: ExecutionMode;
  /**
   * Kill switch. When true the execution service refuses to place any order,
   * regardless of approvals. Disconnecting the agent / halting execution.
   */
  killSwitch: boolean;
  /** Max notional (limitPrice * shares) for a single position. Enforced pre-order. */
  perPositionCapUsd: number;
  /** Max total notional across all non-terminal orders. Enforced pre-order. */
  totalExposureCapUsd: number;
  updatedAt: string; // ISO
}

export const DEFAULT_CONFLUENCE_SETTINGS: Omit<ConfluenceSettings, 'userId' | 'updatedAt'> = {
  enabled: true,
  mode: 'paper',
  killSwitch: false,
  perPositionCapUsd: 2000,
  totalExposureCapUsd: 10000,
};

/** Result of the deterministic guardrail check run before any order is placed. */
export interface GuardrailResult {
  ok: boolean;
  /** Populated when ok === false; the reason the order was blocked. */
  reason?: string;
  code?: 'kill_switch' | 'disabled' | 'per_position_cap' | 'total_exposure_cap' | 'invalid_order';
}
