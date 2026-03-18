import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY_PREFIX = 'habits_data';

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

// Default habits
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || '2026-02-20';
    
    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Redis not available' }, { status: 503 });
    }
    
    // Seed with 100% completion
    const habitsData = DEFAULT_HABITS.map((h, index) => ({
      ...h,
      completedToday: true,
      streak: 1,
      history: [false, false, false, false, false, false, true],
      order: index
    }));
    
    const storageKey = `${STORAGE_KEY_PREFIX}:${date}`;
    await redis.set(storageKey, JSON.stringify(habitsData));
    
    // Also check for custom habits in wrong date format
    const wrongDate = date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$3-$2');
    const wrongKey = `${STORAGE_KEY_PREFIX}:${wrongDate}`;
    const wrongData = await redis.get(wrongKey);
    
    let recoveredHabits: string[] = [];
    if (wrongData) {
      const wrongHabits = JSON.parse(wrongData);
      const customHabits = wrongHabits.filter((h: {id: string}) => 
        !DEFAULT_HABITS.map(dh => dh.id).includes(h.id)
      );
      if (customHabits.length > 0) {
        habitsData.push(...customHabits);
        await redis.set(storageKey, JSON.stringify(habitsData));
        recoveredHabits = customHabits.map((h: {name: string}) => h.name);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Seeded ${date} with 100% completion`,
      recovered: recoveredHabits,
      habitCount: habitsData.length
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ success: false, error: 'Failed to seed' }, { status: 500 });
  }
}
