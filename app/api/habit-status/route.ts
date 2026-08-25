import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import { requireUserId } from '@/lib/auth-session';
import {
  type HabitFrequency,
  type PeriodProgress,
  datesBetween,
  isHabitFrequency,
  lookbackDays,
  normalizeFrequency,
  periodProgress,
  shiftDate,
} from '@/lib/habit-frequency';

const STORAGE_KEY_PREFIX = 'habits_data';
const HABITS_LIST_KEY = 'habits_list';

// MJ's specific habits with rolling history
const DEFAULT_HABITS = [
  { id: 'make-bed',    name: 'Make Bed',     icon: '🛏️', target: 'Daily',   category: 'productivity', frequency: 'daily' as HabitFrequency },
  { id: 'exercise',   name: 'Exercise',     icon: '💪', target: '4x/week', category: 'fitness',      frequency: '4x'    as HabitFrequency },
  { id: 'read',       name: 'Read',         icon: '📚', target: '30 min',  category: 'learning',     frequency: 'daily' as HabitFrequency },
  { id: 'drink-water',name: 'Drink Water',  icon: '💧', target: '2L daily',category: 'health',       frequency: 'daily' as HabitFrequency },
  { id: 'journal',    name: 'Journal',      icon: '📝', target: 'Daily',   category: 'mindfulness',  frequency: 'daily' as HabitFrequency },
];

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;

  try {
    const client = createClient({ url: process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

function getStorageKey(userId: string, date: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}:${date}`;
}

function getHabitsListKey(userId: string) {
  return `${HABITS_LIST_KEY}:${userId}`;
}

function getToday() {
  // Use EST (America/New_York) for date
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month}-${day}`; // Convert MM/DD/YYYY to YYYY-MM-DD
}

function getPreviousDate(dateStr: string, daysBack: number) {
  return shiftDate(dateStr, -daysBack);
}

interface HabitData {
  id: string;
  name: string;
  icon: string;
  target: string;
  category: string;
  frequency: HabitFrequency;
  completedToday: boolean;
  streak: number;
  history: boolean[]; // Last 7 days (oldest to newest)
  order: number;
  paused?: boolean;
}

/** What the client receives: stored habit + its current period standing. */
type DecoratedHabit = HabitData & PeriodProgress;

type HabitDefinition = Pick<HabitData, 'id' | 'name' | 'icon' | 'target' | 'category' | 'frequency' | 'order' | 'paused'>;

/**
 * Stats exclude paused habits — they're neither completable nor tracked while
 * paused. "Done today" counts a habit that's already fulfilled for its period
 * (a weekly habit logged on Monday still reads as done on Thursday), and the
 * weekly bar caps each habit at its own goal so over-completion can't push a
 * partial week to 100%. Monthly habits sit outside the weekly bar.
 */
function computeStats(habits: DecoratedHabit[]) {
  const active = habits.filter(h => !h.paused);
  const doneToday = active.filter(h => h.completedToday || h.fulfilled).length;

  const weekly = active.filter(h => h.periodType === 'week');
  const weeklyDone = weekly.reduce((acc, h) => acc + Math.min(h.periodCompletions, h.periodGoal), 0);
  const weeklyGoalTotal = weekly.reduce((acc, h) => acc + h.periodGoal, 0);

  const monthly = active.filter(h => h.periodType === 'month');
  const monthlyDone = monthly.reduce((acc, h) => acc + Math.min(h.periodCompletions, h.periodGoal), 0);
  const monthlyGoalTotal = monthly.reduce((acc, h) => acc + h.periodGoal, 0);

  return {
    totalHabits: active.length,
    completedToday: doneToday,
    longestStreak: Math.max(...active.map(h => h.streak), 0),
    weeklyCompletion: weeklyGoalTotal > 0 ? Math.round((weeklyDone / weeklyGoalTotal) * 100) : 0,
    monthlyCompletion: monthlyGoalTotal > 0 ? Math.round((monthlyDone / monthlyGoalTotal) * 100) : 0,
    monthlyHabits: monthly.length,
    fulfilled: active.filter(h => h.fulfilled).length,
  };
}

async function saveHabitsList(redis: ReturnType<typeof createClient>, userId: string, habits: HabitData[]) {
  const defs: HabitDefinition[] = habits.map(({ id, name, icon, target, category, frequency, order, paused }) => ({
    id, name, icon, target, category, frequency, order, paused,
  }));
  await redis.set(getHabitsListKey(userId), JSON.stringify(defs));
}

async function loadHabitsList(redis: ReturnType<typeof createClient>, userId: string): Promise<HabitDefinition[]> {
  const stored = await redis.get(getHabitsListKey(userId));
  const parsed = stored ? JSON.parse(stored) : null;
  if (parsed && parsed.length > 0) return parsed;
  // No habits stored (new user or all deleted) — seed with defaults
  const defs = DEFAULT_HABITS.map((h, i) => ({ ...h, order: i }));
  await redis.set(getHabitsListKey(userId), JSON.stringify(defs));
  return defs;
}

/**
 * Calculate the current streak by walking backwards through history
 * Streak = consecutive days of completion, ending with today/yesterday
 *
 * Logic:
 * - If completedToday: streak includes today, then walk backwards through history
 * - If not completedToday: streak only counts completed days in history (consecutive from yesterday back)
 * - Streak breaks on first false value when walking backwards
 */
function calculateStreak(completedToday: boolean, history: boolean[]): number {
  let streak = 0;

  if (completedToday) {
    streak = 1; // Count today
    // Walk backwards through history (newest first = end of array)
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]) {
        streak++;
      } else {
        break; // Streak broken
      }
    }
  } else {
    // Not completed today - count consecutive true values from yesterday back
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]) {
        streak++;
      } else {
        break; // Streak broken
      }
    }
  }

  return streak;
}

