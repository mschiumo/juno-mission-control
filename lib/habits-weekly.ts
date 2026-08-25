/**
 * Weekly habit rollup + AI analysis — the data behind the Habits Weekly Recap
 * email (owner-only, see app/api/cron-jobs/weekly-habits-recap).
 *
 * Habits are stored one document per ET day (`habits_data:{userId}:{date}`),
 * each carrying that day's habit definitions and their `completedToday` flags.
 * A week is Monday → Sunday; monthly-cadence habits are reported month-to-date
 * as of the week's last day instead, so a "Volunteer once a month" habit still
 * shows up in the Monday email.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getRedisClient } from '@/lib/redis';
import {
  type HabitFrequency,
  type HabitPeriod,
  datesBetween,
  frequencyGoal,
  frequencyLabel,
  frequencyPeriod,
  monthStartFor,
  normalizeFrequency,
  shiftDate,
  weekRangeLabel,
} from '@/lib/habit-frequency';
import {
  type PersonalJournalEntry,
  summarizeJournalEntries,
} from '@/lib/personal-journal';

interface StoredHabit {
  id: string;
  name: string;
  icon?: string;
  frequency?: string;
  completedToday?: boolean;
  paused?: boolean;
  order?: number;
}

export type HabitStatus = 'complete' | 'partial' | 'missed';

export interface HabitWeekRow {
  id: string;
  name: string;
  icon: string;
  frequency: HabitFrequency;
  frequencyLabel: string;
  periodType: HabitPeriod;
  goal: number;
  completions: number;
  /** Capped at 100 — over-completing a 3x/wk habit isn't 150% of the goal. */
  rate: number;
  status: HabitStatus;
  /** Dates inside the period the habit was checked off. */
  days: string[];
}

export interface HabitWeek {
  weekStart: string;
  weekEnd: string;
  rangeLabel: string;
  /** Weekly-cadence habits (everything but `monthly`). */
  rows: HabitWeekRow[];
  /** Monthly-cadence habits, month-to-date through `weekEnd`. */
  monthlyRows: HabitWeekRow[];
  completed: number;
  partial: number;
  missed: number;
  /** Weighted completion across weekly habits, each capped at its own goal. */
  completionRate: number;
  /** Days in the week with at least one habit checked off. */
  activeDays: number;
  pausedCount: number;
}

export interface HabitsRecapAnalysis {
  keyTakeaway: string;
  wins: string[];
  gaps: string[];
  journalThemes: string[];
  focusNextWeek: string[];
}

function habitsKey(userId: string, date: string) {
  return `habits_data:${userId}:${date}`;
}

function statusFor(completions: number, goal: number): HabitStatus {
  if (completions >= goal) return 'complete';
  return completions > 0 ? 'partial' : 'missed';
}

/**
 * Build the rollup for the Mon–Sun week starting `weekStart`. Returns null when
 * the user has no habits configured at all.
 */
