import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';

// Discipline HQ — derives a daily discipline score from data the dashboard
// already records (habits_data + personal-journal) and layers a per-day
// "Today's #1 Focus" on top. History is computed on read, so past scores stay
// truthful to what was actually logged each day.

const FOCUS_KEY_PREFIX = 'discipline_focus';
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

interface DayFocus {
  text: string;
  done: boolean;
  updatedAt: string;
}

export interface DisciplineDay {
  date: string;
  score: number | null; // null = no data logged that day
  habitScore: number | null;
  journaled: boolean;
  focus: DayFocus | null;
}

function focusKey(userId: string, date: string) {
  return `${FOCUS_KEY_PREFIX}:${userId}:${date}`;
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
 * Blend the day's components into a 0–100 score.
 * Habits carry most of the weight; journaling and the #1 focus keep the
 * reflective and priority-setting muscles honest. Weights redistribute when a
 * component wasn't in play that day (e.g. no focus was ever set).
 */
function blendScore(habitScore: number | null, journaled: boolean, focus: DayFocus | null): number | null {
  const parts: { value: number; weight: number }[] = [];
  if (habitScore !== null) parts.push({ value: habitScore, weight: 0.6 });
  if (focus?.text) parts.push({ value: focus.done ? 1 : 0, weight: 0.15 });
  // Journal always participates once any other signal exists for the day —
  // skipping the journal is itself a discipline signal.
  if (parts.length > 0) parts.push({ value: journaled ? 1 : 0, weight: 0.25 });
  else if (journaled) parts.push({ value: 1, weight: 1 });

  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((acc, p) => acc + p.weight, 0);
  const weighted = parts.reduce((acc, p) => acc + p.value * p.weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

async function readDay(
  redis: Awaited<ReturnType<typeof getRedisClient>>,
  userId: string,
  date: string
): Promise<DisciplineDay> {
  const [habitsRaw, journalHash, focusRaw] = await Promise.all([
    redis.get(habitsKey(userId, date)),
    redis.hGetAll(journalKey(userId, date)),
    redis.get(focusKey(userId, date)),
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

  let focus: DayFocus | null = null;
  if (focusRaw) {
    try {
      focus = JSON.parse(focusRaw) as DayFocus;
    } catch {
      focus = null;
    }
  }

  return { date, score: blendScore(habitScore, journaled, focus), habitScore, journaled, focus };
}

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const today = getTodayEST();

    const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(today, -(HISTORY_DAYS - 1 - i)));
    const days = await Promise.all(dates.map((d) => readDay(redis, userId, d)));

    // Streaks at risk: habits with a live streak that haven't been logged today.
    let atRisk: { id: string; name: string; icon: string; streak: number }[] = [];
    const todayHabitsRaw = await redis.get(habitsKey(userId, today));
    if (todayHabitsRaw) {
      try {
        const habits = JSON.parse(todayHabitsRaw) as StoredHabit[];
        atRisk = habits
          .filter((h) => !h.completedToday && (h.streak ?? 0) >= 2)
          .map((h) => ({ id: h.id, name: h.name, icon: h.icon, streak: h.streak }))
          .sort((a, b) => b.streak - a.streak);
      } catch {
        atRisk = [];
      }
    }

    return NextResponse.json({ success: true, today, days, atRisk });
  } catch (err) {
    console.error('Discipline GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to load discipline data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();
    const { text, done } = body as { text?: string; done?: boolean };

    if (text === undefined && done === undefined) {
      return NextResponse.json({ success: false, error: 'text or done is required' }, { status: 400 });
    }
    if (text !== undefined && (typeof text !== 'string' || text.length > 200)) {
      return NextResponse.json({ success: false, error: 'text must be a string of at most 200 chars' }, { status: 400 });
    }

    const redis = await getRedisClient();
    const today = getTodayEST();
    const key = focusKey(userId, today);

    const existingRaw = await redis.get(key);
    let existing: DayFocus | null = null;
    if (existingRaw) {
      try { existing = JSON.parse(existingRaw) as DayFocus; } catch { existing = null; }
    }

    const focus: DayFocus = {
      text: text !== undefined ? text.trim() : existing?.text ?? '',
      done: done !== undefined ? !!done : existing?.done ?? false,
      updatedAt: new Date().toISOString(),
    };

    if (!focus.text) {
      // Clearing the text clears the focus for the day entirely.
      await redis.del(key);
      return NextResponse.json({ success: true, focus: null });
    }

    // Keep focus entries around long enough for the 30-day history window.
    await redis.set(key, JSON.stringify(focus), { EX: 60 * 60 * 24 * 45 });
    return NextResponse.json({ success: true, focus });
  } catch (err) {
    console.error('Discipline POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to save focus' }, { status: 500 });
  }
}
