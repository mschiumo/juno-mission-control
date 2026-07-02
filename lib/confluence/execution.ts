/**
 * ConfluenceTrading execution service — the deterministic bridge from an
 * approved proposal to a broker order. THIS FILE CONTAINS NO LLM CALLS.
 *
 * It is the only thing that stages/places orders, and it only ever runs because
 * a user tapped Approve. The flow for one approval:
 *
 *   1. Load settings + open orders.
 *   2. Run guardrails (kill switch, caps). Block → fail-safe, no order.
 *   3. Stage an ExecutionOrder (status `staged`).
 *   4. Submit via the mode's BrokerAdapter (paper today, live in M3).
 *   5. Persist the returned state; audit every transition.
 *
 * Placing and polling are separate so status can be refreshed later (fills come
 * back asynchronously from a real broker).
 */

import { appendAudit } from '@/lib/db/confluence/audit';
import { getOpenOrders, saveOrder, transitionOrder, getOrderById } from '@/lib/db/confluence/orders';
import { getSettings } from '@/lib/db/confluence/settings';
import { updateProposal } from '@/lib/db/confluence/proposals';
import { checkGuardrails } from './guardrails';
import { getBrokerAdapter } from './broker';
import type { ExecutionOrder, Proposal } from '@/types/confluence';

export interface ExecuteResult {
  ok: boolean;
  order?: ExecutionOrder;
  /** Guardrail/validation reason when ok === false. */
  reason?: string;
}

/**
 * Turn an approved proposal into a placed order. Assumes the caller has already
 * flipped the proposal to `approved` and recorded the decision + audit for the
 * approval itself; this function owns everything order-side.
 */
export async function executeApprovedProposal(
  proposal: Proposal,
  userId: string,
): Promise<ExecuteResult> {
  const settings = await getSettings(userId);
  const openOrders = await getOpenOrders(userId);

  // 1–2. Guardrails. Never trust the model to have respected the caps.
  const guard = checkGuardrails(proposal, settings, openOrders);
  if (!guard.ok) {
    await appendAudit(userId, {
      actor: 'system',
      type: 'guardrail_blocked',
      summary: `Order blocked for ${proposal.ticker}: ${guard.reason}`,
      proposalId: proposal.id,
      data: { code: guard.code },
    });
    return { ok: false, reason: guard.reason };
  }

  // 3. Stage the order.
  const now = new Date().toISOString();
  const staged: ExecutionOrder = {
    id: crypto.randomUUID(),
    userId,
    proposalId: proposal.id,
    createdAt: now,
    updatedAt: now,
    mode: settings.mode,
    side: proposal.direction,
    ticker: proposal.ticker,
    orderType: 'limit',
    limitPrice: proposal.suggestedLimitPrice,
    shares: proposal.suggestedShares,
    timeInForce: proposal.timeInForce,
    status: 'staged',
    filledShares: 0,
    history: [{ status: 'staged', ts: now }],
  };
  await saveOrder(staged, userId);
  await updateProposal(proposal.id, { orderId: staged.id }, userId);
  await appendAudit(userId, {
    actor: 'system',
    type: 'order_staged',
    summary: `Staged ${staged.mode} limit ${staged.side} ${staged.shares} ${staged.ticker} @ $${staged.limitPrice}`,
    proposalId: proposal.id,
    orderId: staged.id,
    data: { mode: staged.mode },
  });

  // 4. Submit via the adapter for the current mode.
  const adapter = getBrokerAdapter(settings.mode);
  try {
    const state = await adapter.placeLimitOrder({
      orderId: staged.id,
      ticker: staged.ticker,
      side: staged.side,
      limitPrice: staged.limitPrice,
      shares: staged.shares,
      timeInForce: staged.timeInForce,
    });
    const submitted = await transitionOrder(staged.id, userId, {
      status: state.status,
      filledShares: state.filledShares,
      avgFillPrice: state.avgFillPrice,
      brokerOrderId: state.brokerOrderId,
      error: state.error,
      detail: `submitted via ${adapter.name}`,
    });
    await appendAudit(userId, {
      actor: 'system',
      type: 'order_submitted',
      summary: `Submitted ${staged.ticker} order to ${adapter.name} (${state.status})`,
      proposalId: proposal.id,
      orderId: staged.id,
      data: { brokerOrderId: state.brokerOrderId, status: state.status },
    });
    return { ok: true, order: submitted ?? staged };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown execution error';
    const failed = await transitionOrder(staged.id, userId, {
      status: 'failed',
      error: message,
      detail: 'adapter placeLimitOrder threw',
    });
    await appendAudit(userId, {
      actor: 'system',
      type: 'order_failed',
      summary: `Order for ${staged.ticker} failed: ${message}`,
      proposalId: proposal.id,
      orderId: staged.id,
    });
    return { ok: false, reason: message, order: failed ?? staged };
  }
}

/**
 * Poll the broker for the latest status of a non-terminal order and persist any
 * change. Used by the monitoring UI's refresh and (later) a cron to reflect
 * fills. Returns the current order (unchanged if already terminal or missing).
 */
export async function refreshOrderStatus(
  orderId: string,
  userId: string,
): Promise<ExecutionOrder | null> {
  const order = await getOrderById(orderId, userId);
  if (!order) return null;
  if (!order.brokerOrderId) return order; // never submitted (staged/failed)
  if (['filled', 'canceled', 'rejected', 'failed'].includes(order.status)) return order;

  const adapter = getBrokerAdapter(order.mode);
  const state = await adapter.getOrderStatus(order.brokerOrderId);
  if (state.status === order.status && state.filledShares === order.filledShares) {
    return order; // no change
  }

  const updated = await transitionOrder(orderId, userId, {
    status: state.status,
    filledShares: state.filledShares,
    avgFillPrice: state.avgFillPrice,
    error: state.error,
    detail: `polled ${adapter.name}`,
  });

  if (updated) {
    const type =
      state.status === 'filled'
        ? 'order_filled'
        : state.status === 'canceled'
          ? 'order_canceled'
          : 'order_status';
    await appendAudit(userId, {
      actor: 'system',
      type,
      summary: `${order.ticker} order → ${state.status}${
        state.avgFillPrice ? ` @ $${state.avgFillPrice}` : ''
      }`,
      proposalId: order.proposalId,
      orderId,
      data: { status: state.status, filledShares: state.filledShares },
    });
  }
  return updated ?? order;
}

/**
 * Cancel a working order via the adapter and reflect the result. Used by the
 * monitoring UI and as part of the kill-switch flow.
 */
export async function cancelOrder(orderId: string, userId: string): Promise<ExecutionOrder | null> {
  const order = await getOrderById(orderId, userId);
  if (!order) return null;
  if (!order.brokerOrderId || ['filled', 'canceled', 'rejected', 'failed'].includes(order.status)) {
    return order;
  }
  const adapter = getBrokerAdapter(order.mode);
  const state = await adapter.cancelOrder(order.brokerOrderId);
  const updated = await transitionOrder(orderId, userId, {
    status: state.status,
    filledShares: state.filledShares,
    avgFillPrice: state.avgFillPrice,
    error: state.error,
    detail: `cancel via ${adapter.name}`,
  });
  await appendAudit(userId, {
    actor: 'user',
    type: 'order_canceled',
    summary: `${order.ticker} order cancel requested → ${state.status}`,
    proposalId: order.proposalId,
    orderId,
  });
  return updated ?? order;
}