/**
 * Read every prior day the current periods touch (at least the last 7, more when
 * a monthly habit is in play) in one round trip, and return
 * `date -> habitId -> completed`.
 */
async function loadPriorDays(
  redis: ReturnType<typeof createClient> | null,
  userId: string,
  today: string,
  daysBack: number
): Promise<Map<string, Map<string, boolean>>> {
  const byDate = new Map<string, Map<string, boolean>>();
  if (!redis || daysBack <= 0) return byDate;

  const dates = datesBetween(shiftDate(today, -daysBack), shiftDate(today, -1));
  const values = await redis.mGet(dates.map(d => getStorageKey(userId, d)));

  dates.forEach((date, i) => {
    const raw = values[i];
    if (!raw) return;
    try {
      const day = JSON.parse(raw) as { id: string; completedToday?: boolean }[];
      byDate.set(date, new Map(day.map(h => [h.id, !!h.completedToday])));
    } catch {
      /* malformed day — treated as no data */
    }
  });

  return byDate;
}

/**
 * Attach the rolling 7-day history, the recomputed streak, and each habit's
 * standing inside its own period (week for everything but `monthly`). This is
 * what makes a fulfilled habit stay checked for the rest of its period.
 */
async function decorateHabits(
  redis: ReturnType<typeof createClient> | null,
  userId: string,
  today: string,
  habits: HabitData[]
): Promise<DecoratedHabit[]> {
  const daysBack = Math.max(7, lookbackDays(habits.map(h => h.frequency), today));
  const byDate = await loadPriorDays(redis, userId, today, daysBack);

  const historyDates = datesBetween(shiftDate(today, -7), shiftDate(today, -1));

  return habits.map(habit => {
    const frequency = normalizeFrequency(habit.frequency);
    const history = historyDates.map(date => byDate.get(date)?.get(habit.id) ?? false);

    const completedDates: string[] = [];
    for (const [date, day] of byDate) {
      if (day.get(habit.id)) completedDates.push(date);
    }
    if (habit.completedToday) completedDates.push(today);

    return {
      ...habit,
      frequency,
      history,
      streak: calculateStreak(habit.completedToday, history),
      ...periodProgress(frequency, today, completedDates),
    };
  });
}

/** Shape used by the offline/no-Redis fallbacks — no history to read. */
function bareHabits(today: string): DecoratedHabit[] {
  return DEFAULT_HABITS.map((h, index) => ({
    ...h,
    completedToday: false,
    streak: 0,
    history: [false, false, false, false, false, false, false],
    order: index,
    ...periodProgress(h.frequency, today, []),
  }));
}

