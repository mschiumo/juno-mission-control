/**
 * Shared journal-insights report generation.
 *
 * Used by the interactive POST /api/journal-insights route and the weekly
 * owner email cron (/api/cron-jobs/weekly-journal-insights). Reads journal
 * entries and trades straight from Redis so it works headless — no session
 * cookie required.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getRedisClient } from '@/lib/redis';
import { getAllTrades } from '@/lib/db/trades-v2';
import { getESTDateFromTimestamp, getTodayInEST } from '@/lib/date-utils';
import type { Trade } from '@/types/trading';

export interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  prompts: JournalPrompt[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedReport {
  analysis: string;
  period: string;
  periodKey: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  entriesCount: number;
  tradesCount: number;
  generatedAt: string;
}

export interface StructuredAnalysis {
  keyTakeaway: string;
  strengths: string[];
  improvements: string[];
  patterns?: string[];
}

export interface GeneratedInsights {
  report: SavedReport;
  entries: JournalEntry[];
  /** Trades whose exit (or entry) date falls inside the period. */
  trades: Trade[];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Inclusive ET calendar-day bounds ('YYYY-MM-DD') of the current period:
 * Monday (week) or the 1st (month) through today.
 *
 * Periods follow the ET trading calendar, not the server clock — Vercel runs
 * in UTC, so `new Date()` math rolled "this month" over to the next month at
 * 8 PM ET on the last day (and the week over on Sunday evening), leaving the
 * report with an empty period.
 */
export function getPeriodDays(period: string): { startDate: string; endDate: string } {
  const endDate = getTodayInEST();
  const [y, m, d] = endDate.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  if (period === 'week') {
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  } else {
    start.setUTCDate(1);
  }
  return { startDate: ymd(start), endDate };
}

/**
 * Period bounds as Dates, for display only (noon UTC on each ET calendar day,
 * so the day reads the same in any viewer timezone). Filter with getPeriodDays.
 */
export function getDateRange(period: string): { start: Date; end: Date } {
  const { startDate, endDate } = getPeriodDays(period);
  return {
    start: new Date(`${startDate}T12:00:00.000Z`),
    end: new Date(`${endDate}T12:00:00.000Z`),
  };
}