export async function buildHabitWeek(userId: string, weekStart: string): Promise<HabitWeek | null> {
  const redis = await getRedisClient();
  const weekEnd = shiftDate(weekStart, 6);
  const monthStart = monthStartFor(weekEnd);

  // Widen the window when the month started before the week did, so monthly
  // habits get a true month-to-date count.
  const firstDate = monthStart < weekStart ? monthStart : weekStart;
  const dates = datesBetween(firstDate, weekEnd);

  const raw = await redis.mGet(dates.map((d) => habitsKey(userId, d)));
  const byDate = new Map<string, StoredHabit[]>();
  dates.forEach((date, i) => {
    if (!raw[i]) return;
    try {
      byDate.set(date, JSON.parse(raw[i] as string));
    } catch {
      /* malformed day — treated as no data */
    }
  });

  // The current habit list is the source of truth for *what* to report; the day
  // documents are the source of truth for what was actually done.
  const listRaw = await redis.get(`habits_list:${userId}`);
  let definitions: StoredHabit[] = [];
  try {
    definitions = listRaw ? JSON.parse(listRaw) : [];
  } catch {
    definitions = [];
  }
  if (definitions.length === 0) {
    // No saved list — fall back to the most recent day inside the window.
    for (let i = dates.length - 1; i >= 0 && definitions.length === 0; i--) {
      definitions = byDate.get(dates[i]) ?? [];
    }
  }
  if (definitions.length === 0) return null;

  const weekDates = datesBetween(weekStart, weekEnd);
  const monthDates = datesBetween(monthStart, weekEnd);

  const rows: HabitWeekRow[] = [];
  const monthlyRows: HabitWeekRow[] = [];
  let pausedCount = 0;

  for (const def of [...definitions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (def.paused) {
      pausedCount++;
      continue;
    }
    const frequency = normalizeFrequency(def.frequency);
    const periodType = frequencyPeriod(frequency);
    const goal = frequencyGoal(frequency);
    const scope = periodType === 'month' ? monthDates : weekDates;

    const days = scope.filter((date) =>
      (byDate.get(date) ?? []).some((h) => h.id === def.id && h.completedToday),
    );

    const row: HabitWeekRow = {
      id: def.id,
      name: def.name,
      icon: def.icon || '⭐',
      frequency,
      frequencyLabel: frequencyLabel(frequency),
      periodType,
      goal,
      completions: days.length,
      rate: Math.min(100, Math.round((days.length / goal) * 100)),
      status: statusFor(days.length, goal),
      days,
    };

    (periodType === 'month' ? monthlyRows : rows).push(row);
  }

  const goalTotal = rows.reduce((acc, r) => acc + r.goal, 0);
  const doneTotal = rows.reduce((acc, r) => acc + Math.min(r.completions, r.goal), 0);

  const activeDays = weekDates.filter((date) =>
    (byDate.get(date) ?? []).some((h) => h.completedToday),
  ).length;

  return {
    weekStart,
    weekEnd,
    rangeLabel: weekRangeLabel(weekStart),
    rows,
    monthlyRows,
    completed: rows.filter((r) => r.status === 'complete').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    missed: rows.filter((r) => r.status === 'missed').length,
    completionRate: goalTotal > 0 ? Math.round((doneTotal / goalTotal) * 100) : 0,
    activeDays,
    pausedCount,
  };
}

/** Compact, model-readable rendering of the week's habit results. */
export function summarizeHabitWeek(week: HabitWeek): string {
  const lines: string[] = [];
  lines.push(`## Habits — week of ${week.rangeLabel}`);
  lines.push(
    `Overall: ${week.completionRate}% of weekly goals met · ` +
      `${week.completed} complete, ${week.partial} partial, ${week.missed} untouched · ` +
      `${week.activeDays}/7 days with at least one habit logged.\n`,
  );

  for (const row of week.rows) {
    const dayNames = row.days.map((d) => d.slice(5)).join(', ') || 'none';
    lines.push(
      `- ${row.name} (${row.frequencyLabel}): ${row.completions}/${row.goal} — ${row.status}. Days: ${dayNames}`,
    );
  }

  if (week.monthlyRows.length > 0) {
    lines.push('\n### Monthly habits (month-to-date)');
    for (const row of week.monthlyRows) {
      lines.push(`- ${row.name}: ${row.completions}/${row.goal} — ${row.status}`);
    }
  }

  return lines.join('\n');
}

function extractText(message: Anthropic.Message): string {
  for (const block of message.content) {
    if (block.type === 'text') return block.text;
  }
  return '';
}

function parseRecapAnalysis(raw: string): HabitsRecapAnalysis | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.keyTakeaway !== 'string') return null;
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    return {
      keyTakeaway: parsed.keyTakeaway,
      wins: list(parsed.wins),
      gaps: list(parsed.gaps),
      journalThemes: list(parsed.journalThemes),
      focusNextWeek: list(parsed.focusNextWeek),
    };
  } catch {
    return null;
  }
}

/**
 * Ask Claude to read the week's habit results *together with* the Dashboard
 * journal entries from the same week, so the analysis connects what was written
 * to what was actually done. Returns null when the API key is missing or the
 * response can't be parsed — the email still sends with the raw numbers.
 */
export async function analyzeHabitWeek(
  week: HabitWeek,
  entries: PersonalJournalEntry[],
): Promise<{ analysis: HabitsRecapAnalysis | null; raw: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { analysis: null, raw: '' };

  const journal =
    entries.length > 0
      ? summarizeJournalEntries(entries)
      : '## Journal Entries (0 total)\n\nNo journal entries were written this week.';

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: `You are a personal-accountability coach reviewing someone's week. You have two things: their habit tracker results, and the journal entries they wrote during the same week. Your job is to connect them — what they said they were dealing with, and what they actually did.

Return your analysis as a JSON object with this exact structure:
{
  "keyTakeaway": "One sentence — the single most important observation about this week.",
  "wins": ["2-3 bullet strings naming specific habits they hit and why that matters"],
  "gaps": ["2-3 bullet strings naming specific habits they missed, with a concrete, non-obvious reason drawn from the journal where one exists"],
  "journalThemes": ["2-3 bullet strings on the recurring emotional or mental themes in the journal entries"],
  "focusNextWeek": ["2-3 bullet strings — specific, actionable priorities for next week"]
}

Rules:
- Name actual habits and quote or paraphrase actual journal content. Never write generic advice that could apply to anyone.
- Where a missed habit lines up with something in the journal, say so explicitly — that connection is the point of this report.
- If there are no journal entries, return an empty array for "journalThemes" and work from the habit data alone.
- Warm and direct, not preachy. One concise sentence per bullet.
- Return ONLY valid JSON — no markdown, no preamble, no closing remarks.

---

${summarizeHabitWeek(week)}

---

${journal}`,
      },
    ],
  });

  const raw = extractText(message);
  return { analysis: parseRecapAnalysis(raw), raw };
}
