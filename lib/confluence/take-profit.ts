/**
 * Take-profit decision logic — pure, deterministic, unit-testable.
 *
 * PRINCIPLE: the target price is part of the trade plan the HUMAN approved
 * (OrderParams.targetPrice flows through the approve route into
 * executeApprovedProposal and is denormalized onto the entry order). When the
 * position trades at/through that target, placing a LIMIT exit at the target
 * (fills at target or better) is deterministic completion of the approved
 * plan — no new discretion, and it can only REDUCE exposure.
 *
 * The broker rejects a second sell against shares already reserved by the
 * resting protective stop, so the decision also names the active stops the
 * caller must cancel before placing the take-profit. The caller owns the
 * fail-safe: if the take-profit placement then fails, the protective stop it
 * cancelled must be re-placed so the position is never left unprotected.
 *
 * The kill switch (system_state.tradingEnabled) is still absolute: a disarmed
 * system places nothing, including exposure-reducing exits. When disarmed the
 * caller must skip placement and write a LOUD audit event.
 */

import type { ExecutionOrder, SystemState } from '@/types/confluence';
import { isActiveOrderStatus, isTerminalOrderStatus } from '@/types/confluence';

/**
 * Restore hysteresis: price must retreat this far through the target (0.5%)
 * before the stop is re-armed, so a symbol oscillating on the target line
 * doesn't flap between stop and take-profit every poll.
 */
export const TP_RETREAT_FRACTION = 0.995;

export interface TakeProfitDecision {
  place: boolean;
  /** Populated when place = true: shares still held from this entry. */
  quantity?: number;
  /** Populated when place = true: active protective stops to cancel first
   * (their shares are reserved at the broker and would block the sell). */
  cancelStopIds?: string[];
  /** Populated when place = false. */
  code?:
    | 'not_entry'
    | 'not_filled'
    | 'no_target_price'
    | 'target_not_reached'
    | 'position_closed'
    | 'already_placed'
    | 'kill_switch';
  reason?: string;
}

/** Has the market touched the approved target? Long entries take profit when
 * price rises to the target; short entries when it falls to it. */
export function targetReached(
  entrySide: 'buy' | 'sell',
  lastPrice: number,
  targetPrice: number,
): boolean {
  return entrySide === 'buy' ? lastPrice >= targetPrice : lastPrice <= targetPrice;
}

/**
 * Should a take-profit limit be staged for this entry order right now?
 *
 * Pure guard used by the execution service's placeTakeProfit. Checks run
 * cheapest/structural first; the kill switch is evaluated LAST so a disarmed
 * system only produces the loud "target reached but disarmed" signal when a
 * take-profit would actually have been placed.
 *
 * `existingChildren` must include ALL exit children of the entry (protective
 * stops AND take-profits): stop fills reduce the shares left to close, and a
 * prior take-profit child gates re-placement.
 */