export function getPeriodKey(period: string): string {
  const { startDate } = getPeriodDays(period);
  const [y, m] = startDate.split('-').map(Number);
  if (period === 'week') {
    const monday = new Date(`${startDate}T00:00:00.000Z`);
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const days = Math.floor((monday.getTime() - jan1.getTime()) / 86400000);
    const week = Math.ceil((days + jan1.getUTCDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function getPeriodLabel(period: string, periodKey: string): string {
  if (period === 'week') {
    const [year, weekPart] = periodKey.split('-W');
    return `Week ${parseInt(weekPart)}, ${year}`;
  }
  const [year, month] = periodKey.split('-');
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-US', { month: 'long' });
  return `${monthName} ${year}`;
}

export function redisKey(userId: string, period: string, periodKey: string): string {
  return `journal-insights:${userId}:${period}:${periodKey}`;
}

export function indexKey(userId: string): string {
  return `journal-insights:${userId}:index`;
}

/** Extract the structured JSON object from the model's analysis text. */
export function parseAnalysis(raw: string): StructuredAnalysis | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.keyTakeaway && parsed.strengths && parsed.improvements) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function buildStructuredSummary(entries: JournalEntry[], trades: Trade[]): string {
  const lines: string[] = [];

  // Journal entries
  lines.push(`## Journal Entries (${entries.length} total)\n`);
  for (const entry of entries) {
    lines.push(`### ${entry.date}`);
    for (const prompt of entry.prompts) {
      if (prompt.answer?.trim()) {
        lines.push(`**${prompt.question}**`);
        lines.push(prompt.answer.trim());
      }
    }
    lines.push('');
  }

  // Trade summary
  const closed = trades.filter((t) => t.status === 'CLOSED');
  if (closed.length > 0) {
    lines.push(`## Trade Data (${closed.length} closed trades)\n`);

    const wins = closed.filter((t) => (t.netPnL || 0) > 0).length;
    const losses = closed.filter((t) => (t.netPnL || 0) < 0).length;
    const totalPnL = closed.reduce((s, t) => s + (t.netPnL || 0), 0);
    lines.push(`- Win/Loss: ${wins}W / ${losses}L`);
    lines.push(`- Net P&L: $${totalPnL.toFixed(2)}`);

    // Emotion breakdown
    const emotions: Record<string, number> = {};
    for (const t of closed) {
      if (t.emotion) emotions[t.emotion] = (emotions[t.emotion] || 0) + 1;
    }
    if (Object.keys(emotions).length > 0) {
      lines.push(`- Emotions logged: ${Object.entries(emotions).map(([e, c]) => `${e}(${c})`).join(', ')}`);
    }

    // Setup quality breakdown
    const qualities: Record<string, number> = {};
    for (const t of closed) {
      if (t.setupQuality) qualities[t.setupQuality] = (qualities[t.setupQuality] || 0) + 1;
    }
    if (Object.keys(qualities).length > 0) {
      lines.push(`- Setup quality: ${Object.entries(qualities).map(([q, c]) => `${q}(${c})`).join(', ')}`);
    }

    // Mistakes
    const allMistakes: string[] = [];
    for (const t of closed) {
      if (t.mistakes?.length) allMistakes.push(...t.mistakes);
    }
    if (allMistakes.length > 0) {
      const freq: Record<string, number> = {};
      for (const m of allMistakes) freq[m] = (freq[m] || 0) + 1;
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      lines.push(`- Recorded mistakes: ${sorted.map(([m, c]) => `"${m}"(${c}x)`).join(', ')}`);
    }

    // Lessons
    const allLessons: string[] = [];
    for (const t of closed) {
      if (t.lessons?.length) allLessons.push(...t.lessons);
    }
    if (allLessons.length > 0) {
      lines.push(`- Lessons noted: ${allLessons.map((l) => `"${l}"`).join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a journal-insights report for the current period, persist it to
 * Redis (same keys the Journal Insights tab reads), and return it along with
 * the underlying entries/trades so callers can compute extra stats.
 *
 * Returns null when there is no journal or trade data for the period.
 * Throws when ANTHROPIC_API_KEY is missing.
 */
export async function generateJournalInsightsReport(
  userId: string,
  period: 'week' | 'month',
): Promise<GeneratedInsights | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const { startDate, endDate } = getPeriodDays(period);
  const { start, end } = getDateRange(period);
  const redis = await getRedisClient();

  // Fetch all journal entries in the period
  const journalKeys = await redis.keys(`daily-journal:${userId}:*`);
  const entries: JournalEntry[] = [];

  for (const key of journalKeys) {
    const data = await redis.hGetAll(key);
    if (!data?.id) continue;

    if (data.date >= startDate && data.date <= endDate) {
      entries.push({
        id: data.id,
        date: data.date,
        prompts: JSON.parse(data.prompts || '[]'),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Fetch trades for the period straight from the DB (no HTTP round-trip)
  const allTrades = await getAllTrades(userId);
  const periodTrades = allTrades.filter((t) => {
    const raw = t.exitDate || t.entryDate;
    if (!raw) return false;
    const day = getESTDateFromTimestamp(raw);
    return day >= startDate && day <= endDate;
  });

  if (entries.length === 0 && periodTrades.length === 0) {
    return null;
  }

  // Build context for Claude
  const context = buildStructuredSummary(entries, periodTrades);
  const periodLabel = period === 'week' ? 'this week' : 'this month';

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a trading performance coach. Analyze this trader's journal entries and trade data from ${periodLabel}.

Return your analysis as a JSON object with this exact structure:
{
  "keyTakeaway": "One sentence — the single most important thing to remember going into next ${period}.",
  "strengths": ["2-3 bullet strings of what's working well"],
  "improvements": ["2-3 bullet strings of specific areas to improve"],
  "patterns": ["1-2 bullet strings of recurring emotional or behavioral patterns you notice"]
}

Rules:
- Each bullet should be one concise, specific sentence grounded in the data — not generic advice.
- Return ONLY valid JSON, no markdown, no preamble, no closing remarks.
- If data is limited, work with what's available and note it in the takeaway.

---

${context}`,
      },
    ],
  });

  const analysisText = message.content[0].type === 'text' ? message.content[0].text : '';

  const currentPeriodKey = getPeriodKey(period);
  const report: SavedReport = {
    analysis: analysisText,
    period,
    periodKey: currentPeriodKey,
    periodLabel: getPeriodLabel(period, currentPeriodKey),
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    entriesCount: entries.length,
    tradesCount: periodTrades.filter((t) => t.status === 'CLOSED').length,
    generatedAt: new Date().toISOString(),
  };

  // Save report to Redis
  await redis.set(redisKey(userId, period, currentPeriodKey), JSON.stringify(report));

  // Update the archive index
  const rawIndex = await redis.get(indexKey(userId));
  const allReports: { period: string; periodKey: string; periodLabel: string; generatedAt: string }[] = rawIndex
    ? JSON.parse(rawIndex)
    : [];

  const existingIdx = allReports.findIndex(
    (r) => r.period === period && r.periodKey === currentPeriodKey,
  );
  const indexEntry = {
    period,
    periodKey: currentPeriodKey,
    periodLabel: report.periodLabel,
    generatedAt: report.generatedAt,
  };
  if (existingIdx >= 0) {
    allReports[existingIdx] = indexEntry;
  } else {
    allReports.push(indexEntry);
  }
  await redis.set(indexKey(userId), JSON.stringify(allReports));

  return { report, entries, trades: periodTrades };
}
