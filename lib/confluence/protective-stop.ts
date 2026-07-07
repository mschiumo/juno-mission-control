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
import { isTerminalOrderStatus } from '@/types/confluence';

/** The exit side for a filled entry: sell protects a buy, buy covers a sell. */
export function oppositeSide(side: TradeDirection): TradeDirection {
  return side === 'buy' ? 'sell' : 'buy';
}

export interface ProtectiveStopDecision {
  place: boolean;
  /** Populated when place = false. */
  code?: 'not_entry' | 'not_filled' | 'no_stop_price' | 'already_protected' | 'kill_switch';
  reason?: string;
}

/**
 * Should a protective stop be staged for this entry order right now?
 *
 * Pure guard used by the execution service's placeProtectiveStop. Checks run
 * cheapest/structural first; the kill switch is evaluated LAST so a disarmed
 * system only produces the loud "position unprotected" signal when a stop
 * would actually have been placed.
 */
export function shouldPlaceProtectiveStop(
  entryOrder: ExecutionOrder,
  existingChildren: ExecutionOrder[],
  systemState: SystemState,
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
  // Ignore FAILED children so the poll cron re-attempts after a failed
  // placement. Everything else blocks: active/filled = already protected;
  // cancelled = the owner deliberately removed protection; rejected = the
  // broker deterministically refused (a retry would just repeat it). The
  // unprotected cases still surface as NO STOP in the Positions card.
  const blocking = existingChildren.filter(
    (c) => c.kind === 'protective_stop' && c.protectsOrderId === entryOrder.id && c.status !== 'failed',
  );
  if (blocking.length > 0) {
    return {
      place: false,
      code: 'already_protected',
      reason: `Entry already has a protective stop (${blocking[0].status}).`,
    };
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
  return { place: true };
}
