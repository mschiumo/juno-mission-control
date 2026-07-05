/**
 * Rules engine for the Performance Review module — the configurable risk
 * framework, evaluated two ways:
 *
 *   - AGENTIC (enforced pre-trade): checkPreTradeReviewRules() is called by
 *     the execution service AFTER the existing guardrails and BEFORE an
 *     order is staged. Purely additive — the human-approval gate and the
 *     existing caps are untouched. Enforced in code, never in prompts.
 *
 *   - MANUAL (observed post-import): evaluateTradeRules() runs over paired
 *     round trips after a statement import and produces rule_violations for
 *     the scorecard. Nothing is blocked — ToS trades happen outside the
 *     system.
 *
 * PURE FUNCTIONS ONLY — callers load config/trades and persist violations.
 */

import { createHash } from 'crypto';
import type {
  ReviewRuleCheck,
  ReviewSource,
  RiskConfig,
  RoundTrip,
  RuleViolation,
} from '@/types/confluence-review';
import { churnEvents, trailingSessionDates } from './metrics';
import { round2 } from './parser';

/** Deterministic id so recomputes on re-import never duplicate rows. */
function violationId(parts: (string | undefined)[]): string {
  const digest = createHash('sha256').update(parts.map((p) => p ?? '').join('|')).digest('hex').slice(0, 16);
  return `rv_${digest}`;
}

export interface ProbationStatus {
  symbol: string;
  netPl: number;
  maxSessionChurn: number;
  windowSessions: number;
}

/**
 * Symbols on probation: net-negative over the trailing probation window
 * AND round-trip churn above the threshold in at least one session of that
 * window. These must prove themselves before the agent may propose them.
 */
export function probationSymbols(trades: RoundTrip[], config: RiskConfig): ProbationStatus[] {
  const windowDates = new Set(trailingSessionDates(trades, config.probationWindowSessions));
  const windowTrades = trades.filter((t) => windowDates.has(t.etDate));
  const churny = new Map<string, number>();
  for (const e of churnEvents(windowTrades, config.churnThreshold)) {
    churny.set(e.symbol, Math.max(churny.get(e.symbol) || 0, e.roundTrips));
  }

  const netBySymbol = new Map<string, number>();
  for (const t of windowTrades) {
    netBySymbol.set(t.symbol, round2((netBySymbol.get(t.symbol) || 0) + t.netPl));
  }

  const out: ProbationStatus[] = [];
  for (const [symbol, netPl] of netBySymbol) {
    const maxSessionChurn = churny.get(symbol);
    if (netPl < 0 && maxSessionChurn !== undefined) {
      out.push({ symbol, netPl, maxSessionChurn, windowSessions: windowDates.size });
    }
  }
  return out.sort((a, b) => a.netPl - b.netPl);
}

export interface PreTradeInput {
  symbol: string;
  limitPrice: number;
  quantity: number;
  stopPrice?: number;
  /** 'buy' | 'sell' — direction of the proposed entry. */
  side: 'buy' | 'sell';
}

export interface PreTradeContext {
  config: RiskConfig;
  /** All agentic round trips (the function applies the trailing window). */
  agenticTrades: RoundTrip[];
  /** Symbols with an active (non-terminal) order — the open-proposal set
   * the breadth cap applies to. */
  activeOrderSymbols: string[];
}

/**
 * The three pre-trade checks Milestone R adds to the execution service:
 *  (a) every approved proposal must carry a stop such that max loss ≤
 *      maxRMultiple × riskUnit;
 *  (b) no proposals in symbols on probation;
 *  (c) symbol-breadth cap over open (active-order) symbols.
 */
