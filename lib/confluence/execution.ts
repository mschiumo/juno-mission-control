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
  getExitChildrenForEntry,
  getOrderById,
  hasActiveOrderForProposal,
  saveOrder,
  transitionOrder,
} from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getRiskConfig, getRoundTrips } from '@/lib/db/confluence/review';
import { getRedisClient } from '@/lib/redis';
import { checkGuardrails } from './guardrails';
import { checkPreTradeReviewRules } from './review/rules';
import { getBrokerAdapter } from './broker';
import { getBuyingPower } from './broker/live-adapter';
import { oppositeSide, shouldPlaceProtectiveStop, type ProtectiveStopOptions } from './protective-stop';
import { shouldPlaceTakeProfit, shouldRestoreProtectiveStop } from './take-profit';
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
  // fails safe — nothing is staged. Sells don't consume buying power.
  if (!state.paperMode && proposal.direction === 'buy') {
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
    kind: 'entry',
    limitPrice: params.limitPrice,
    quantity: params.quantity,
    timeInForce: params.timeInForce,
    // The approved plan travels with the entry so the fill can chain its
    // protective stop (and the UI can show the intended exits).
    stopPrice: params.stopPrice,
    targetPrice: params.targetPrice,
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
 * Stage + place the protective stop for a filled entry order — deterministic
 * completion of the plan the HUMAN approved (the stop price came through the
 * approve route on the entry). Exit-only: side is the opposite of the entry,
 * quantity is the entry's FILLED quantity, type stop_market, GTC.
 *
 * Safe to call repeatedly (refresh + cron may race): a Redis lock serializes
 * per entry, and the pure guard re-checks children/state inside the lock.
 * The kill switch is absolute — disarmed skips placement and writes a LOUD
 * "position unprotected" audit event instead.
 */
export async function placeProtectiveStop(
  entryOrderId: string,
  userId: string,
  opts: ProtectiveStopOptions = {},
): Promise<ExecuteResult> {
  const redis = await getRedisClient();
  const lockKey = `confluence:stop-lock:${userId}:${entryOrderId}`;
  const acquired = await redis.set(lockKey, '1', { NX: true, EX: 60 });
  if (acquired !== 'OK') {
    return { ok: false, code: 'in_flight', reason: 'Protective-stop placement already in flight for this entry.' };
  }
  try {
    const entry = await getOrderById(entryOrderId, userId);
    if (!entry) return { ok: false, code: 'not_found', reason: 'Entry order not found.' };

    const children = await getExitChildrenForEntry(entry.id, userId);
    const state = await getSystemState(userId);
    const decision = shouldPlaceProtectiveStop(entry, children, state, opts);
    if (!decision.place) {
      if (decision.code === 'kill_switch') {
        await appendAudit(userId, {
          actor: 'system',
          actorId: 'system',
          eventType: 'order.protective_stop_skipped',
          entityType: 'order',
          entityId: entry.id,
          note:
            `⚠️ ${entry.symbol} position (${entry.filledQuantity} sh) is UNPROTECTED — trading is disarmed, so the ` +
            `stop @ $${entry.stopPrice} was NOT placed. Arm execution and refresh the order to place it.`,
        });
      }
      return { ok: false, code: decision.code, reason: decision.reason };
    }

    // Stage the stop. limitPrice mirrors the trigger so legacy notional/display
    // readers see a sane number; exposure math excludes protective stops anyway.
    // Quantity comes from the guard: the entry's fill minus shares its exits
    // already closed (a partial take-profit fill must shrink the stop).
    const stopQuantity = decision.quantity ?? entry.filledQuantity;
    const now = new Date().toISOString();
    const staged: ExecutionOrder = {
      id: crypto.randomUUID(),
      proposalId: entry.proposalId,
      createdAt: now,
      updatedAt: now,
      symbol: entry.symbol,
      accountNumber: entry.accountNumber,
      side: oppositeSide(entry.side),
      type: 'stop_market',
      kind: 'protective_stop',
      protectsOrderId: entry.id,
      limitPrice: entry.stopPrice!,
      stopPrice: entry.stopPrice,
      quantity: stopQuantity,
      timeInForce: 'gtc',
      refId: crypto.randomUUID(),
      status: 'staged',
      filledQuantity: 0,
      isPaper: entry.isPaper,
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
        protectsOrderId: entry.id,
        symbol: entry.symbol,
        side: staged.side,
        stopPrice: staged.stopPrice,
        quantity: staged.quantity,
        isPaper: staged.isPaper,
      },
      note: `Staged ${staged.isPaper ? 'paper' : 'live'} protective stop: ${staged.side} ${staged.quantity} ${entry.symbol} @ stop $${staged.stopPrice} (gtc)`,
    });

    const adapter = getBrokerAdapter(entry.isPaper);
    try {
      const brokerState = await adapter.placeStopOrder({
        orderId: staged.id,
        refId: staged.refId,
        accountNumber: entry.accountNumber,
        symbol: entry.symbol,
        side: staged.side,
        stopPrice: entry.stopPrice!,
        quantity: stopQuantity,
        timeInForce: 'gtc',
      });
      const submitted = await transitionOrder(staged.id, userId, {
        status: brokerState.status,
        filledQuantity: brokerState.filledQuantity,
        avgFillPrice: brokerState.avgFillPrice,
        brokerOrderId: brokerState.brokerOrderId,
        lastError: brokerState.error,
        detail: `protective stop via ${adapter.name}`,
      });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.protective_stop_placed',
        entityType: 'order',
        entityId: staged.id,
        after: { brokerOrderId: brokerState.brokerOrderId, status: brokerState.status, stopPrice: staged.stopPrice },
        note: `Protective stop for ${entry.symbol} → ${adapter.name} (${brokerState.status}): ${staged.side} ${staged.quantity} @ stop $${staged.stopPrice}`,
      });
      return { ok: true, order: submitted ?? staged };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown execution error';
      const failed = await transitionOrder(staged.id, userId, {
        status: 'failed',
        lastError: message,
        detail: 'adapter placeStopOrder threw',
      });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.failed',
        entityType: 'order',
        entityId: staged.id,
        after: { lastError: message },
        note: `⚠️ Protective stop for ${entry.symbol} FAILED (position unprotected): ${message}`,
      });
      return { ok: false, code: 'failed', reason: message, order: failed ?? staged };
    }
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

