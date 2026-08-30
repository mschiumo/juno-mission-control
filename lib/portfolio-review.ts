/**
 * Weekly portfolio review generation.
 *
 * Used by the interactive "Run review" button and the Saturday cron. Reads the
 * stored portfolio snapshot + activity ledger straight from Redis so it works
 * headless, pre-computes every number, and has the model narrate — the model
 * never fetches data or places orders (read-only by construction).
 *
 * The output is framed as analysis for the owner's own weekly review, not
 * advice — the UI and email both carry a "not financial advice" disclaimer.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getPortfolioConnection,
  getPortfolioSnapshot,
  getPortfolioActivities,
  savePortfolioReview,
  type PortfolioReview,
  type PortfolioSnapshot,
} from '@/lib/db/portfolio-connection';
import {
  detectRecurringFlows,
  summarizeIncome,
  summarizeCashFlows,
  positionWeights,
} from '@/lib/portfolio-insights';
import { getTodayInEST } from '@/lib/date-utils';

const REVIEW_MODEL = process.env.PORTFOLIO_REVIEW_MODEL || 'claude-opus-5';

/** Structured-output schema — the API guarantees the response matches it. */
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    keyTakeaway: { type: 'string' },
    health: { type: 'array', items: { type: 'string' } },
    repositioning: { type: 'array', items: { type: 'string' } },
    watch: { type: 'array', items: { type: 'string' } },
  },
  required: ['keyTakeaway', 'health', 'repositioning', 'watch'],
  additionalProperties: false,
} as const;

export interface StructuredReview {
  keyTakeaway: string;
  health: string[];
  repositioning: string[];
  watch: string[];
}

