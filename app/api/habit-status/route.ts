import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getTodayInEST, getESTDateFromTimestamp } from '@/lib/date-utils';

const STORAGE_KEY_PREFIX = 'habits_data';

// MJ's default habits
const DEFAULT_HABITS = [
  { id: 'make-bed', name: 'Make Bed', icon: '🛏️', target: 'Daily', category: 'productivity' },
  { id: 'take-meds', name: 'Take Meds (Morning)', icon: '💊', target: 'Daily', category: 'health' },
  { id: 'market-brief', name: 'Read Market Brief, Stock Screeners', icon: '📈', target: 'Weekdays', category: 'trading' },
  { id: 'exercise', name: 'Exercise / Lift', icon: '💪', target: '4x/week', category: 'fitness' },
  { id: 'read', name: 'Read', icon: '📚', target: '30 min', category: 'learning' },
  { id: 'drink-water', name: 'Drink Water', icon: '💧', target: '2L daily', category: 'health' },
  { id: 'journal', name: 'Journal', icon: '📝', target: 'Daily', category: 'mindfulness' },
  { id: 'trade-journal', name: 'Trade Journal', icon: '📊', target: 'Trading days', category: 'trading' }
];

interface HabitData {
  id: string;
  name: string;
  icon: string;
  target: string;
  category: string;
  completedToday: boolean;
  streak: number;
  history: boolean[]; // Last 7 days (oldest to newest)
  order: number;
}

function getStorageKey(date: string) {
  return `${STORAGE_KEY_PREFIX}:${date}`;
}

function getPreviousDate(dateStr: string, daysBack: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - daysBack);
  
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
  const prevDay = String(date.getDate()).padStart(2, '0');
  return `${prevYear}-${prevMonth}-${prevDay}`;
}

/**
 * Calculate streak by counting consecutive completions from today backwards
 * through the history array.
 * 
 * History is [oldest, ..., yesterday] (7 days)
 * completedToday is for today
 */
function calculateStreak(completedToday: boolean, history: boolean[]): number {
  let streak = 0;
  
  // Count today if completed
  if (completedToday) {
    streak = 1;
  }
  
  // Walk backwards through history (newest to oldest)
  // history[6] = yesterday, history[5] = day before, etc.
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]) {
      streak++;
    } else {
      break; // Streak broken
    }
  }
  
  return streak;
}

/**
 * Shift history for a new day:
 * - Drop oldest day
 * - Add yesterday's completion as newest
 * - Reset completedToday to false
 * - Recalculate streak
 */
function shiftHistoryForNewDay(previousHabit: HabitData): HabitData {
  const yesterdayCompleted = previousHabit.completedToday;
  const newHistory = [...previousHabit.history.slice(1), yesterdayCompleted];
  
  return {
    ...previousHabit,
    completedToday: false,
    history: newHistory,
    streak: calculateStreak(false, newHistory)
  };
}

/**
 * Initialize habits for a new day
 */
function initializeHabitsForNewDay(previousData: HabitData[] | null, today: string): HabitData[] {
  if (!previousData) {
    // First time - create fresh habits with empty history
    return DEFAULT_HABITS.map((h, index) => ({
      ...h,
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false],
      order: index
    }));
  }

  // Shift history for each habit
  return previousData.map(h => shiftHistoryForNewDay(h));
}

/**
 * GET /api/habit-status
 * 
 * Returns today's habits with stats.
 * If no data for today, initializes from yesterday's data.
 */
export async function GET() {
  try {
    const today = getTodayInEST();
    const storageKey = getStorageKey(today);
    
    const redis = await getRedisClient();
    
    let habits: HabitData[];
    
    if (redis) {
      // Try to load today's data
      const stored = await redis.get(storageKey);
      
      if (stored) {
        // Today's data exists - parse and ensure streaks are correct
        habits = JSON.parse(stored);
        // Recalculate streaks in case of any corruption
        habits = habits.map(h => ({
          ...h,
          streak: calculateStreak(h.completedToday, h.history)
        }));
      } else {
        // No data for today - check yesterday to initialize
        const yesterday = getPreviousDate(today, 1);
        const yesterdayKey = getStorageKey(yesterday);
        const yesterdayData = await redis.get(yesterdayKey);
        
        habits = initializeHabitsForNewDay(
          yesterdayData ? JSON.parse(yesterdayData) : null,
          today
        );
        
        // Save initialized habits for today
        await redis.set(storageKey, JSON.stringify(habits));
      }
    } else {
      // Fallback without Redis
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

    // Calculate stats
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalHabits = habits.length;
    const longestStreak = Math.max(...habits.map(h => h.streak), 0);

    // Weekly completion: sum of all history completions + today / (habits * 7 days)
    const totalCompletions = habits.reduce((acc, h) =>
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const weeklyCompletion = totalHabits > 0 
      ? Math.round((totalCompletions / (totalHabits * 7)) * 100)
      : 0;

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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Habit status error:', error);
    
    // Return defaults on error
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
      }
    });
  }
}

