import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const HABITS_KEY_PREFIX = 'habits_data';
const EVENING_CHECKINS_KEY = 'evening_checkins';

// Map habit IDs to evening check-in question IDs
const HABIT_TO_QUESTION_MAP: Record<string, string> = {
  'exercise': 'worked-out',
  'market-brief': 'traded',
  'read': 'read',
  'journal': 'journaled',
  'trade-journal': 'traded',
  'make-bed': 'made-bed',
  'take-meds': 'took-meds',
};

// All 11 habits with 02/19 completion
const HABITS_2026_02_19 = [
  { id: 'make-bed', name: 'Make Bed', icon: '🛏️', target: 'Daily', category: 'productivity', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 0 },
  { id: 'take-meds', name: 'Take Meds (Morning)', icon: '💊', target: 'Daily', category: 'health', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 1 },
  { id: 'market-brief', name: 'Read Market Brief, Stock Screeners', icon: '📈', target: 'Weekdays', category: 'trading', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 2 },
  { id: 'exercise', name: 'Exercise / Lift', icon: '💪', target: '4x/week', category: 'fitness', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 3 },
  { id: 'read', name: 'Read', icon: '📚', target: '30 min', category: 'learning', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 4 },
  { id: 'drink-water', name: 'Drink Water', icon: '💧', target: '2L daily', category: 'health', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 5 },
  { id: 'journal', name: 'Journal', icon: '📝', target: 'Daily', category: 'mindfulness', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 6 },
  { id: 'trade-journal', name: 'Trade Journal', icon: '📊', target: 'Trading days', category: 'trading', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 7 },
  { id: 'habit_1771564720153', name: 'Daily Poem', icon: '❤️', target: 'Daily', category: 'mindfulness', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 8 },
  { id: 'habit_1771564727210', name: 'Take Night Meds', icon: '🌙', target: 'Daily', category: 'health', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 9 },
  { id: 'habit_1771564727413', name: 'Meditate', icon: '🧘', target: 'Daily', category: 'mindfulness', completedToday: true, streak: 1, history: [false,false,false,false,false,false,true], order: 10 }
];

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

/**
 * POST /api/habits/seed-0219
 * 
 * Creates 02/19 habit data with 100% completion
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
    
    const date = '2026-02-19';
    
    // Save 02/19 habit data with 100% completion
    await redis.set(`${HABITS_KEY_PREFIX}:${date}`, JSON.stringify(HABITS_2026_02_19));
    
    // Create evening check-in for 02/19 with 100% completion
    const responses: Record<string, boolean> = {
      'worked-out': true,
      'ran': true,
      'read': true,
      'journaled': true,
      'traded': true,
      'made-bed': true,
      'took-meds': true
    };
    
    const stored = await redis.get(EVENING_CHECKINS_KEY);
    const allCheckins = stored ? JSON.parse(stored) : [];
    
    // Check if 02/19 already exists
    const existingIndex = allCheckins.findIndex((c: { date: string }) => c.date === date);
    
    const checkin = {
      date,
      timestamp: '2026-02-19T23:59:00.000Z',
      responses,
      notes: 'Perfect day! 💯',
      completionRate: 100,
      manuallyCreated: true
    };
    
    if (existingIndex >= 0) {
      allCheckins[existingIndex] = checkin;
    } else {
      allCheckins.push(checkin);
    }
    
    // Keep only last 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const trimmedCheckins = allCheckins.filter((c: { date: string }) => {
      return new Date(c.date) >= cutoffDate;
    });
    
    await redis.set(EVENING_CHECKINS_KEY, JSON.stringify(trimmedCheckins));
    
    return NextResponse.json({
      success: true,
      message: '02/19 habit report created with 100% completion',
      date,
      habitsCompleted: HABITS_2026_02_19.length,
      eveningCheckinRate: 100,
      note: 'All 11 habits completed + 7/7 evening check-in questions'
    });
    
  } catch (error) {
    console.error('Seed 02/19 error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create 02/19 report' },
      { status: 500 }
    );
  }
}
