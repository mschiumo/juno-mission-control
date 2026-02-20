import { NextResponse } from 'next/server';
import { createClient } from 'redis';

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

function getToday() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-');
}

/**
 * POST /api/habits/reset
 * 
 * Wipes all habit history and starts fresh
 */
export async function POST() {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    // Find all habit data keys
    const habitKeys = await redis.keys('habits_data:*');
    
    // Delete all historical habit data
    if (habitKeys.length > 0) {
      await redis.del(habitKeys);
    }
    
    // Also delete evening check-in data (both formats)
    const checkinKeys = await redis.keys('evening_checkin:*');
    if (checkinKeys.length > 0) {
      await redis.del(checkinKeys);
    }
    
    // Delete the main evening_checkins key (plural)
    await redis.del('evening_checkins');
    
    // Create fresh habits for today
    const today = getToday();
    const freshHabits = DEFAULT_HABITS.map((h, index) => ({
      ...h,
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false],
      order: index
    }));
    
    await redis.set(`habits_data:${today}`, JSON.stringify(freshHabits));
    
    return NextResponse.json({
      success: true,
      message: 'Habit history wiped successfully',
      deletedKeys: habitKeys.length + checkinKeys.length,
      freshStart: today
    });
    
  } catch (error) {
    console.error('Habit reset error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset habits' },
      { status: 500 }
    );
  }
}
