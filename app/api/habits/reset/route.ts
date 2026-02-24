import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getUserId, getHabitsKey, getHabitsPattern } from '@/lib/db/user-data';
import { getRedisClient } from '@/lib/redis';

// MJ's default habits (for reference/ordering)
const DEFAULT_HABIT_IDS = new Set([
  'make-bed',
  'take-meds', 
  'market-brief',
  'exercise',
  'read',
  'drink-water',
  'journal',
  'trade-journal'
]);

function getToday() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-');
}

interface HabitData {
  id: string;
  name: string;
  icon: string;
  target: string;
  category: string;
  completedToday: boolean;
  streak: number;
  history: boolean[];
  order: number;
}

/**
 * POST /api/habits/reset
 * 
 * Wipes all habit history but PRESERVES custom habits
 */
export async function POST() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    // Collect ALL unique habits from historical data for this user
    const habitPattern = getHabitsPattern(userId);
    const habitKeys = await redis.keys(habitPattern);
    const allHabitsMap = new Map<string, HabitData>();
    
    for (const key of habitKeys) {
      const data = await redis.get(key);
      if (data) {
        const habits: HabitData[] = JSON.parse(data);
        for (const habit of habits) {
          // Keep the habit definition, we'll reset history later
          if (!allHabitsMap.has(habit.id)) {
            allHabitsMap.set(habit.id, habit);
          }
        }
      }
    }
    
    // Sort: default habits first (in their original order), then custom habits
    const allHabits = Array.from(allHabitsMap.values()).sort((a, b) => {
      const aIsDefault = DEFAULT_HABIT_IDS.has(a.id);
      const bIsDefault = DEFAULT_HABIT_IDS.has(b.id);
      
      if (aIsDefault && bIsDefault) {
        return (a.order ?? 0) - (b.order ?? 0);
      }
      if (aIsDefault) return -1;
      if (bIsDefault) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    
    // Delete all historical habit data for this user
    if (habitKeys.length > 0) {
      await redis.del(habitKeys);
    }
    
    // Also delete evening check-in data for this user
    const checkinKeys = await redis.keys(`evening_checkin:${userId}*`);
    if (checkinKeys.length > 0) {
      await redis.del(checkinKeys);
    }
    await redis.del(`evening_checkin:${userId}`);
    
    // Create fresh habits for today - PRESERVE custom ones, reset history only
    const today = getToday();
    const freshHabits = allHabits.map((h, index) => ({
      ...h,
      completedToday: false,
      streak: 0,
      history: [false, false, false, false, false, false, false],
      order: index // Reorder to fill any gaps
    }));
    
    await redis.set(getHabitsKey(userId, today), JSON.stringify(freshHabits));
    
    const customHabitsCount = freshHabits.length - DEFAULT_HABIT_IDS.size;
    
    return NextResponse.json({
      success: true,
      message: 'Habit history wiped successfully (custom habits preserved)',
      deletedKeys: habitKeys.length + checkinKeys.length,
      totalHabits: freshHabits.length,
      defaultHabits: DEFAULT_HABIT_IDS.size,
      customHabits: customHabitsCount > 0 ? customHabitsCount : 0,
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