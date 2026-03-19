/**
 * Habits Database Layer
 */

import { getRedisClient } from '@/lib/redis';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: 'daily' | 'weekly';
  targetDays: number[]; // 0-6 for Sunday-Saturday
  archived: boolean;
  createdAt: string;
}

export interface HabitRecord {
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  recordedAt: string;
}

const HABITS_KEY = 'habits:data';
const HABIT_RECORDS_KEY_PREFIX = 'habit_records:';

export async function getAllHabits(userId: string = 'default'): Promise<Habit[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${HABITS_KEY}:${userId}`);
    return data ? JSON.parse(data) : getDefaultHabits();
  } catch (error) {
    console.error('Error fetching habits:', error);
    return getDefaultHabits();
  }
}

export async function getHabitRecords(
  habitId: string,
  startDate: string,
  endDate: string,
  userId: string = 'default'
): Promise<HabitRecord[]> {
  try {
    const redis = await getRedisClient();
    const key = `${HABIT_RECORDS_KEY_PREFIX}${userId}:${habitId}`;
    const records = await redis.lRange(key, 0, -1);
    
    return records
      .map(r => JSON.parse(r))
      .filter((r: HabitRecord) => r.date >= startDate && r.date <= endDate);
  } catch (error) {
    console.error('Error fetching habit records:', error);
    return [];
  }
}

export async function getAllHabitRecords(
  startDate: string,
  endDate: string,
  userId: string = 'default'
): Promise<Record<string, HabitRecord[]>> {
  const habits = await getAllHabits(userId);
  const result: Record<string, HabitRecord[]> = {};
  
  await Promise.all(
    habits.map(async (habit) => {
      result[habit.id] = await getHabitRecords(habit.id, startDate, endDate, userId);
    })
  );
  
  return result;
}

export async function recordHabit(
  habitId: string,
  date: string,
  completed: boolean,
  userId: string = 'default'
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const key = `${HABIT_RECORDS_KEY_PREFIX}${userId}:${habitId}`;
    
    const record: HabitRecord = {
      habitId,
      date,
      completed,
      recordedAt: new Date().toISOString()
    };
    
    // Remove existing record for this date
    const existing = await redis.lRange(key, 0, -1);
    const filtered = existing.filter(r => {
      const parsed = JSON.parse(r);
      return parsed.date !== date;
    });
    
    // Add new record
    filtered.push(JSON.stringify(record));
    
    // Save back
    await redis.del(key);
    if (filtered.length > 0) {
      await redis.rPush(key, ...filtered);
    }
  } catch (error) {
    console.error('Error recording habit:', error);
    throw error;
  }
}

function getDefaultHabits(): Habit[] {
  return [
    {
      id: 'meditate',
      name: 'Meditate',
      emoji: '🧘',
      color: '#8b5cf6',
      frequency: 'daily',
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'exercise',
      name: 'Exercise',
      emoji: '💪',
      color: '#22c55e',
      frequency: 'daily',
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'read',
      name: 'Read',
      emoji: '📚',
      color: '#3b82f6',
      frequency: 'daily',
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'journal',
      name: 'Journal',
      emoji: '📝',
      color: '#f97316',
      frequency: 'daily',
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'no_alcohol',
      name: 'No Alcohol',
      emoji: '🚫',
      color: '#ef4444',
      frequency: 'daily',
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      archived: false,
      createdAt: new Date().toISOString()
    }
  ];
}
