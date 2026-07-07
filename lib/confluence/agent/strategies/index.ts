/**
 * Strategy registry — the seam where trading strategies plug into the agent.
 *
 * A strategy is a PURE evaluation: (fundamentals, technicals, ctx) → optional
 * candidate. Select with `CONFLUENCE_STRATEGY` (defaults to the value-TA
 * pullback strategy). The runner fetches technicals only when the selected
 * strategy declares it needs them, so the legacy placeholder stays as cheap as
 * before.
 *
 * To add a strategy: implement the evaluate function, register it here, and —
 * if it should also drive the Claude/MCP analyst path — provide a
 * criteriaPrompt stating the same rules in prose.
 */

import type { Fundamentals } from '@/lib/confluence/fundamentals';
import type { Technicals } from '@/lib/confluence/technicals';
import { defaultStrategy, type Candidate, type StrategyContext } from '../strategy';
import {
  evaluateInverseEtfHedge,
  evaluateValueTaPullback,
  HEDGE_MAX_PER_RUN,
  hedgeSleeveSymbols,
  valueTaPrefilter,
  VALUE_TA_CRITERIA_PROMPT,
} from './value-ta-pullback';

export interface StrategyDefinition {
  /** Stable id — recorded in run metadata and selected via CONFLUENCE_STRATEGY. */
  id: string;
  label: string;
  /** When true the runner fetches a technicals snapshot per symbol. */
  needsTechnicals: boolean;
  /**
   * Cheap fundamentals-only gate. When present and false for a symbol, the
   * runner skips fetching technicals for it; evaluate() remains the authority.
   */
  prefilter?(f: Fundamentals): boolean;
  evaluate(f: Fundamentals, t: Technicals | null, ctx: StrategyContext): Candidate | null;
  /** Rules for the Claude/MCP analyst's <criteria> block, when this strategy drives it. */
  criteriaPrompt?: string;
  /**
   * Optional TECHNICALS-ONLY side universe evaluated after the main screen
   * (e.g. the inverse-ETF hedge sleeve). Deterministic runs only; sleeve
   * candidates rank among the run's proposals but are capped at maxPerRun.
   */
  sleeve?: {
    symbols(): string[];
    evaluate(symbol: string, t: Technicals | null, ctx: StrategyContext): Candidate | null;
    maxPerRun: number;
  };
}

const STRATEGIES: Record<string, StrategyDefinition> = {
  'value-ta-pullback': {
    id: 'value-ta-pullback',
    label: 'Value-TA Pullback (value + technicals, low-risk)',
    needsTechnicals: true,
    prefilter: valueTaPrefilter,
    evaluate: evaluateValueTaPullback,
    criteriaPrompt: VALUE_TA_CRITERIA_PROMPT,
    sleeve: {
      symbols: hedgeSleeveSymbols,
      evaluate: evaluateInverseEtfHedge,
      maxPerRun: HEDGE_MAX_PER_RUN,
    },
  },
  placeholder: {
    id: 'placeholder',
    label: 'Placeholder screen (illustrative only)',
    needsTechnicals: false,
    evaluate: (f, _t, ctx) => defaultStrategy(f, ctx),
  },
};

export const DEFAULT_STRATEGY_ID = 'value-ta-pullback';

/** All registered strategies (for the Strategy tab / future toggling). */
export function listStrategies(): StrategyDefinition[] {
  return Object.values(STRATEGIES);
}

export function getStrategy(): StrategyDefinition {
  const id = (process.env.CONFLUENCE_STRATEGY || DEFAULT_STRATEGY_ID).toLowerCase();
  return STRATEGIES[id] ?? STRATEGIES[DEFAULT_STRATEGY_ID];
}