export function checkPreTradeReviewRules(input: PreTradeInput, ctx: PreTradeContext): ReviewRuleCheck {
  const { config } = ctx;
  const maxLossAllowed = round2(config.maxRMultiple * config.riskUnitUsd);

  // (a) stop bound. Max loss = adverse distance from entry to stop × qty.
  if (input.stopPrice === undefined || !(input.stopPrice > 0)) {
    return {
      ok: false,
      code: 'stop_required',
      reason: `Review rules require a stop price on every order (max loss ≤ $${maxLossAllowed.toFixed(2)} = ${config.maxRMultiple} × $${config.riskUnitUsd} risk unit).`,
    };
  }
  const adverse =
    input.side === 'buy' ? input.limitPrice - input.stopPrice : input.stopPrice - input.limitPrice;
  if (!(adverse > 0)) {
    return {
      ok: false,
      code: 'stop_too_wide',
      reason: `Stop $${input.stopPrice} is on the wrong side of the ${input.side} entry $${input.limitPrice}.`,
    };
  }
  const maxLoss = round2(adverse * input.quantity);
  if (maxLoss > maxLossAllowed) {
    return {
      ok: false,
      code: 'stop_too_wide',
      reason: `Max loss at the stop is $${maxLoss.toFixed(2)}, above the allowed $${maxLossAllowed.toFixed(2)} (${config.maxRMultiple} × $${config.riskUnitUsd} risk unit). Tighten the stop or cut size.`,
    };
  }

  // (b) probation.
  const probation = probationSymbols(ctx.agenticTrades, config);
  const hit = probation.find((p) => p.symbol === input.symbol);
  if (hit) {
    return {
      ok: false,
      code: 'symbol_probation',
      reason: `${input.symbol} is on probation: $${hit.netPl.toFixed(2)} net over the trailing ${config.probationWindowSessions}-session window with round-trip churn ${hit.maxSessionChurn} > ${config.churnThreshold}/session.`,
    };
  }

  // (c) breadth cap on open proposals.
  const openSymbols = new Set(ctx.activeOrderSymbols);
  if (!openSymbols.has(input.symbol) && openSymbols.size + 1 > config.breadthCap) {
    return {
      ok: false,
      code: 'breadth_cap',
      reason: `Adding ${input.symbol} would put ${openSymbols.size + 1} symbols in play, above the breadth cap of ${config.breadthCap}.`,
    };
  }

  return { ok: true };
}

/**
 * Post-import (manual path) — and equally applicable to agentic history:
 * evaluate the same framework over realized round trips and emit violations
 * for the scorecard. Deterministic ids make this safe to recompute wholesale.
 */
export function evaluateTradeRules(
  trades: RoundTrip[],
  config: RiskConfig,
  source: ReviewSource,
  detectedAt: string,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const scoped = trades.filter((t) => t.source === source);
  const tailThresholdUsd = round2(config.maxRMultiple * config.riskUnitUsd);

  // Tail losses — any trade whose loss blew through maxR × riskUnit.
  for (const t of scoped) {
    if (t.netPl < -tailThresholdUsd) {
      const r = t.rMultiple ?? Math.round((t.netPl / config.riskUnitUsd) * 100) / 100;
      violations.push({
        id: violationId([source, 'tail_loss', t.id]),
        source,
        rule: 'tail_loss',
        severity: 'critical',
        symbol: t.symbol,
        tradeId: t.id,
        etDate: t.etDate,
        detail: `${t.symbol} ${t.direction} lost $${Math.abs(t.netPl).toFixed(2)} (${r}R) — beyond the ${config.maxRMultiple}R / $${tailThresholdUsd.toFixed(2)} tail-loss line.`,
        detectedAt,
      });
    }
  }

  // Churn — more round trips in one symbol in one session than allowed.
  for (const e of churnEvents(scoped, config.churnThreshold)) {
    violations.push({
      id: violationId([source, 'churn', e.symbol, e.etDate]),
      source,
      rule: 'churn',
      severity: 'warning',
      symbol: e.symbol,
      etDate: e.etDate,
      detail: `${e.roundTrips} round trips in ${e.symbol} on ${e.etDate} — churn threshold is ${config.churnThreshold} per session.`,
      detectedAt,
    });
  }

  // Probation — flagged so the scorecard shows what the agentic path would block.
  for (const p of probationSymbols(scoped, config)) {
    violations.push({
      id: violationId([source, 'probation_symbol', p.symbol]),
      source,
      rule: 'probation_symbol',
      severity: 'warning',
      symbol: p.symbol,
      detail: `${p.symbol} is net $${p.netPl.toFixed(2)} over the trailing ${config.probationWindowSessions}-session window with churn ${p.maxSessionChurn} > ${config.churnThreshold}/session — on probation.`,
      detectedAt,
    });
  }

  // Breadth — distinct symbols over the trailing window vs. the cap.
  const windowDates = new Set(trailingSessionDates(scoped, config.probationWindowSessions));
  const breadth = new Set(scoped.filter((t) => windowDates.has(t.etDate)).map((t) => t.symbol)).size;
  if (breadth > config.breadthCap) {
    violations.push({
      id: violationId([source, 'symbol_breadth', [...windowDates].sort().pop()]),
      source,
      rule: 'symbol_breadth',
      severity: 'warning',
      detail: `${breadth} distinct symbols traded in the trailing ${config.probationWindowSessions}-session window — breadth cap is ${config.breadthCap}.`,
      detectedAt,
    });
  }

  return violations;
}
