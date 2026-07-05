/**
 * ConfluenceTrading execution service — the deterministic bridge from an
 * approved proposal to a broker order. THIS FILE CONTAINS NO LLM CALLS.
 *
 * It is the only thing that stages/places orders, and it only runs because a
 * user approved a proposal. It enforces, in code, the canonical schema's
 * invariants (which Postgres backs with triggers/constraints):
 *   - an order may exist only for an `approved` proposal (invariant 2);
 *   - at most one active order per proposal (unique-index equivalent);
 *   - exposure caps + kill switch checked BEFORE staging (invariant 5/6);
 *   - live orders target only the pinned agentic account (invariant 4).
 *
 * Staging/submitting and polling are separate so fills can be reflected later.
 */

import { appendAudit } from '@/lib/db/confluence/audit';
import {
  getActiveOrders,
  getOrderById,
  hasActiveOrderForProposal,
  saveOrder,
  transitionOrder,
} from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getRiskConfig, getRoundTrips } from '@/lib/db/confluence/review';
import { checkGuardrails } from './guardrails';
import { checkPreTradeReviewRules } from './review/rules';
import { getBrokerAdapter } from './broker';
import { getBuyingPower } from './broker/live-adapter';
import type { ExecutionOrder, OrderParams, Proposal } from '@/types/confluence';
import { isTerminalOrderStatus } from '@/types/confluence';

export interface ExecuteResult {
  ok: boolean;
  order?: ExecutionOrder;
  reason?: string;
  code?: string;
}

/**
 * Turn an approved proposal + finalized order params into a placed order.
 * The caller (approve route) has already flipped the proposal to `approved`,
 * recorded the decision, and audited the approval; this owns everything
 * order-side.
 */
