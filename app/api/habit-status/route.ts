import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY_PREFIX = 'habits_data';

// MJ's specific habits with rolling history
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

function getStorageKey(date: string) {
  return `${STORAGE_KEY_PREFIX}:${date}`;
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getPreviousDate(dateStr: string, daysBack: number) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().split('T')[0];
}

interface HabitData {
  id: string;
  name: string;
  icon: string;
  target: string;
  category: string;
  completedToday: boolean;
  streak: number;
  history: boolean[]; // Last 7 days (oldest to newest)
}

// Initialize or shift history for a new day
function initializeHabits(previousData: HabitData[] | null): HabitData[] {
  if (!previousData) {
    // First time - create fresh habits
    return DEFAULT_HABITS.map(h => ({
      ...h,
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false]
    }));
  }
  
  // Shift history: drop oldest, add yesterday's completion as newest
  return previousData.map(h => {
    const yesterdayCompleted = h.completedToday;
    const newHistory = [...h.history.slice(1), yesterdayCompleted];
    
    // Calculate streak
    let streak = h.streak;
    if (yesterdayCompleted) {
      streak += 1;
    } else {
      streak = 0; // Reset streak if missed yesterday
    }
    
    return {
      ...h,
      completedToday: false, // Reset for new day
      streak,
      history: newHistory
    };
  });
}

export async function GET() {
  try {
    const redis = await getRedisClient();
    const today = getToday();
    const storageKey = getStorageKey(today);
    
    let habits: HabitData[];
    
    if (redis) {
      // Try to load today's data
      const stored = await redis.get(storageKey);
      
      if (stored) {
        // Today's data exists
        habits = JSON.parse(stored);
      } else {
        // No data for today - check yesterday to initialize
        const yesterday = getPreviousDate(today, 1);
        const yesterdayKey = getStorageKey(yesterday);
        const yesterdayData = await redis.get(yesterdayKey);
        
        habits = initializeHabits(yesterdayData ? JSON.parse(yesterdayData) : null);
        
        // Save initialized habits for today
        await redis.set(storageKey, JSON.stringify(habits));
      }
    } else {
      // No Redis - use defaults
      habits = DEFAULT_HABITS.map(h => ({
        ...h,
        completedToday: false,
        streak: 0,
        history: [false, false, false, false, false, false, false]
      }));
    }
    
    // Calculate stats from history
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalHabits = habits.length;
    const longestStreak = Math.max(...habits.map(h => h.streak), 0);
    
    // Weekly completion: sum of all history completions / (habits * 7 days)
    const totalCompletions = habits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const weeklyCompletion = Math.round((totalCompletions / (totalHabits * 7)) * 100);

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
    
    // Fallback
    const habits = DEFAULT_HABITS.map(h => ({
      ...h,
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false]
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { habitId, completed } = body;
    
    if (!habitId) {
      return NextResponse.json({ success: false, error: 'habitId is required' }, { status: 400 });
    }

    const redis = await getRedisClient();
    const today = getToday();
    const storageKey = getStorageKey(today);
    
    // Load current habits
    let habits: HabitData[];
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        habits = JSON.parse(stored);
      } else {
        // Initialize from yesterday if needed
        const yesterday = getPreviousDate(today, 1);
        const yesterdayData = await redis.get(getStorageKey(yesterday));
        habits = initializeHabits(yesterdayData ? JSON.parse(yesterdayData) : null);
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
    return NextResponse.json({ success: false, error: 'Failed to update habit' }, { status: 500 });
  }
}
