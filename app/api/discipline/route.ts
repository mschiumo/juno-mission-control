import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';

// Discipline HQ — derives a daily discipline score from data the dashboard
// already records (habits_data + personal-journal). History is computed on
// read, so past scores stay truthful to what was actually logged each day.

const HISTORY_DAYS = 30;

type HabitFrequency = 'daily' | 'weekdays' | '3x' | '4x' | '5x' | '6x';

interface StoredHabit {
  id: string;
  name: string;
  icon: string;
  frequency?: HabitFrequency;
  completedToday: boolean;
  streak: number;
  history: boolean[]; // trailing 7 days, oldest → newest
}

export interface DisciplineDay {
  date: string;
  score: number | null; // null = no data logged that day
  habitScore: number | null;
  journaled: boolean;
}

function habitsKey(userId: string, date: string) {
  return `habits_data:${userId}:${date}`;
}

function journalKey(userId: string, date: string) {
  return `personal-journal:${userId}:${date}`;
}

function getTodayEST(): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days, 12); // noon anchor dodges DST
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isWeekday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d, 12).getDay();
  return dow >= 1 && dow <= 5;
}

function weeklyGoal(frequency: HabitFrequency | undefined): number {
  switch (frequency) {
    case 'weekdays': return 5;
    case '3x':       return 3;
    case '4x':       return 4;
    case '5x':       return 5;
    case '6x':       return 6;
    default:         return 7;
  }
}

/**
 * Pace-aware habit score for one day: daily/weekday habits are due by the
 * calendar; Nx-per-week habits only count as "due" when the trailing 7-day
 * window is behind pace, so rest days don't drag the score down.
 * Returns completed/due, or null when no habit was due.
 */
function habitDayScore(habits: StoredHabit[], date: string): number | null {
  let due = 0;
  let done = 0;

  for (const h of habits) {
    const freq = h.frequency ?? 'daily';

    if (freq === 'daily' || (freq === 'weekdays' && isWeekday(date))) {
      due++;
      if (h.completedToday) done++;
      continue;
    }
    if (freq === 'weekdays') continue; // weekend — not due

    // Nx/week: on pace for the trailing window counts as satisfied.
    const goal = weeklyGoal(freq);
    const trailing = (h.history || []).filter(Boolean).length + (h.completedToday ? 1 : 0);
    if (trailing >= goal) {
      due++;
      done++;
    } else {
      due++;
      if (h.completedToday) done++;
    }
  }

  return due > 0 ? done / due : null;
}

/**
 * Blend the day's components into a 0–100 score: habits carry most of the
 * weight (70%), journaling the rest (30%) — skipping the journal is itself a
 * discipline signal.
 */
function blendScore(habitScore: number | null, journaled: boolean): number | null {
  if (habitScore === null) return journaled ? 100 : null;
  const weighted = habitScore * 0.7 + (journaled ? 1 : 0) * 0.3;
  return Math.round(weighted * 100);
}

async function readDay(
  redis: Awaited<ReturnType<typeof getRedisClient>>,
  userId: string,
  date: string
): Promise<DisciplineDay> {
  const [habitsRaw, journalHash] = await Promise.all([
    redis.get(habitsKey(userId, date)),
    redis.hGetAll(journalKey(userId, date)),
  ]);

  let habitScore: number | null = null;
  if (habitsRaw) {
    try {
      habitScore = habitDayScore(JSON.parse(habitsRaw) as StoredHabit[], date);
    } catch {
      habitScore = null;
    }
  }

  let journaled = false;
  if (journalHash && journalHash.prompts) {
    try {
      const prompts = JSON.parse(journalHash.prompts) as { answer?: string }[];
      journaled = prompts.some((p) => p.answer?.trim());
    } catch {
      journaled = false;
    }
  }

  return { date, score: blendScore(habitScore, journaled), habitScore, journaled };
}

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const today = getTodayEST();

    const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(today, -(HISTORY_DAYS - 1 - i)));
    const days = await Promise.all(dates.map((d) => readDay(redis, userId, d)));

    return NextResponse.json({ success: true, today, days });
  } catch (err) {
    console.error('Discipline GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to load discipline data' }, { status: 500 });
  }
}