export function shouldPlaceTakeProfit(
  entryOrder: ExecutionOrder,
  existingChildren: ExecutionOrder[],
  lastPrice: number,
  systemState: SystemState,
): TakeProfitDecision {
  // Only entries chain exits (absent kind = legacy entry). An exit filling
  // must never chain another order.
  if ((entryOrder.kind ?? 'entry') !== 'entry') {
    return { place: false, code: 'not_entry', reason: 'Only entry orders chain a take-profit.' };
  }
  // Same settled-fill rule as the protective stop: a still-working entry may
  // keep filling, so exits wait for the final quantity.
  const settledFill =
    entryOrder.filledQuantity > 0 &&
    (entryOrder.status === 'filled' || isTerminalOrderStatus(entryOrder.status));
  if (!settledFill) {
    return { place: false, code: 'not_filled', reason: 'Entry order has no settled fill to exit yet.' };
  }
  if (!(typeof entryOrder.targetPrice === 'number' && entryOrder.targetPrice > 0)) {
    return { place: false, code: 'no_target_price', reason: 'Entry order carries no approved target price.' };
  }
  if (!(Number.isFinite(lastPrice) && targetReached(entryOrder.side, lastPrice, entryOrder.targetPrice))) {
    return { place: false, code: 'target_not_reached', reason: 'Position is not trading at the approved target.' };
  }

  const children = existingChildren.filter((c) => c.protectsOrderId === entryOrder.id);

  // Shares still held from this entry: the settled fill minus whatever its
  // exits (stop or take-profit) have already closed. A stop that partially
  // filled before we got here shrinks the take-profit, not doubles it.
  const closed = children.reduce((sum, c) => sum + Math.max(0, c.filledQuantity), 0);
  const remaining = entryOrder.filledQuantity - closed;
  if (!(remaining > 0)) {
    return { place: false, code: 'position_closed', reason: 'The entry’s shares are already exited.' };
  }

  // Ignore FAILED take-profits so the poll cron re-attempts after a failed
  // placement. Everything else blocks: active/filled = already working/done;
  // cancelled = the owner deliberately pulled it; rejected = the broker
  // deterministically refused (a retry would just repeat it).
  const blocking = children.filter((c) => c.kind === 'take_profit' && c.status !== 'failed');
  if (blocking.length > 0) {
    return {
      place: false,
      code: 'already_placed',
      reason: `Entry already has a take-profit order (${blocking[0].status}).`,
    };
  }

  // The kill switch is absolute — a disarmed system places NOTHING, even an
  // exposure-reducing exit. The caller writes the loud audit for this code.
  if (!systemState.tradingEnabled) {
    return {
      place: false,
      code: 'kill_switch',
      reason: 'Trading is disarmed (kill switch) — take-profit NOT placed despite the target being reached.',
    };
  }

  const cancelStopIds = children
    .filter((c) => c.kind === 'protective_stop' && isActiveOrderStatus(c.status))
    .map((c) => c.id);
  return { place: true, quantity: remaining, cancelStopIds };
}

export interface RestoreStopDecision {
  restore: boolean;
  /** Populated when restore = true: the unfilled take-profit to cancel. */
  takeProfitOrderId?: string;
  /** Populated when restore = false. */
  code?:
    | 'not_entry'
    | 'no_active_take_profit'
    | 'not_retreated'
    | 'no_stop_price'
    | 'kill_switch';
  reason?: string;
}

/**
 * The other half of the synthetic OCO: should the working take-profit be
 * pulled and the protective stop re-armed because price RETREATED from the
 * target before the limit filled?
 *
 * Hysteresis-bounded (see TP_RETREAT_FRACTION) so the machine never flaps.
 * A disarmed system does NOTHING — cancelling the take-profit without being
 * able to place the stop would leave the position with no exit at all.
 */
export function shouldRestoreProtectiveStop(
  entryOrder: ExecutionOrder,
  existingChildren: ExecutionOrder[],
  lastPrice: number,
  systemState: SystemState,
): RestoreStopDecision {
  if ((entryOrder.kind ?? 'entry') !== 'entry') {
    return { restore: false, code: 'not_entry', reason: 'Only entry orders own the OCO state.' };
  }
  const children = existingChildren.filter((c) => c.protectsOrderId === entryOrder.id);
  const activeTp = children.find((c) => c.kind === 'take_profit' && isActiveOrderStatus(c.status));
  if (!activeTp) {
    return { restore: false, code: 'no_active_take_profit', reason: 'No working take-profit to pull.' };
  }
  const target = entryOrder.targetPrice;
  const retreated =
    typeof target === 'number' &&
    Number.isFinite(lastPrice) &&
    (entryOrder.side === 'buy'
      ? lastPrice <= target * TP_RETREAT_FRACTION
      : lastPrice >= target * (2 - TP_RETREAT_FRACTION));
  if (!retreated) {
    return { restore: false, code: 'not_retreated', reason: 'Price is still holding near the target.' };
  }
  // Without an approved stop there is nothing to restore — the resting limit
  // is the position's only exit; cancelling it would leave NO exit at all.
  if (!(typeof entryOrder.stopPrice === 'number' && entryOrder.stopPrice > 0)) {
    return { restore: false, code: 'no_stop_price', reason: 'Entry carries no approved stop to restore.' };
  }
  if (!systemState.tradingEnabled) {
    return {
      restore: false,
      code: 'kill_switch',
      reason: 'Trading is disarmed — leaving the take-profit resting rather than pulling the only exit.',
    };
  }
  return { restore: true, takeProfitOrderId: activeTp.id };
}