/** Extract the structured JSON object from the model's analysis text. */
export function parseReview(raw: string): StructuredReview | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.keyTakeaway && Array.isArray(parsed.health) && Array.isArray(parsed.repositioning)) {
      return {
        keyTakeaway: parsed.keyTakeaway,
        health: parsed.health,
        repositioning: parsed.repositioning,
        watch: Array.isArray(parsed.watch) ? parsed.watch : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** ISO week key for the current week, e.g. 2026-W35 (matches journal-insights). */
export function currentWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  const jan1 = new Date(monday.getFullYear(), 0, 1);
  const days = Math.floor((monday.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${monday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Change in the derived account-value series over the trailing `days`. */
export function seriesChange(
  snapshot: PortfolioSnapshot,
  days: number
): number | null {
  const series = snapshot.balances;
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const cutoff = new Date(Date.parse(last.date) - days * 86400000)
    .toISOString()
    .slice(0, 10);
  // Latest point at or before the cutoff; fall back to the earliest point.
  let base = series[0];
  for (const p of series) {
    if (p.date <= cutoff) base = p;
    else break;
  }
  return Number((last.balance - base.balance).toFixed(2));
}

function buildContext(userId: string, snapshot: PortfolioSnapshot, today: string, activitiesContext: string): string {
  const lines: string[] = [];
  const weights = positionWeights(snapshot.positions);

  lines.push(`## Portfolio snapshot (as of ${today})`);
  lines.push(`- Total value: ${snapshot.totalValue != null ? `$${snapshot.totalValue.toFixed(2)}` : 'unknown'}`);
  lines.push(`- Cash: ${snapshot.cash != null ? `$${snapshot.cash.toFixed(2)}` : 'unknown'}`);
  lines.push(`- Unrealized P&L: $${snapshot.openPnl.toFixed(2)}`);
  const wk = seriesChange(snapshot, 7);
  const mo = seriesChange(snapshot, 28);
  if (wk != null) lines.push(`- Value change, past week (positions at cost): $${wk.toFixed(2)}`);
  if (mo != null) lines.push(`- Value change, past 4 weeks (positions at cost): $${mo.toFixed(2)}`);

  lines.push('', `## Holdings (${snapshot.positions.length})`);
  for (const p of snapshot.positions) {
    const w = weights.find(x => x.symbol === p.symbol)?.weight;
    lines.push(
      `- ${p.symbol}${p.description ? ` (${p.description})` : ''}: ${p.units} sh` +
        `${p.avgCost != null ? ` @ avg $${p.avgCost.toFixed(2)}` : ''}` +
        `${p.marketValue != null ? `, value $${p.marketValue.toFixed(2)}` : ''}` +
        `${p.openPnl != null ? `, unrealized ${p.openPnl >= 0 ? '+' : ''}$${p.openPnl.toFixed(2)}` : ''}` +
        `${w != null ? `, ${w}% of portfolio` : ''}`
    );
  }

  lines.push('', activitiesContext);
  return lines.join('\n');
}

/**
 * Generate this week's review, persist it, and return it. Returns null when
 * there is no snapshot or no positions to review. Throws when
 * ANTHROPIC_API_KEY is missing.
 */
export async function generatePortfolioReview(
  userId: string
): Promise<{ review: PortfolioReview; structured: StructuredReview | null } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const connection = await getPortfolioConnection(userId);
  if (!connection || connection.accounts.length === 0) return null;
  const snapshot = await getPortfolioSnapshot(userId);
  if (!snapshot || snapshot.positions.length === 0) return null;

  const activities = await getPortfolioActivities(userId);
  const today = getTodayInEST();
  const income = summarizeIncome(activities, today);
  const cashFlows = summarizeCashFlows(activities, today);
  const recurring = detectRecurringFlows(activities);

  const activityLines: string[] = ['## Cash flows & income'];
  activityLines.push(`- Dividends: $${income.dividends30d.toFixed(2)} last 30d, $${income.dividends12m.toFixed(2)} trailing 12m`);
  activityLines.push(`- Interest, trailing 12m: $${income.interest12m.toFixed(2)}`);
  activityLines.push(
    `- Deposits $${cashFlows.deposits12m.toFixed(2)} / withdrawals $${cashFlows.withdrawals12m.toFixed(2)} trailing 12m (net $${cashFlows.netContributions12m.toFixed(2)})`
  );
  for (const f of recurring) {
    activityLines.push(
      `- Recurring ${f.type === 'CONTRIBUTION' ? 'deposit' : 'withdrawal'}: $${f.amount.toFixed(2)} ${f.cadence} (~$${f.monthlyAmount.toFixed(2)}/mo, last on ${f.lastDate})`
    );
  }
  const recent = activities.slice(0, 20);
  if (recent.length > 0) {
    activityLines.push('', '## Most recent transactions');
    for (const a of recent) {
      activityLines.push(
        `- ${a.date} ${a.type}${a.symbol ? ` ${a.symbol}` : ''}${a.units ? ` ×${a.units}` : ''}${a.amount != null ? ` $${a.amount.toFixed(2)}` : ''}`
      );
    }
  }

  const context = buildContext(userId, snapshot, today, activityLines.join('\n'));

  const client = new Anthropic({ apiKey });
  // max_tokens leaves room for the model's (adaptive) thinking plus the JSON;
  // output_config.format guarantees the text block is valid JSON per the schema.
  const message = await client.messages.create({
    model: REVIEW_MODEL,
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `You are reviewing a personal long-term investment portfolio for its owner's weekly check-in. All figures below are pre-computed; your job is to interpret them, not to fetch anything.

Field guide for the review object:
- keyTakeaway: one sentence — the single most important observation this week.
- health: 2-4 bullets on portfolio health (concentration, cash level, income, diversification).
- repositioning: 1-3 bullets flagging positions that may warrant a closer look (outsized weight, large unrealized loss/gain, drift) — or an explicit "no changes suggested" bullet if the portfolio looks balanced.
- watch: 1-2 bullets of things to keep an eye on next week.

Rules:
- Each bullet must be one concise sentence grounded in the numbers provided — cite the figure you're reacting to.
- This is analysis for the owner's own review, not financial advice; describe observations ("X is 40% of the portfolio") rather than directives ("sell X").

---

${context}`,
      },
    ],
  });

  const analysisText =
    message.content.find(
      (b): b is Extract<(typeof message.content)[number], { type: 'text' }> =>
        b.type === 'text'
    )?.text ?? '';
  const periodKey = currentWeekKey();
  const review: PortfolioReview = {
    periodKey,
    periodLabel: `Week ${parseInt(periodKey.split('-W')[1])}, ${periodKey.split('-W')[0]}`,
    generatedAt: new Date().toISOString(),
    analysis: analysisText,
    totalValue: snapshot.totalValue,
    weekChange: seriesChange(snapshot, 7),
    positionsCount: snapshot.positions.length,
  };
  await savePortfolioReview(userId, review);

  return { review, structured: parseReview(analysisText) };
}