/**
 * Stage + place the take-profit limit for a held entry whose approved target
 * has been reached — deterministic completion of the plan the HUMAN approved
 * (the target price came through the approve route on the entry). Exit-only:
 * side is the opposite of the entry, the limit price IS the approved target
 * (so it fills at target or better), quantity is the entry's still-held
 * shares, GTC.
 *
 * The resting protective stop reserves the same shares at the broker, so it
 * is cancelled first; if the take-profit placement then fails, the stop is
 * re-placed (fail-safe) so the position is never left unprotected. Safe to
 * call repeatedly (the poll cron re-fires every cycle while at target): a
 * Redis lock serializes per entry, and the pure guard re-checks children
 * inside the lock. The kill switch is absolute — disarmed skips placement and
 * writes a LOUD "target reached but disarmed" audit event instead (throttled
 * so a 30-minute poll doesn't spam the log).
 */
export async function placeTakeProfit(
  entryOrderId: string,
  lastPrice: number,
  userId: string,
): Promise<ExecuteResult> {
  const redis = await getRedisClient();
  const lockKey = `confluence:tp-lock:${userId}:${entryOrderId}`;
  const acquired = await redis.set(lockKey, '1', { NX: true, EX: 60 });
  if (acquired !== 'OK') {
    return { ok: false, code: 'in_flight', reason: 'Take-profit placement already in flight for this entry.' };
  }
  try {
    const entry = await getOrderById(entryOrderId, userId);
    if (!entry) return { ok: false, code: 'not_found', reason: 'Entry order not found.' };

    const state = await getSystemState(userId);
    const decision = shouldPlaceTakeProfit(entry, await getExitChildrenForEntry(entry.id, userId), lastPrice, state);
    if (!decision.place) {
      if (decision.code === 'kill_switch') {
        // Once per 12h per entry — the poll re-checks every 30 min while the
        // symbol trades at target, and the audit log must stay readable.
        const flag = await redis.set(`confluence:tp-killswitch-audited:${userId}:${entry.id}`, '1', {
          NX: true,
          EX: 12 * 60 * 60,
        });
        if (flag === 'OK') {
          await appendAudit(userId, {
            actor: 'system',
            actorId: 'system',
            eventType: 'order.take_profit_skipped',
            entityType: 'order',
            entityId: entry.id,
            note:
              `⚠️ ${entry.symbol} is AT TARGET ($${lastPrice} vs $${entry.targetPrice}) but trading is disarmed — ` +
              `take-profit NOT placed. Arm execution to lock in the profit (the protective stop stays working).`,
          });
        }
      }
      return { ok: false, code: decision.code, reason: decision.reason };
    }

    // The broker rejects a sell against shares reserved by the resting stop:
    // cancel it first. If the cancel instead reveals the stop FILLED (price
    // whipsawed to the stop while we acted), the position is closing there —
    // stand down, nothing to take profit on.
    const cancelledStopIds: string[] = [];
    for (const stopId of decision.cancelStopIds ?? []) {
      const result = await cancelOrder(stopId, 'system:take-profit', userId);
      if (result && result.status !== 'cancelled') {
        await appendAudit(userId, {
          actor: 'system',
          actorId: 'system',
          eventType: 'order.take_profit_skipped',
          entityType: 'order',
          entityId: entry.id,
          after: { stopId, stopStatus: result.status },
          note: `${entry.symbol} take-profit stood down: the protective stop resolved ${result.status} during cancellation.`,
        });
        return {
          ok: false,
          code: 'stop_not_cancelled',
          reason: `Protective stop resolved ${result.status} instead of cancelled — take-profit stood down.`,
        };
      }
      if (result) cancelledStopIds.push(stopId);
    }

    // Stage the take-profit at the APPROVED target — a limit fills at target
    // or better by construction.
    const now = new Date().toISOString();
    const staged: ExecutionOrder = {
      id: crypto.randomUUID(),
      proposalId: entry.proposalId,
      createdAt: now,
      updatedAt: now,
      symbol: entry.symbol,
      accountNumber: entry.accountNumber,
      side: oppositeSide(entry.side),
      type: 'limit',
      kind: 'take_profit',
      protectsOrderId: entry.id,
      limitPrice: entry.targetPrice!,
      targetPrice: entry.targetPrice,
      quantity: decision.quantity!,
      timeInForce: 'gtc',
      refId: crypto.randomUUID(),
      status: 'staged',
      filledQuantity: 0,
      isPaper: entry.isPaper,
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
        protectsOrderId: entry.id,
        symbol: entry.symbol,
        side: staged.side,
        limitPrice: staged.limitPrice,
        quantity: staged.quantity,
        isPaper: staged.isPaper,
      },
      note: `Staged ${staged.isPaper ? 'paper' : 'live'} take-profit: ${staged.side} ${staged.quantity} ${entry.symbol} limit $${staged.limitPrice} (gtc)`,
    });

    const adapter = getBrokerAdapter(entry.isPaper);
    try {
      const brokerState = await adapter.placeLimitOrder({
        orderId: staged.id,
        refId: staged.refId,
        accountNumber: entry.accountNumber,
        symbol: entry.symbol,
        side: staged.side,
        limitPrice: staged.limitPrice,
        quantity: staged.quantity,
        timeInForce: 'gtc',
      });
      const submitted = await transitionOrder(staged.id, userId, {
        status: brokerState.status,
        filledQuantity: brokerState.filledQuantity,
        avgFillPrice: brokerState.avgFillPrice,
        brokerOrderId: brokerState.brokerOrderId,
        lastError: brokerState.error,
        detail: `take-profit via ${adapter.name}`,
      });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.take_profit_placed',
        entityType: 'order',
        entityId: staged.id,
        after: { brokerOrderId: brokerState.brokerOrderId, status: brokerState.status, limitPrice: staged.limitPrice, lastPrice },
        note: `🎯 ${entry.symbol} hit its approved target (last $${lastPrice}) — take-profit → ${adapter.name} (${brokerState.status}): ${staged.side} ${staged.quantity} limit $${staged.limitPrice}`,
      });
      return { ok: true, order: submitted ?? staged };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown execution error';
      const failed = await transitionOrder(staged.id, userId, {
        status: 'failed',
        lastError: message,
        detail: 'adapter placeLimitOrder threw (take-profit)',
      });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.failed',
        entityType: 'order',
        entityId: staged.id,
        after: { lastError: message },
        note: `⚠️ Take-profit for ${entry.symbol} FAILED: ${message}`,
      });
      // Fail-safe: we cancelled the stop to make room for this order — put
      // the protection back so the position isn't left naked at a high.
      if (cancelledStopIds.length > 0) {
        // placeProtectiveStop audits its own success; only the double failure
        // needs a loud signal here.
        const restore = await placeProtectiveStop(entry.id, userId, { ignoreCancelledStops: true });
        if (!restore.ok) {
          await appendAudit(userId, {
            actor: 'system',
            actorId: 'system',
            eventType: 'order.protective_stop_skipped',
            entityType: 'order',
            entityId: entry.id,
            note: `⚠️ ${entry.symbol} position is UNPROTECTED — take-profit failed AND the stop could not be re-placed (${restore.reason ?? restore.code}).`,
          });
        }
      }
      return { ok: false, code: 'failed', reason: message, order: failed ?? staged };
    }
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