// Initialize or shift history for a new day
function initializeHabits(previousData: HabitData[] | null, today: string, habitDefs?: HabitDefinition[]): HabitData[] {
  if (!previousData) {
    const source = habitDefs ?? DEFAULT_HABITS.map((h, i) => ({ ...h, order: i }));
    return source.map(h => ({
      ...h,
      frequency: normalizeFrequency(h.frequency),
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false] as boolean[],
    }));
  }

  // Shift history: drop oldest, add yesterday's completion as newest
  return previousData.map(h => {
    const yesterdayCompleted = h.completedToday;
    const newHistory = [...h.history.slice(1), yesterdayCompleted];

    // Calculate streak using the new history
    const streak = calculateStreak(false, newHistory);

    return {
      ...h,
      frequency: normalizeFrequency(h.frequency),
      completedToday: false, // Reset for new day
      streak,
      history: newHistory
    };
  });
}

/**
 * Today's stored habits, initializing the day from yesterday (and the user's
 * saved habit list) the first time it's touched. Returns null when Redis is
 * unavailable.
 */
async function loadToday(
  redis: ReturnType<typeof createClient>,
  userId: string,
  today: string,
  { persist = false }: { persist?: boolean } = {}
): Promise<HabitData[]> {
  const stored = await redis.get(getStorageKey(userId, today));
  if (stored) return JSON.parse(stored);

  const yesterdayData = await redis.get(getStorageKey(userId, getPreviousDate(today, 1)));
  const habitDefs = await loadHabitsList(redis, userId);
  const habits = initializeHabits(yesterdayData ? JSON.parse(yesterdayData) : null, today, habitDefs);
  if (persist) await redis.set(getStorageKey(userId, today), JSON.stringify(habits));
  return habits;
}

/** Decorate + sort + wrap in the standard success payload. */
async function respondWith(
  redis: ReturnType<typeof createClient> | null,
  userId: string,
  today: string,
  habits: HabitData[]
) {
  const decorated = await decorateHabits(redis, userId, today, habits);
  decorated.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return NextResponse.json({
    success: true,
    data: { habits: decorated, stats: computeStats(decorated) },
  });
}

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const today = getToday();

  try {
    const redis = await getRedisClient();

    if (!redis) {
      // No Redis - check localStorage fallback via client (handled in HabitCard)
      const habits = bareHabits(today);
      return NextResponse.json({
        success: true,
        data: { habits, stats: computeStats(habits) },
        timestamp: new Date().toISOString(),
        serverAvailable: false,
      });
    }

    const habits = await loadToday(redis, userId, today, { persist: true });
    const decorated = await decorateHabits(redis, userId, today, habits);
    decorated.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return NextResponse.json({
      success: true,
      data: {
        habits: decorated,
        stats: computeStats(decorated)
      },
      timestamp: new Date().toISOString(),
      serverAvailable: true
    });
  } catch (error) {
    console.error('Habit status error:', error);

    // Fallback - still return defaults but with error indication
    const habits = bareHabits(today);

    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats: computeStats(habits)
      },
      serverAvailable: false,
      error: 'Server error, using defaults'
    });
  }
}