/**
 * POST /api/habit-status
 * 
 * Toggle habit completion for today
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { habitId, completed } = body;
    
    if (!habitId || typeof completed !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'habitId and completed are required' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    const today = getTodayInEST();
    const storageKey = getStorageKey(today);
    
    // Load current habits
    let habits: HabitData[];
    const stored = await redis.get(storageKey);
    
    if (stored) {
      habits = JSON.parse(stored);
    } else {
      // Initialize from yesterday if needed
      const yesterday = getPreviousDate(today, 1);
      const yesterdayData = await redis.get(getStorageKey(yesterday));
      habits = initializeHabitsForNewDay(
        yesterdayData ? JSON.parse(yesterdayData) : null,
        today
      );
    }
    
    // Update the habit
    const habitIndex = habits.findIndex(h => h.id === habitId);
    if (habitIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Habit not found' },
        { status: 404 }
      );
    }
    
    habits[habitIndex].completedToday = completed;
    habits[habitIndex].streak = calculateStreak(completed, habits[habitIndex].history);
    
    // Save back to Redis
    await redis.set(storageKey, JSON.stringify(habits));
    
    // Recalculate stats
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalCompletions = habits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    
    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats: {
          totalHabits: habits.length,
          completedToday,
          longestStreak: Math.max(...habits.map(h => h.streak)),
          weeklyCompletion: Math.round((totalCompletions / (habits.length * 7)) * 100)
        }
      }
    });
  } catch (error) {
    console.error('Habit update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update habit' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/habit-status
 * 
 * Add a new habit
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { name, icon, target, category } = body;
    
    if (!name || !icon || !target) {
      return NextResponse.json({
        success: false,
        error: 'name, icon, and target are required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    const today = getTodayInEST();
    const storageKey = getStorageKey(today);
    
    // Load current habits
    let habits: HabitData[];
    const stored = await redis.get(storageKey);
    
    if (stored) {
      habits = JSON.parse(stored);
    } else {
      // Initialize from yesterday if needed
      const yesterday = getPreviousDate(today, 1);
      const yesterdayData = await redis.get(getStorageKey(yesterday));
      habits = initializeHabitsForNewDay(
        yesterdayData ? JSON.parse(yesterdayData) : null,
        today
      );
    }
    
    // Create new habit
    const maxOrder = habits.length > 0 ? Math.max(...habits.map(h => h.order ?? 0)) : -1;
    const newHabit: HabitData = {
      id: `habit_${Date.now()}`,
      name: name.trim(),
      icon,
      target: target.trim(),
      category: category || 'other',
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false],
      order: maxOrder + 1
    };
    
    habits.push(newHabit);
    
    // Save back to Redis
    await redis.set(storageKey, JSON.stringify(habits));
    
    // Recalculate stats
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalCompletions = habits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    
    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats: {
          totalHabits: habits.length,
          completedToday,
          longestStreak: Math.max(...habits.map(h => h.streak), 0),
          weeklyCompletion: Math.round((totalCompletions / (habits.length * 7)) * 100)
        }
      }
    });
  } catch (error) {
    console.error('Habit create error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create habit' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/habit-status?habitId=xxx
 * 
 * Delete a habit
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const habitId = searchParams.get('habitId');
    
    if (!habitId) {
      return NextResponse.json(
        { success: false, error: 'habitId is required' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    const today = getTodayInEST();
    const storageKey = getStorageKey(today);
    
    // Load current habits
    const stored = await redis.get(storageKey);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'No habits found' },
        { status: 404 }
      );
    }
    
    let habits: HabitData[] = JSON.parse(stored);
    
    // Remove the habit
    const filteredHabits = habits.filter(h => h.id !== habitId);
    
    if (filteredHabits.length === habits.length) {
      return NextResponse.json(
        { success: false, error: 'Habit not found' },
        { status: 404 }
      );
    }
    
    // Reorder remaining habits
    const reorderedHabits = filteredHabits
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((h, index) => ({ ...h, order: index }));
    
    // Save back to Redis
    await redis.set(storageKey, JSON.stringify(reorderedHabits));
    
    // Recalculate stats
    const completedToday = reorderedHabits.filter(h => h.completedToday).length;
    const totalCompletions = reorderedHabits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    
    return NextResponse.json({
      success: true,
      data: {
        habits: reorderedHabits,
        stats: {
          totalHabits: reorderedHabits.length,
          completedToday,
          longestStreak: Math.max(...reorderedHabits.map(h => h.streak), 0),
          weeklyCompletion: reorderedHabits.length > 0 
            ? Math.round((totalCompletions / (reorderedHabits.length * 7)) * 100)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Habit delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete habit' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/habit-status
 * 
 * Reorder habits
 */
export async function PATCH(request: Request) {
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
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    const today = getTodayInEST();
    const storageKey = getStorageKey(today);
    
    // Load current habits
    const stored = await redis.get(storageKey);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'No habits found' },
        { status: 404 }
      );
    }
    
    let habits: HabitData[] = JSON.parse(stored);
    
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
    
    // Save back to Redis
    await redis.set(storageKey, JSON.stringify(updatedHabits));
    
    // Recalculate stats
    const completedToday = updatedHabits.filter(h => h.completedToday).length;
    const totalCompletions = updatedHabits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    
    return NextResponse.json({
      success: true,
      data: {
        habits: updatedHabits,
        stats: {
          totalHabits: updatedHabits.length,
          completedToday,
          longestStreak: Math.max(...updatedHabits.map(h => h.streak), 0),
          weeklyCompletion: Math.round((totalCompletions / (updatedHabits.length * 7)) * 100)
        }
      }
    });
  } catch (error) {
    console.error('Habit reorder error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reorder habits' },
      { status: 500 }
    );
  }
}