/**
 * The retreat half of the synthetic OCO: price reached the target (a
 * take-profit is resting, the stop was pulled) but has now RETREATED through
 * the hysteresis band without filling — cancel the take-profit and re-arm
 * the protective stop for the remaining shares. Shares that DID fill at the
 * target stay sold; only the unfilled remainder gets its stop back.
 *
 * Shares the same per-entry lock as placeTakeProfit so the two OCO
 * transitions serialize. A disarmed system does nothing (the guard refuses
 * to pull the position's only working exit).
 */
export async function restoreProtectiveStop(
  entryOrderId: string,
  lastPrice: number,
  userId: string,
): Promise<ExecuteResult> {
  const redis = await getRedisClient();
  const lockKey = `confluence:tp-lock:${userId}:${entryOrderId}`;
  const acquired = await redis.set(lockKey, '1', { NX: true, EX: 60 });
  if (acquired !== 'OK') {
    return { ok: false, code: 'in_flight', reason: 'OCO transition already in flight for this entry.' };
  }
  try {
    const entry = await getOrderById(entryOrderId, userId);
    if (!entry) return { ok: false, code: 'not_found', reason: 'Entry order not found.' };

    const state = await getSystemState(userId);
    const decision = shouldRestoreProtectiveStop(
      entry,
      await getExitChildrenForEntry(entry.id, userId),
      lastPrice,
      state,
    );
    if (!decision.restore) {
      return { ok: false, code: decision.code, reason: decision.reason };
    }

    // Pull the unfilled take-profit. If it actually FILLED while we acted,
    // the profit is locked — nothing to restore for those shares.
    const pulled = await cancelOrder(decision.takeProfitOrderId!, 'system:oco-retreat', userId);
    if (pulled && pulled.status !== 'cancelled') {
      return {
        ok: false,
        code: 'take_profit_not_cancelled',
        reason: `Take-profit resolved ${pulled.status} instead of cancelled — no restore needed.`,
      };
    }

    // Re-arm the stop for whatever is still held (the guard sizes it).
    const restored = await placeProtectiveStop(entry.id, userId, { ignoreCancelledStops: true });
    if (restored.ok) {
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.protective_stop_placed',
        entityType: 'order',
        entityId: entry.id,
        after: { lastPrice, targetPrice: entry.targetPrice },
        note: `↩️ ${entry.symbol} retreated from target (last $${lastPrice} vs $${entry.targetPrice}) — take-profit cancelled, protective stop re-armed.`,
      });
    } else if (restored.code !== 'position_closed') {
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.protective_stop_skipped',
        entityType: 'order',
        entityId: entry.id,
        note: `⚠️ ${entry.symbol} position is UNPROTECTED — take-profit pulled on retreat but the stop could not be re-placed (${restored.reason ?? restored.code}).`,
      });
    }
    return restored;
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

