/**
 * ConfluenceTrading guardrails — enforced in code, never in prompts.
 *
 * These run in the deterministic execution service *before* any order is
 * placed. The model is never trusted to respect a limit; if the numbers on an
 * approved proposal breach a cap or the kill switch is engaged, the order is
 * blocked here and the proposal fails safe.
 */

import type {
  ConfluenceSettings,
  ExecutionOrder,
  GuardrailResult,
  Proposal,
} from '@/types/confluence';

/** Notional value of a proposed position. */
export function positionNotional(limitPrice: number, shares: number): number {
  return Math.max(0, limitPrice) * Math.max(0, shares);
}

/** Sum of notional across a set of (non-terminal) orders. */
export function openExposure(orders: ExecutionOrder[]): number {
  return orders.reduce((sum, o) => sum + positionNotional(o.limitPrice, o.shares), 0);
}

/**
 * The single gate every order must pass. Order of checks matters: kill switch
 * and enabled first (a halted system places nothing at all), then structural
 * validity, then the size/exposure caps.
 *
 * @param proposal   the approved proposal about to become an order
 * @param settings   the user's current caps + switches
 * @param openOrders existing non-terminal orders, for the total-exposure cap
 */
export function checkGuardrails(
  proposal: Proposal,
  settings: ConfluenceSettings,
  openOrders: ExecutionOrder[],
): GuardrailResult {
  if (settings.killSwitch) {
    return { ok: false, code: 'kill_switch', reason: 'Kill switch is engaged — execution halted.' };
  }
  if (!settings.enabled) {
    return { ok: false, code: 'disabled', reason: 'ConfluenceTrading is disabled.' };
  }

  const { suggestedLimitPrice: price, suggestedShares: shares } = proposal;
  if (!(price > 0) || !(shares > 0) || !Number.isFinite(price) || !Number.isFinite(shares)) {
    return {
      ok: false,
      code: 'invalid_order',
      reason: 'Order must have a positive limit price and share count.',
    };
  }

  const notional = positionNotional(price, shares);
  if (notional > settings.perPositionCapUsd) {
    return {
      ok: false,
      code: 'per_position_cap',
      reason: `Position notional $${notional.toLocaleString()} exceeds the per-position cap of $${settings.perPositionCapUsd.toLocaleString()}.`,
    };
  }

  const projectedTotal = openExposure(openOrders) + notional;
  if (projectedTotal > settings.totalExposureCapUsd) {
    return {
      ok: false,
      code: 'total_exposure_cap',
      reason: `Projected total exposure $${projectedTotal.toLocaleString()} exceeds the cap of $${settings.totalExposureCapUsd.toLocaleString()}.`,
    };
  }

  return { ok: true };
}
