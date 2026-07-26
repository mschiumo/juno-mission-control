/**
 * Protective-stop decision logic — pure, deterministic, unit-testable.
 *
 * PRINCIPLE: the stop price is part of the trade plan the HUMAN approved
 * (OrderParams.stopPrice flows through the approve route into
 * executeApprovedProposal and is denormalized onto the entry order). Placing
 * the protective stop after the entry fills is deterministic completion of
 * that approved plan — no new discretion, and it can only REDUCE exposure.
 *
 * The kill switch (system_state.tradingEnabled) is still absolute: a disarmed
 * system places nothing, including protective stops. When disarmed at fill
 * time the caller must skip placement and write a LOUD audit event so the
 * owner knows the position is unprotected.
 */

import type { ExecutionOrder, SystemState, TradeDirection } from '@/types/confluence';
import { isActiveOrderStatus, isTerminalOrderStatus } from '@/types/confluence';

/** The exit side for a filled entry: sell protects a buy, buy covers a sell. */
export function oppositeSide(side: TradeDirection): TradeDirection {
  return side === 'buy' ? 'sell' : 'buy';
}

export interface ProtectiveStopDecision {
  place: boolean;
  /** Populated when place = true: shares still held from this entry (its
   * exits' fills subtracted) — what the stop must cover. */
  quantity?: number;
  /** Populated when place = false. */
  code?:
    | 'not_entry'
    | 'not_filled'
    | 'no_stop_price'
    | 'position_closed'
    | 'already_protected'
    | 'take_profit_active'
    | 'kill_switch';
  reason?: string;
}

export interface ProtectiveStopOptions {
  /**
   * Fail-safe re-placement after a take-profit attempt: the take-profit flow
   * cancels the resting stop before placing its limit exit, so if that
   * placement then fails, the stop it cancelled must be allowed back even
   * though a cancelled child normally reads as "owner removed protection".
   */
  ignoreCancelledStops?: boolean;
}

/**
 * Should a protective stop be staged for this entry order right now?
 *
 * Pure guard used by the execution service's placeProtectiveStop. Checks run
 * cheapest/structural first; the kill switch is evaluated LAST so a disarmed
 * system only produces the loud "position unprotected" signal when a stop
 * would actually have been placed.
 *
 * `existingChildren` may include ALL exit children (protective stops and
 * take-profits): a working or filled take-profit blocks a stop — its shares
 * are already committed to the limit exit (or gone).
 */
export function shouldPlaceProtectiveStop(
  entryOrder: ExecutionOrder,
  existingChildren: ExecutionOrder[],
  systemState: SystemState,
  opts: ProtectiveStopOptions = {},
): ProtectiveStopDecision {
  // Only entries chain stops (absent kind = legacy entry). A protective_stop
  // filling must never chain another order.
  if ((entryOrder.kind ?? 'entry') !== 'entry') {
    return { place: false, code: 'not_entry', reason: 'Only entry orders chain a protective stop.' };
  }
  // Shares to protect exist when the entry filled — OR when it ended in any
  // terminal state with a partial fill (e.g. cancelled at 40 of 100: the 40
  // held shares still need their stop). Active-but-partially-filled entries
  // wait: the fill may still grow, and the stop sizes to the final quantity.
  const protectableFill =
    entryOrder.filledQuantity > 0 &&
    (entryOrder.status === 'filled' || isTerminalOrderStatus(entryOrder.status));
  if (!protectableFill) {
    return { place: false, code: 'not_filled', reason: 'Entry order has no settled fill to protect yet.' };
  }
  if (!(typeof entryOrder.stopPrice === 'number' && entryOrder.stopPrice > 0)) {
    return { place: false, code: 'no_stop_price', reason: 'Entry order carries no approved stop price.' };
  }
  // A working or filled take-profit blocks a stop: the shares are reserved
  // by the resting limit exit (a second sell would be rejected at the broker)
  // or already sold. Cancelled/rejected/failed take-profits don't block —
  // those shares need their protection back.
  const takeProfit = existingChildren.find(
    (c) =>
      c.kind === 'take_profit' &&
      c.protectsOrderId === entryOrder.id &&
      (isActiveOrderStatus(c.status) || c.status === 'filled'),
  );
  if (takeProfit) {
    return {
      place: false,
      code: 'take_profit_active',
      reason: `Entry's shares are committed to a take-profit order (${takeProfit.status}).`,
    };
  }
  // Ignore FAILED children so the poll cron re-attempts after a failed
  // placement. Everything else blocks: active/filled = already protected;
  // cancelled = the owner deliberately removed protection (unless the
  // take-profit flow cancelled it and is now failing safe — see
  // ProtectiveStopOptions); rejected = the broker deterministically refused
  // (a retry would just repeat it). The unprotected cases still surface as
  // NO STOP in the Positions card.
  const blocking = existingChildren.filter(
    (c) =>
      c.kind === 'protective_stop' &&
      c.protectsOrderId === entryOrder.id &&
      c.status !== 'failed' &&
      !(opts.ignoreCancelledStops && c.status === 'cancelled'),
  );
  if (blocking.length > 0) {
    return {
      place: false,
      code: 'already_protected',
      reason: `Entry already has a protective stop (${blocking[0].status}).`,
    };
  }
  // Size to the shares the entry's exits haven't already closed — a stop for
  // the full fill would oversell after a partial take-profit or stop fill
  // (e.g. re-arming on an OCO retreat after some shares sold at the target).
  const closed = existingChildren
    .filter((c) => c.protectsOrderId === entryOrder.id && (c.kind === 'protective_stop' || c.kind === 'take_profit'))
    .reduce((sum, c) => sum + Math.max(0, c.filledQuantity), 0);
  const remaining = entryOrder.filledQuantity - closed;
  if (!(remaining > 0)) {
    return { place: false, code: 'position_closed', reason: 'The entry’s shares are already exited.' };
  }
  // The kill switch is absolute — a disarmed system places NOTHING, even an
  // exposure-reducing stop. The caller writes the loud audit for this code.
  if (!systemState.tradingEnabled) {
    return {
      place: false,
      code: 'kill_switch',
      reason: 'Trading is disarmed (kill switch) — protective stop NOT placed; the position is unprotected.',
    };
  }
  return { place: true, quantity: remaining };
}
