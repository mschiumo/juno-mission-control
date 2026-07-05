/**
 * Weekly review agent (Milestone R-C) — the scheduled narrator.
 *
 * THE AGENT NEVER COMPUTES. Every number is produced by the metrics engine
 * before the model is called; the model receives the computed scorecards
 * (this week + prior week, manual + agentic) and writes ONE narrative:
 * the three tracking numbers (win rate, payoff ratio, largest loss in R),
 * the delta vs. the prior week, and the single highest-impact behavior to
 * fix. It is called with NO TOOLS — read-only by construction; it cannot
 * touch orders, proposals, or any other state.
 *
 * The analyst never grades its own homework: this module reviews trades;
 * lib/confluence/agent/* proposes them. They share no prompts or code.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getRiskConfig, getRoundTrips, getViolations, saveWeeklyReview } from '@/lib/db/confluence/review';
import type { ReviewMetrics, RiskConfig, RoundTrip, WeeklyReview } from '@/types/confluence-review';
import { computeMetrics } from './metrics';

const DEFAULT_MODEL = 'claude-opus-4-8';

export class ReviewNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewNotConfigured';
  }
}

/** Monday (ET) of the week containing the given ET date string. */
export function mondayOf(etDate: string): string {
  const d = new Date(`${etDate}T12:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function addDays(etDate: string, days: number): string {
  const d = new Date(`${etDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayEt(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** The most recently COMPLETED week (Mon–Sun) as of the given ET date. */
export function lastCompletedWeekStart(asOfEtDate: string): string {
  return addDays(mondayOf(asOfEtDate), -7);
}

function weekTrades(trades: RoundTrip[], weekStart: string): RoundTrip[] {
  const weekEnd = addDays(weekStart, 6);
  return trades.filter((t) => t.etDate >= weekStart && t.etDate <= weekEnd);
}

const fmtPct = (v?: number) => (v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const fmtNum = (v?: number, digits = 2) => (v === undefined ? 'n/a' : v.toFixed(digits));

function scorecardBlock(label: string, m: ReviewMetrics | undefined, prior: ReviewMetrics | undefined): string {
  if (!m || m.trades === 0) return `${label}: no closed trades this week.`;
  const lines = [
    `${label} — ${m.trades} round trips over ${m.sessions} session(s), ${m.breadth} symbol(s):`,
    `  win rate: ${fmtPct(m.winRate)} (prior week: ${fmtPct(prior?.winRate)})`,
    `  payoff ratio: ${fmtNum(m.payoffRatio)} (prior week: ${fmtNum(prior?.payoffRatio)})`,
    `  largest loss: ${fmtNum(m.largestLossR)}R (prior week: ${fmtNum(prior?.largestLossR)}R)`,
    `  expectancy/trade: $${fmtNum(m.expectancy)} · net P/L: $${m.netPl.toFixed(2)} (gross $${m.grossPl.toFixed(2)}, fees $${m.fees.toFixed(2)})`,
    `  tail losses: ${m.tailLosses.length} · churn events: ${m.churnEvents.length}`,
  ];
  if (m.churnEvents.length > 0) {
    lines.push(
      `  churn detail: ${m.churnEvents.map((c) => `${c.symbol} ×${c.roundTrips} on ${c.etDate}`).join('; ')}`,
    );
  }
  return lines.join('\n');
}

function buildPrompt(review: WeeklyReview, config: RiskConfig): { system: string; user: string } {
  const system = [
    'You are the weekly trading performance reviewer for ConfluenceTrading.',
    'You write a short narrative review of the week from PRE-COMPUTED metrics.',
    'HARD RULES:',
    '- Never perform arithmetic and never invent numbers. Quote only values given to you, verbatim.',
    '- You have no tools and cannot look anything up.',
    '- Grade the week against the risk framework provided; be direct and specific.',
    'Structure (plain prose, ~250 words, no headings):',
    '1. Open with the three tracking numbers — win rate, payoff ratio, largest loss in R — and how each moved vs. the prior week.',
    '2. One paragraph comparing the manual account vs. the agentic account, if both traded.',
    "3. Close with THE single highest-impact behavior to fix next week (one, not a list), grounded in the violations/churn/tail-loss data.",
  ].join('\n');

  const user = [
    `Week under review: ${review.weekStart} → ${review.weekEnd}.`,
    '',
    `Risk framework: risk unit $${config.riskUnitUsd}, max loss ${config.maxRMultiple}R ($${(config.maxRMultiple * config.riskUnitUsd).toFixed(2)}), churn threshold ${config.churnThreshold} round trips/symbol/session, breadth cap ${config.breadthCap} symbols, probation window ${config.probationWindowSessions} sessions.`,
    '',
    scorecardBlock('MANUAL account (ThinkOrSwim)', review.metrics.manual, review.metrics.priorWeek?.manual),
    '',
    scorecardBlock('AGENTIC account (Robinhood, swing agent)', review.metrics.agentic, review.metrics.priorWeek?.agentic),
    '',
    `Rule violations recorded this week: ${review.metrics.violationsThisWeek}.`,
    '',
    'Write the review.',
  ].join('\n');

  return { system, user };
}

/**
 * Compute the week's scorecards in code, then have the agent narrate them.
 * Idempotent per week (saveWeeklyReview upserts on weekStart).
 */
export async function runWeeklyReview(userId: string, weekStartArg?: string): Promise<WeeklyReview> {
  const weekStart = weekStartArg ?? lastCompletedWeekStart(todayEt());
  const weekEnd = addDays(weekStart, 6);
  const priorStart = addDays(weekStart, -7);

  const config = await getRiskConfig(userId);
  const allTrades = await getRoundTrips(userId);
  const violations = await getViolations(userId);

  const scoped = (source: 'manual_tos' | 'agentic_rh', start: string) => {
    const trades = weekTrades(allTrades, start).filter((t) => t.source === source);
    return trades.length > 0 ? computeMetrics(trades, config, source) : undefined;
  };

  const manual = scoped('manual_tos', weekStart);
  const agentic = scoped('agentic_rh', weekStart);
  const violationsThisWeek = violations.filter(
    (v) => (v.etDate && v.etDate >= weekStart && v.etDate <= weekEnd) ||
      (!v.etDate && v.detectedAt.slice(0, 10) >= weekStart && v.detectedAt.slice(0, 10) <= weekEnd),
  ).length;

  const review: WeeklyReview = {
    id: crypto.randomUUID(),
    weekStart,
    weekEnd,
    metrics: {
      manual,
      agentic,
      violationsThisWeek,
      priorWeek: {
        manual: scoped('manual_tos', priorStart),
        agentic: scoped('agentic_rh', priorStart),
      },
    },
    narrative: '',
    createdAt: new Date().toISOString(),
  };

  if (!manual && !agentic) {
    // Nothing traded — deterministic narrative, no model call needed.
    review.narrative = `No closed round trips in either account for the week of ${weekStart}. Nothing to grade.`;
    await saveWeeklyReview(userId, review);
    return review;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ReviewNotConfigured('ANTHROPIC_API_KEY unset — required for the weekly review narrative.');
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.CONFLUENCE_REVIEW_MODEL || DEFAULT_MODEL;
  const { system, user } = buildPrompt(review, config);

  // NO tools — the reviewer is read-only by construction.
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const narrative = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!narrative) {
    throw new Error('Weekly review model returned no text.');
  }

  review.narrative = narrative;
  review.model = model;
  await saveWeeklyReview(userId, review);
  return review;
}
