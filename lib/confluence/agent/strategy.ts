/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PLACEHOLDER STRATEGY — NOT the user's fundamental criteria.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The fundamental criteria / thesis rules are the USER'S edge and the user's
 * call — an Open Item they own. This file is deliberately a stub so the
 * agent-run pipeline can be wired and demonstrated. Replace `defaultStrategy`
 * with the real rules; nothing else in the runner needs to change.
 *
 * The strategy is a PURE function of a fundamentals snapshot → an optional
 * proposal candidate. It runs inside the analysis step (Milestone 2), which is
 * the only place an LLM/heuristic may live. It NEVER places orders — it only
 * emits a candidate that becomes a `pending` proposal for the user to decide.
 *
 * The illustrative rule below (cheap-ish + growing → tiny starter buy) is a toy
 * to make the demo produce something; it is NOT investment advice.
 */

import type { Fundamentals } from '@/lib/confluence/fundamentals';
import type { FundamentalMetric, TradeDirection } from '@/types/confluence';

export interface Candidate {
  symbol: string;
  direction: TradeDirection;
  thesis: string;
  suggestedLimitPrice: number;
  suggestedQuantity: number;
  suggestedStopPrice?: number;
  suggestedTargetPrice?: number;
  fundamentals: FundamentalMetric[];
  /** Optional 0–100 ranking score; the runner keeps the best-scored candidates. */
  score?: number;
}

export interface StrategyContext {
  /** Rough per-position budget so the toy sizing stays under the caps. */
  perPositionBudgetUsd: number;
  /** Max dollars a single trade may lose at its stop (risk-based sizing). */
  maxRiskPerTradeUsd?: number;
}

export type Strategy = (data: Fundamentals, ctx: StrategyContext) => Candidate | null;

function pct(x?: number): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`;
}

/**
 * Illustrative placeholder — REPLACE with the user's real criteria.
 * Proposes a small long only when a name looks reasonably valued and growing.
 */
export const defaultStrategy: Strategy = (d, ctx) => {
  if (d.price == null) return null;

  // Toy screen — purely illustrative, not a real edge.
  const reasonablyValued = d.forwardPe != null && d.forwardPe < 28;
  const growing = d.revenueGrowthYoY != null && d.revenueGrowthYoY > 0.03;
  if (!reasonablyValued || !growing) return null;

  // Stage a limit ~1% below the last price; size to the per-position budget.
  const limit = Math.round(d.price * 0.99 * 100) / 100;
  const quantity = Math.max(1, Math.floor(ctx.perPositionBudgetUsd / limit));

  const fundamentals: FundamentalMetric[] = [
    { label: 'Fwd P/E', value: d.forwardPe!.toFixed(1) },
    { label: 'Rev growth YoY', value: pct(d.revenueGrowthYoY) },
    { label: 'Gross margin', value: pct(d.grossMargin) },
    { label: 'FCF', value: d.freeCashFlow != null ? `$${Math.round(d.freeCashFlow / 1e9)}B` : '—' },
  ];

  return {
    symbol: d.symbol,
    direction: 'buy',
    thesis:
      `[PLACEHOLDER strategy] ${d.symbol} screens as reasonably valued (fwd P/E ${d.forwardPe!.toFixed(1)}) ` +
      `and growing (rev +${pct(d.revenueGrowthYoY)} YoY); staged a small starter long ~1% below last. ` +
      `Illustrative only — replace with the owner's real fundamental criteria.`,
    suggestedLimitPrice: limit,
    suggestedQuantity: quantity,
    suggestedStopPrice: Math.round(limit * 0.92 * 100) / 100,
    suggestedTargetPrice: Math.round(limit * 1.15 * 100) / 100,
    fundamentals,
  };
};
