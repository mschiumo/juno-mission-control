/**
 * The sizing context a strategy evaluates against.
 *
 * Extracted so the nightly runner and the approval-time re-price derive it the
 * SAME way: a re-priced plan that used a different risk budget than the screen
 * would silently change position size behind the human's back.
 */

import type { StrategyContext } from './strategy';
import type { SystemState } from '@/types/confluence';

/** Hard ceiling on the per-position budget, independent of the cap. */
const PER_POSITION_BUDGET_CEILING_USD = 1000;
/** Risk per trade when CONFLUENCE_RISK_PER_TRADE_USD is unset: 1% of the cap. */
const DEFAULT_RISK_FRACTION_OF_CAP = 0.01;

export function strategyContextFor(state: SystemState): StrategyContext {
  // Keep sizing comfortably under the per-position cap.
  const perPositionBudgetUsd = Math.min(state.perPositionCapUsd, PER_POSITION_BUDGET_CEILING_USD);
  const riskOverride = Number(process.env.CONFLUENCE_RISK_PER_TRADE_USD);
  const maxRiskPerTradeUsd =
    Number.isFinite(riskOverride) && riskOverride > 0
      ? riskOverride
      : state.totalExposureCapUsd * DEFAULT_RISK_FRACTION_OF_CAP;
  return { perPositionBudgetUsd, maxRiskPerTradeUsd };
}
