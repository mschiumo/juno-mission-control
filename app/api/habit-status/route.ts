import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import { requireUserId } from '@/lib/auth-session';

const STORAGE_KEY_PREFIX = 'habits_data';
const HABITS_LIST_KEY = 'habits_list';

type HabitFrequency = 'daily' | 'weekdays' | '3x' | '4x' | '5x' | '6x';

function weeklyGoal(frequency: HabitFrequency | string | undefined): number {
  switch (frequency) {
    case 'weekdays': return 5;
    case '3x':       return 3;
    case '4x':       return 4;
    case '5x':       return 5;
    case '6x':       return 6;
    default:         return 7; // 'daily' or undefined
  }
}

// MJ's specific habits with rolling history
const DEFAULT_HABITS = [
  { id: 'make-bed',      name: 'Make Bed',                         icon: '🛏️', target: 'Daily',        category: 'productivity', frequency: 'daily'    as HabitFrequency },
  { id: 'take-meds',     name: 'Take Meds (Morning)',               icon: '💊', target: 'Daily',        category: 'health',       frequency: 'daily'    as HabitFrequency },
  { id: 'market-brief',  name: 'Read Market Brief, Stock Screeners',icon: '📈', target: 'Weekdays',     category: 'trading',      frequency: 'weekdays' as HabitFrequency },
  { id: 'exercise',      name: 'Exercise / Lift',                   icon: '💪', target: '4x/week',      category: 'fitness',      frequency: '4x'       as HabitFrequency },
  { id: 'read',          name: 'Read',                              icon: '📚', target: '30 min',       category: 'learning',     frequency: 'daily'    as HabitFrequency },
  { id: 'drink-water',   name: 'Drink Water',                       icon: '💧', target: '2L daily',     category: 'health',       frequency: 'daily'    as HabitFrequency },
  { id: 'journal',       name: 'Journal',                           icon: '📝', target: 'Daily',        category: 'mindfulness',  frequency: 'daily'    as HabitFrequency },
  { id: 'trade-journal', name: 'Trade Journal',                     icon: '📊', target: 'Trading days', category: 'trading',      frequency: 'weekdays' as HabitFrequency },
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
  // Parse the EST date string
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // Month is 0-indexed
  date.setDate(date.getDate() - daysBack);

  // Return in YYYY-MM-DD format
  const prevDateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [prevMonth, prevDay, prevYear] = prevDateStr.split('/');
  return `${prevYear}-${prevMonth}-${prevDay}`;
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
}

type HabitDefinition = Pick<HabitData, 'id' | 'name' | 'icon' | 'target' | 'category' | 'frequency' | 'order'>;