/**
 * Chain a protective stop off an entry order when its latest transition left
 * protectable shares (filled, or terminal with a partial fill). Failures never
 * break the caller — the audit trail carries the story and the poll cron
 * re-attempts (failed children don't block re-placement).
 */
async function maybeChainProtectiveStop(order: ExecutionOrder, userId: string): Promise<void> {
  if ((order.kind ?? 'entry') !== 'entry') return;
  if (!(typeof order.stopPrice === 'number' && order.stopPrice > 0)) return;
  if (!(order.filledQuantity > 0)) return;
  if (order.status !== 'filled' && !isTerminalOrderStatus(order.status)) return;
  try {
    await placeProtectiveStop(order.id, userId);
  } catch {
    /* audited inside; never break the refresh/cancel that detected the fill */
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
    // Fill detected → complete the approved plan with its protective stop.
    await maybeChainProtectiveStop(updated, userId);
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
    // Auto-expiry and the take-profit flow cancel with a 'system:*' actorId —
    // don't misattribute those to the user in the audit trail.
    actor: actorId.startsWith('system') ? 'system' : 'user',
    actorId,
    eventType: 'order.cancelled',
    entityType: 'order',
    entityId: orderId,
    before,
    after: { status: brokerState.status },
    note: `${order.symbol ?? ''} order cancel requested → ${brokerState.status}`.trim(),
  });
  // A cancelled entry can still hold a partial fill — protect those shares.
  if (updated) await maybeChainProtectiveStop(updated, userId);
  return updated ?? order;
}
