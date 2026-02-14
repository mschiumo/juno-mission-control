import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY = 'habits_data';

// MJ's specific habits
const DEFAULT_HABITS = [
  {
    id: 'make-bed',
    name: 'Make Bed',
    icon: '🛏️',
    streak: 0,
    completedToday: false,
    target: 'Daily',
    category: 'productivity',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'take-meds',
    name: 'Take Meds (Morning)',
    icon: '💊',
    streak: 0,
    completedToday: false,
    target: 'Daily',
    category: 'health',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'market-brief',
    name: 'Read Market Brief, Stock Screeners',
    icon: '📈',
    streak: 0,
    completedToday: false,
    target: 'Weekdays',
    category: 'trading',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'exercise',
    name: 'Exercise / Lift',
    icon: '💪',
    streak: 0,
    completedToday: false,
    target: '4x/week',
    category: 'fitness',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'read',
    name: 'Read',
    icon: '📚',
    streak: 0,
    completedToday: false,
    target: '30 min',
    category: 'learning',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'drink-water',
    name: 'Drink Water',
    icon: '💧',
    streak: 0,
    completedToday: false,
    target: '2L daily',
    category: 'health',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'journal',
    name: 'Journal',
    icon: '📝',
    streak: 0,
    completedToday: false,
    target: 'Daily',
    category: 'mindfulness',
    history: [false, false, false, false, false, false, false]
  },
  {
    id: 'trade-journal',
    name: 'Trade Journal',
    icon: '📊',
    streak: 0,
    completedToday: false,
    target: 'Trading days',
    category: 'trading',
    history: [false, false, false, false, false, false, false]
  }
];

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.REDIS_URL || undefined
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

export async function GET() {
  try {
    const redis = await getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    
    let habits = [...DEFAULT_HABITS];
    
    // Try to load from Redis
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if we need to reset for new day
        if (parsed.date === today) {
          habits = parsed.habits;
        }
      }
    }
    
    // Calculate dynamic stats based on actual completion
    const completedToday = habits.filter(h => h.completedToday).length;
    const totalHabits = habits.length;
    const longestStreak = Math.max(...habits.map(h => h.streak), 0);
    
    // Calculate weekly completion percentage
    const totalPossibleCompletions = totalHabits * 7;
    const actualCompletions = habits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length, 0
    );
    const weeklyCompletion = totalPossibleCompletions > 0 
      ? Math.round((actualCompletions / totalPossibleCompletions) * 100)
      : 0;

    const stats = {
      totalHabits,
      completedToday,
      longestStreak,
      weeklyCompletion
    };

    return NextResponse.json({ 
      success: true, 
      data: {
        habits,
        stats,
        date: today
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Habit status error:', error);
    
    // Fallback to default habits
    const habits = [...DEFAULT_HABITS];
    const stats = {
      totalHabits: habits.length,
      completedToday: 0,
      longestStreak: 0,
      weeklyCompletion: 0
    };
    
    return NextResponse.json({ 
      success: true, 
      data: {
        habits,
        stats,
        date: new Date().toISOString().split('T')[0]
      },
      timestamp: new Date().toISOString()
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { habitId, completed } = body;
    
    if (!habitId) {
      return NextResponse.json({
        success: false,
        error: 'habitId is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    
    // Get current habits
    let habits = [...DEFAULT_HABITS];
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) {
          habits = parsed.habits;
        }
      }
    }
    
    // Update the habit
    const habitIndex = habits.findIndex(h => h.id === habitId);
    if (habitIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Habit not found'
      }, { status: 404 });
    }
    
    const habit = habits[habitIndex];
    habit.completedToday = completed;
    
    // Update history (today is the last element)
    if (completed) {
      habit.history[6] = true;
      habit.streak += 1;
    } else {
      habit.history[6] = false;
      // Don't decrement streak on uncheck, just don't increment
    }
    
    // Save back to Redis
    if (redis) {
      await redis.set(STORAGE_KEY, JSON.stringify({
        habits,
        date: today,
        updatedAt: new Date().toISOString()
      }));
    }
    
    // Recalculate stats
    const completedToday = habits.filter(h => h.completedToday).length;
    const stats = {
      totalHabits: habits.length,
      completedToday,
      longestStreak: Math.max(...habits.map(h => h.streak)),
      weeklyCompletion: Math.round(
        habits.reduce((acc, h) => acc + h.history.filter(Boolean).length, 0) / 
        (habits.length * 7) * 100
      )
    };

    return NextResponse.json({
      success: true,
      data: {
        habits,
        stats,
        date: today
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Habit update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update habit'
    }, { status: 500 });
  }
}