export async function POST(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();
    const { habitId, completed } = body;

    if (!habitId) {
      return NextResponse.json({ success: false, error: 'habitId is required' }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
    }

    const today = getToday();
    const habits = await loadToday(redis, userId, today);

    // Update the habit
    const habitIndex = habits.findIndex(h => h.id === habitId);
    if (habitIndex === -1) {
      return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });
    }

    if (habits[habitIndex].paused) {
      return NextResponse.json({ success: false, error: 'Habit is paused' }, { status: 400 });
    }

    habits[habitIndex].completedToday = completed;

    // Recalculate streak based on new state
    habits[habitIndex].streak = calculateStreak(completed, habits[habitIndex].history);

    // Save back to Redis
    await redis.set(getStorageKey(userId, today), JSON.stringify(habits));

    return respondWith(redis, userId, today, habits);
  } catch (error) {
    console.error('Habit update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update habit' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();
    const { habitId, name, icon, target, category, frequency } = body;

    if (!name || !icon) {
      return NextResponse.json({ success: false, error: 'name and icon are required' }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });

    const today = getToday();
    const habits = await loadToday(redis, userId, today);

    const freq: HabitFrequency = isHabitFrequency(frequency) ? frequency : 'daily';

    if (habitId) {
      // ── EDIT existing habit ──────────────────────────────────────────────
      const idx = habits.findIndex(h => h.id === habitId);
      if (idx === -1) return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });
      habits[idx] = { ...habits[idx], name, icon, target: target ?? habits[idx].target, category: category ?? habits[idx].category, frequency: freq };
    } else {
      // ── CREATE new habit ─────────────────────────────────────────────────
      if (!target) return NextResponse.json({ success: false, error: 'target is required' }, { status: 400 });
      const maxOrder = habits.length > 0 ? Math.max(...habits.map(h => h.order ?? 0)) : -1;
      habits.push({
        id: `habit_${Date.now()}`,
        name, icon, target,
        category: category ?? 'other',
        frequency: freq,
        completedToday: false,
        streak: 0,
        history: [false, false, false, false, false, false, false],
        order: maxOrder + 1,
      });
    }

    await redis.set(getStorageKey(userId, today), JSON.stringify(habits));
    await saveHabitsList(redis, userId, habits);

    return respondWith(redis, userId, today, habits);
  } catch (error) {
    console.error('Habit PUT error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save habit' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const habitId = searchParams.get('habitId');

    if (!habitId) {
      return NextResponse.json({ success: false, error: 'habitId is required' }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
    }

    const today = getToday();
    const stored = await redis.get(getStorageKey(userId, today));
    if (!stored) {
      return NextResponse.json({ success: false, error: 'No habits found' }, { status: 404 });
    }
    const habits: HabitData[] = JSON.parse(stored);

    // Remove the habit
    const filteredHabits = habits.filter(h => h.id !== habitId);

    if (filteredHabits.length === habits.length) {
      return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });
    }

    // Reorder remaining habits
    const reorderedHabits = filteredHabits
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((h, index) => ({ ...h, order: index }));

    await redis.set(getStorageKey(userId, today), JSON.stringify(reorderedHabits));
    await saveHabitsList(redis, userId, reorderedHabits);

    return respondWith(redis, userId, today, reorderedHabits);
  } catch (error) {
    console.error('Habit delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete habit' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();
    const { habitIds, habitId, paused } = body;

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
    }

    const today = getToday();
    const stored = await redis.get(getStorageKey(userId, today));
    if (!stored) {
      return NextResponse.json({ success: false, error: 'No habits found' }, { status: 404 });
    }
    const habits: HabitData[] = JSON.parse(stored);

    if (habitId && typeof paused === 'boolean') {
      // ── PAUSE / RESUME a habit ───────────────────────────────────────────
      const idx = habits.findIndex(h => h.id === habitId);
      if (idx === -1) return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });

      habits[idx] = { ...habits[idx], paused };

      await redis.set(getStorageKey(userId, today), JSON.stringify(habits));
      await saveHabitsList(redis, userId, habits);

      return respondWith(redis, userId, today, habits);
    }

    if (!habitIds || !Array.isArray(habitIds)) {
      return NextResponse.json({
        success: false,
        error: 'habitIds array is required'
      }, { status: 400 });
    }

    // Update order based on the new habitIds array
    const updatedHabits = habits.map(habit => {
      const newIndex = habitIds.indexOf(habit.id);
      if (newIndex !== -1) {
        return { ...habit, order: newIndex };
      }
      return habit;
    });

    // Sort by the new order
    updatedHabits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    await redis.set(getStorageKey(userId, today), JSON.stringify(updatedHabits));
    await saveHabitsList(redis, userId, updatedHabits);

    return respondWith(redis, userId, today, updatedHabits);
  } catch (error) {
    console.error('Habit reorder error:', error);
    return NextResponse.json({ success: false, error: 'Failed to reorder habits' }, { status: 500 });
  }
}
