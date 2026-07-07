/**
 * ConfluenceTrading guardrails — enforced in code, never in prompts.
 *
 * Run in the deterministic execution service *before* any order is staged, and
 * again as a UX pre-check on approval. The model is never trusted to respect a
 * limit; if the finalized order numbers breach a cap, the kill switch is
 * engaged, or the account isn't pinned, the order is blocked and the proposal
 * fails safe.
 */

import type { ExecutionOrder, GuardrailResult, SystemState } from '@/types/confluence';

/** Notional value of an order. */
export function orderNotional(limitPrice: number, quantity: number): number {
  return Math.max(0, limitPrice) * Math.max(0, quantity);
}

/** Sum of notional across a set of (active) orders. Protective stops are
 * excluded: a resting exit can only REDUCE exposure, so counting it would
 * double-charge the position it protects against the caps. */
export function activeExposure(orders: ExecutionOrder[]): number {
  return orders
    .filter((o) => (o.kind ?? 'entry') === 'entry')
    .reduce((sum, o) => sum + orderNotional(o.limitPrice, o.quantity), 0);
}

export interface GuardrailInput {
  limitPrice: number;
  quantity: number;
}

/**
 * The single gate every order must pass. Order of checks matters: kill switch
 * first (a disarmed system places nothing), then structural validity, then the
 * account pin (live only), then the size/exposure caps.
 *
 * @param order         the finalized order numbers (proposal defaults + edits)
 * @param state         current system_state (kill switch, paper mode, account, caps)
 * @param activeOrders  existing non-terminal orders, for the total-exposure cap
 */
export function checkGuardrails(
  order: GuardrailInput,
  state: SystemState,
  activeOrders: ExecutionOrder[],
): GuardrailResult {
  // Invariant 6: a disarmed system submits nothing (paper or live).
  if (!state.tradingEnabled) {
    return {
      ok: false,
      code: 'kill_switch',
      reason: 'Trading is disarmed (kill switch) — no orders will be placed. Arm execution in Settings.',
    };
  }

  const { limitPrice: price, quantity } = order;
  if (!(price > 0) || !(quantity > 0) || !Number.isFinite(price) || !Number.isFinite(quantity)) {
    return { ok: false, code: 'invalid_order', reason: 'Order must have a positive limit price and quantity.' };
  }

  // Invariant 4: live orders must target the pinned agentic account.
  if (!state.paperMode && !state.agenticAccount) {
    return {
      ok: false,
      code: 'account_unset',
      reason: 'Live mode requires a pinned agentic account number. Set it in Settings or stay in paper mode.',
    };
  }

  const notional = orderNotional(price, quantity);
  if (notional > state.perPositionCapUsd) {
    return {
      ok: false,
      code: 'per_position_cap',
      reason: `Position notional $${notional.toLocaleString()} exceeds the per-position cap of $${state.perPositionCapUsd.toLocaleString()}.`,
    };
  }

  const projectedTotal = activeExposure(activeOrders) + notional;
  if (projectedTotal > state.totalExposureCapUsd) {
    return {
      ok: false,
      code: 'total_exposure_cap',
      reason: `Projected total exposure $${projectedTotal.toLocaleString()} exceeds the cap of $${state.totalExposureCapUsd.toLocaleString()}.`,
    };
  }

  return { ok: true };
}