async function saveHabitsList(redis: ReturnType<typeof createClient>, userId: string, habits: HabitData[]) {
  const defs: HabitDefinition[] = habits.map(({ id, name, icon, target, category, frequency, order }) => ({
    id, name, icon, target, category, frequency, order,
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
 * Fetch historical completion data for a habit
 * Walks backwards through dates to build a complete picture
 */
async function fetchHistoricalData(redis: ReturnType<typeof createClient> | null, userId: string, startDate: string, daysToFetch: number): Promise<Map<string, HabitData[]>> {
  const historicalData = new Map<string, HabitData[]>();

  if (!redis) return historicalData;

  for (let i = 0; i < daysToFetch; i++) {
    const date = getPreviousDate(startDate, i);
    const key = getStorageKey(userId, date);
    const data = await redis.get(key);
    if (data) {
      historicalData.set(date, JSON.parse(data));
    }
  }

  return historicalData;
}

/**
 * Build complete history by looking at actual historical data
 * This handles gaps in the rolling 7-day window stored in Redis
 */
function buildCompleteHistory(
  habitId: string, 
  currentHistory: boolean[], 
  historicalData: Map<string, HabitData[]>, 
  today: string
): boolean[] {
  const completeHistory: boolean[] = [];
  
  // Walk backwards through dates
  for (let i = 1; i <= 7; i++) {
    const date = getPreviousDate(today, i);
    const dayData = historicalData.get(date);
    
    if (dayData) {
      const habit = dayData.find(h => h.id === habitId);
      if (habit) {
        completeHistory.unshift(habit.completedToday); // Add to front (oldest first)
      } else {
        completeHistory.unshift(false);
      }
    } else {
      // No data for this date - assume false
      completeHistory.unshift(false);
    }
  }
  
  return completeHistory;
}

// Initialize or shift history for a new day
function initializeHabits(previousData: HabitData[] | null, today: string, habitDefs?: HabitDefinition[]): HabitData[] {
  if (!previousData) {
    const source = habitDefs ?? DEFAULT_HABITS.map((h, i) => ({ ...h, order: i }));
    return source.map(h => ({
      ...h,
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
      completedToday: false, // Reset for new day
      streak,
      history: newHistory
    };
  });
}

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const today = getToday();
    const storageKey = getStorageKey(userId, today);

    let habits: HabitData[];

    if (redis) {
      // Try to load today's data
      const stored = await redis.get(storageKey);

      if (stored) {
        // Today's data exists - recalculate streaks to ensure accuracy
        habits = JSON.parse(stored);

        // Fetch historical data for accurate streak calculation
        const historicalData = await fetchHistoricalData(redis, userId, today, 30);

        habits = habits.map(habit => {
          // Build complete history from historical data
          const completeHistory = buildCompleteHistory(habit.id, habit.history, historicalData, today);

          // Recalculate streak based on complete history
          const streak = calculateStreak(habit.completedToday, completeHistory);

          return {
            ...habit,
            history: completeHistory,
            streak
          };
        });
      } else {
        // No data for today - check yesterday to initialize
        const yesterday = getPreviousDate(today, 1);
        const yesterdayKey = getStorageKey(userId, yesterday);
        const yesterdayData = await redis.get(yesterdayKey);

        const habitDefs = await loadHabitsList(redis, userId);
        habits = initializeHabits(yesterdayData ? JSON.parse(yesterdayData) : null, today, habitDefs);
        await redis.set(storageKey, JSON.stringify(habits));
      }
    } else {
      // No Redis - check localStorage fallback via client (handled in HabitCard)
      // Return defaults but indicate server is unavailable
      habits = DEFAULT_HABITS.map((h, index) => ({
        ...h,
        completedToday: false,
        streak: 0,
        history: [false, false, false, false, false, false, false],
        order: index
      }));
    }
    
    // Sort habits by order
    habits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Calculate stats from history
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalHabits = habits.length;
    const longestStreak = Math.max(...habits.map(h => h.streak), 0);

    const totalCompletions = habits.reduce((acc, h) =>
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const totalGoal = habits.reduce((acc, h) => acc + weeklyGoal(h.frequency), 0);
    const weeklyCompletion = totalGoal > 0 ? Math.round((totalCompletions / totalGoal) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats: {
          totalHabits,
          completedToday,
          longestStreak,
          weeklyCompletion
        }
      },
      timestamp: new Date().toISOString(),
      serverAvailable: !!redis
    });
  } catch (error) {
    console.error('Habit status error:', error);
    
    // Fallback - still return defaults but with error indication
    const habits = DEFAULT_HABITS.map((h, index) => ({
      ...h,
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false],
      order: index
    }));
    
    return NextResponse.json({ 
      success: true, 
      data: {
        habits,
        stats: { totalHabits: habits.length, completedToday: 0, longestStreak: 0, weeklyCompletion: 0 }
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
    const today = getToday();
    const storageKey = getStorageKey(userId, today);

    // Load current habits
    let habits: HabitData[];
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        habits = JSON.parse(stored);
      } else {
        // Initialize from yesterday if needed
        const yesterday = getPreviousDate(today, 1);
        const yesterdayData = await redis.get(getStorageKey(userId, yesterday));
        habits = initializeHabits(yesterdayData ? JSON.parse(yesterdayData) : null, today);
      }
    } else {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
    }
    
    // Update the habit
    const habitIndex = habits.findIndex(h => h.id === habitId);
    if (habitIndex === -1) {
      return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });
    }
    
    habits[habitIndex].completedToday = completed;
    
    // Recalculate streak based on new state
    habits[habitIndex].streak = calculateStreak(completed, habits[habitIndex].history);
    
    // Save back to Redis
    await redis.set(storageKey, JSON.stringify(habits));
    
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalCompletions = habits.reduce((acc, h) =>
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const totalGoal = habits.reduce((acc, h) => acc + weeklyGoal(h.frequency), 0);
    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats: {
          totalHabits: habits.length,
          completedToday,
          longestStreak: Math.max(...habits.map(h => h.streak)),
          weeklyCompletion: totalGoal > 0 ? Math.round((totalCompletions / totalGoal) * 100) : 0,
        }
      }
    });
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
    const storageKey = getStorageKey(userId, today);

    let habits: HabitData[];
    const stored = await redis.get(storageKey);
    if (stored) {
      habits = JSON.parse(stored);
    } else {
      const yesterday = getPreviousDate(today, 1);
      const yesterdayData = await redis.get(getStorageKey(userId, yesterday));
      const habitDefs = await loadHabitsList(redis, userId);
      habits = initializeHabits(yesterdayData ? JSON.parse(yesterdayData) : null, today, habitDefs);
    }

    const freq: HabitFrequency = (['daily','weekdays','3x','4x','5x','6x'] as HabitFrequency[]).includes(frequency)
      ? frequency : 'daily';

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

    await redis.set(storageKey, JSON.stringify(habits));
    await saveHabitsList(redis, userId, habits);

    const completedToday = habits.filter(h => h.completedToday).length;
    const totalCompletions = habits.reduce((acc, h) =>
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const totalGoal = habits.reduce((acc, h) => acc + weeklyGoal(h.frequency), 0);

    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats: {
          totalHabits: habits.length,
          completedToday,
          longestStreak: Math.max(...habits.map(h => h.streak), 0),
          weeklyCompletion: totalGoal > 0 ? Math.round((totalCompletions / totalGoal) * 100) : 0,
        }
      }
    });
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
    const today = getToday();
    const storageKey = getStorageKey(userId, today);

    // Load current habits
    let habits: HabitData[];
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        habits = JSON.parse(stored);
      } else {
        return NextResponse.json({ success: false, error: 'No habits found' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
    }
    
    // Remove the habit
    const filteredHabits = habits.filter(h => h.id !== habitId);
    
    if (filteredHabits.length === habits.length) {
      return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });
    }
    
    // Reorder remaining habits
    const reorderedHabits = filteredHabits
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((h, index) => ({ ...h, order: index }));
    
    await redis.set(storageKey, JSON.stringify(reorderedHabits));
    await saveHabitsList(redis, userId, reorderedHabits);

    const completedToday = reorderedHabits.filter(h => h.completedToday).length;
    const totalCompletions = reorderedHabits.reduce((acc, h) =>
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const totalGoal = reorderedHabits.reduce((acc, h) => acc + weeklyGoal(h.frequency), 0);
    return NextResponse.json({
      success: true,
      data: {
        habits: reorderedHabits,
        stats: {
          totalHabits: reorderedHabits.length,
          completedToday,
          longestStreak: Math.max(...reorderedHabits.map(h => h.streak), 0),
          weeklyCompletion: totalGoal > 0 ? Math.round((totalCompletions / totalGoal) * 100) : 0,
        }
      }
    });
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
    const { habitIds } = body;

    if (!habitIds || !Array.isArray(habitIds)) {
      return NextResponse.json({
        success: false,
        error: 'habitIds array is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    const today = getToday();
    const storageKey = getStorageKey(userId, today);

    // Load current habits
    let habits: HabitData[];
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        habits = JSON.parse(stored);
      } else {
        return NextResponse.json({ success: false, error: 'No habits found' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
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
    
    await redis.set(storageKey, JSON.stringify(updatedHabits));
    await saveHabitsList(redis, userId, updatedHabits);

    const completedToday = updatedHabits.filter(h => h.completedToday).length;
    const totalCompletions = updatedHabits.reduce((acc, h) =>
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const totalGoal = updatedHabits.reduce((acc, h) => acc + weeklyGoal(h.frequency), 0);
    return NextResponse.json({
      success: true,
      data: {
        habits: updatedHabits,
        stats: {
          totalHabits: updatedHabits.length,
          completedToday,
          longestStreak: Math.max(...updatedHabits.map(h => h.streak), 0),
          weeklyCompletion: totalGoal > 0 ? Math.round((totalCompletions / totalGoal) * 100) : 0,
        }
      }
    });
  } catch (error) {
    console.error('Habit reorder error:', error);
    return NextResponse.json({ success: false, error: 'Failed to reorder habits' }, { status: 500 });
  }
}