export async function executeApprovedProposal(
  proposal: Proposal,
  params: OrderParams,
  actorId: string,
  userId: string,
): Promise<ExecuteResult> {
  // Invariant 2: no order without an approved proposal.
  if (proposal.status !== 'approved') {
    return { ok: false, code: 'proposal_not_approved', reason: 'Proposal is not approved.' };
  }
  // At-most-one-active-order-per-proposal.
  if (await hasActiveOrderForProposal(proposal.id, userId)) {
    return { ok: false, code: 'duplicate_active_order', reason: 'Proposal already has an active order.' };
  }

  const state = await getSystemState(userId);
  const activeOrders = await getActiveOrders(userId);

  // Invariant 5/6: guardrails run BEFORE anything is staged. Never trust the model.
  const guard = checkGuardrails({ limitPrice: params.limitPrice, quantity: params.quantity }, state, activeOrders);
  if (!guard.ok) {
    return { ok: false, code: guard.code, reason: guard.reason };
  }

  // Milestone R review rules — ADDITIVE pre-trade checks (the guardrails
  // above and the human-approval gate are untouched): stop bounded by
  // maxR × risk unit, no probation symbols, symbol-breadth cap. Enforced in
  // code, never in prompts.
  const reviewCheck = checkPreTradeReviewRules(
    {
      symbol: proposal.symbol,
      side: proposal.direction,
      limitPrice: params.limitPrice,
      quantity: params.quantity,
      stopPrice: params.stopPrice,
    },
    {
      config: await getRiskConfig(userId),
      agenticTrades: await getRoundTrips(userId, 'agentic_rh'),
      activeOrderSymbols: activeOrders.map((o) => o.symbol),
    },
  );
  if (!reviewCheck.ok) {
    return { ok: false, code: reviewCheck.code, reason: reviewCheck.reason };
  }

  // Invariant 4: pin the account (live must target the agentic account).
  const accountNumber = state.paperMode ? 'PAPER' : state.agenticAccount!;

  // Live-only pre-trade check: block an order that can't fund before it reaches
  // the broker (belt-and-suspenders with the exposure caps). Any failure here
  // fails safe — nothing is staged.
  if (!state.paperMode) {
    const notional = params.limitPrice * params.quantity;
    try {
      const buyingPower = await getBuyingPower(accountNumber);
      if (notional > buyingPower) {
        return {
          ok: false,
          code: 'insufficient_buying_power',
          reason: `Order notional $${notional.toLocaleString()} exceeds account buying power $${buyingPower.toLocaleString()}.`,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, code: 'live_precheck_failed', reason: `Live pre-trade check failed: ${message}` };
    }
  }

  // Stage the order.
  const now = new Date().toISOString();
  const staged: ExecutionOrder = {
    id: crypto.randomUUID(),
    proposalId: proposal.id,
    createdAt: now,
    updatedAt: now,
    symbol: proposal.symbol,
    accountNumber,
    side: proposal.direction,
    type: 'limit',
    limitPrice: params.limitPrice,
    quantity: params.quantity,
    timeInForce: params.timeInForce,
    refId: crypto.randomUUID(), // idempotency key, re-sent verbatim on retry
    status: 'staged',
    filledQuantity: 0,
    isPaper: state.paperMode,
    history: [{ status: 'staged', ts: now }],
  };
  await saveOrder(staged, userId);
  await appendAudit(userId, {
    actor: 'system',
    actorId: 'system',
    eventType: 'order.staged',
    entityType: 'order',
    entityId: staged.id,
    after: {
      proposalId: proposal.id,
      symbol: proposal.symbol,
      side: staged.side,
      limitPrice: staged.limitPrice,
      quantity: staged.quantity,
      isPaper: staged.isPaper,
      account: accountNumber,
    },
    note: `Staged ${staged.isPaper ? 'paper' : 'live'} limit ${staged.side} ${staged.quantity} ${proposal.symbol} @ $${staged.limitPrice}`,
  });

  // Submit via the adapter for the current mode.
  const adapter = getBrokerAdapter(state.paperMode);
  try {
    const brokerState = await adapter.placeLimitOrder({
      orderId: staged.id,
      refId: staged.refId,
      accountNumber,
      symbol: proposal.symbol,
      side: staged.side,
      limitPrice: staged.limitPrice,
      quantity: staged.quantity,
      timeInForce: staged.timeInForce,
    });
    const submitted = await transitionOrder(staged.id, userId, {
      status: brokerState.status,
      filledQuantity: brokerState.filledQuantity,
      avgFillPrice: brokerState.avgFillPrice,
      brokerOrderId: brokerState.brokerOrderId,
      lastError: brokerState.error,
      detail: `submitted via ${adapter.name}`,
    });
    await appendAudit(userId, {
      actor: 'system',
      actorId: 'system',
      eventType: 'order.submitted',
      entityType: 'order',
      entityId: staged.id,
      after: { brokerOrderId: brokerState.brokerOrderId, status: brokerState.status },
      note: `Submitted ${proposal.symbol} to ${adapter.name} (${brokerState.status})`,
    });
    return { ok: true, order: submitted ?? staged };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown execution error';
    const failed = await transitionOrder(staged.id, userId, {
      status: 'failed',
      lastError: message,
      detail: 'adapter placeLimitOrder threw',
    });
    await appendAudit(userId, {
      actor: 'system',
      actorId: 'system',
      eventType: 'order.failed',
      entityType: 'order',
      entityId: staged.id,
      after: { lastError: message },
      note: `Order for ${proposal.symbol} failed: ${message}`,
    });
    return { ok: false, code: 'failed', reason: message, order: failed ?? staged };
  }
}

/**
 * Poll the broker for the latest status of an active order and persist any
 * change. Used by the monitoring UI's refresh and (later) a cron to reflect
 * fills. Returns the current order (unchanged if already terminal or missing).
 */
export async function refreshOrderStatus(orderId: string, userId: string): Promise<ExecutionOrder | null> {
  const order = await getOrderById(orderId, userId);
  if (!order) return null;
  if (!order.brokerOrderId || isTerminalOrderStatus(order.status)) return order;

  const adapter = getBrokerAdapter(order.isPaper);
  const brokerState = await adapter.getOrderStatus(order.brokerOrderId, order.accountNumber);
  if (brokerState.status === order.status && brokerState.filledQuantity === order.filledQuantity) {
    return order; // no change
  }

  const before = { status: order.status, filledQuantity: order.filledQuantity };
  const updated = await transitionOrder(orderId, userId, {
    status: brokerState.status,
    filledQuantity: brokerState.filledQuantity,
    avgFillPrice: brokerState.avgFillPrice,
    lastError: brokerState.error,
    detail: `polled ${adapter.name}`,
  });

  if (updated) {
    const eventType =
      brokerState.status === 'filled'
        ? 'order.filled'
        : brokerState.status === 'cancelled'
          ? 'order.cancelled'
          : 'order.status_changed';
    await appendAudit(userId, {
      actor: 'system',
      actorId: 'system',
      eventType,
      entityType: 'order',
      entityId: orderId,
      before,
      after: { status: brokerState.status, filledQuantity: brokerState.filledQuantity, avgFillPrice: brokerState.avgFillPrice },
      note: `${order.symbol ?? ''} order → ${brokerState.status}${brokerState.avgFillPrice ? ` @ $${brokerState.avgFillPrice}` : ''}`.trim(),
    });
  }
  return updated ?? order;
}

/**
 * Cancel an active order via the adapter and reflect the result. Used by the
 * monitoring UI and as part of the kill-switch flow.
 */
export async function cancelOrder(orderId: string, actorId: string, userId: string): Promise<ExecutionOrder | null> {
  const order = await getOrderById(orderId, userId);
  if (!order) return null;
  if (!order.brokerOrderId || isTerminalOrderStatus(order.status)) return order;

  const adapter = getBrokerAdapter(order.isPaper);
  const brokerState = await adapter.cancelOrder(order.brokerOrderId, order.accountNumber);
  const before = { status: order.status };
  const updated = await transitionOrder(orderId, userId, {
    status: brokerState.status,
    filledQuantity: brokerState.filledQuantity,
    avgFillPrice: brokerState.avgFillPrice,
    lastError: brokerState.error,
    detail: `cancel via ${adapter.name}`,
  });
  await appendAudit(userId, {
    actor: 'user',
    actorId,
    eventType: 'order.cancelled',
    entityType: 'order',
    entityId: orderId,
    before,
    after: { status: brokerState.status },
    note: `${order.symbol ?? ''} order cancel requested → ${brokerState.status}`.trim(),
  });
  return updated ?? order;
}
