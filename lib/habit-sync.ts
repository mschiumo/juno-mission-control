import { getRedisClient } from '@/lib/redis';

// Shared helpers for marking habits complete from other surfaces (Strava
// sync, Workout Split). Habit ids aren't stable slugs (the list was seeded
// once and users add their own), so matching is by id OR name.

export interface HabitData {
  id: string;
  name: string;
  icon: string;
  completedToday: boolean;
  streak: number;
  history: boolean[];
  [key: string]: unknown;
}

function habitsKey(userId: string, date: string) {
  return `habits_data:${userId}:${date}`;
}

export function isRunHabit(h: HabitData): boolean {
  return h.id === 'run' || h.id === 'ran' || /\brun/i.test(h.name);
}

export function isExerciseHabit(h: HabitData): boolean {
  return h.id === 'exercise' || /exercise|work\s?out|lift|gym|train/i.test(h.name);
}

export function streakWith(completed: boolean, history: boolean[]): number {
  let streak = completed ? 1 : 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]) streak++;
    else break;
  }
  return streak;
}

/**
 * Mark all not-yet-completed habits matching `match` as complete for `date`.
 * Returns the habits that were actually flipped (empty when none matched or
 * no habit data exists for the day).
 */
export async function completeMatchingHabits(
  userId: string,
  date: string,
  match: (h: HabitData) => boolean
): Promise<{ id: string; name: string; icon: string }[]> {
  const redis = await getRedisClient();
  const stored = await redis.get(habitsKey(userId, date));
  if (!stored) return [];

  const habits: HabitData[] = JSON.parse(stored);
  const flipped: { id: string; name: string; icon: string }[] = [];
  for (const h of habits) {
    if (h.completedToday || !match(h)) continue;
    h.completedToday = true;
    h.streak = streakWith(true, h.history);
    flipped.push({ id: h.id, name: h.name, icon: h.icon });
  }
  if (flipped.length > 0) {
    await redis.set(habitsKey(userId, date), JSON.stringify(habits));
  }
  return flipped;
}

/**
 * Un-complete the given habit ids for `date` (used to revert an auto-complete
 * when its source action is undone). Only flips habits that are currently
 * completed; returns the ids actually flipped.
 */
export async function uncompleteHabits(userId: string, date: string, habitIds: string[]): Promise<string[]> {
  if (habitIds.length === 0) return [];
  const redis = await getRedisClient();
  const stored = await redis.get(habitsKey(userId, date));
  if (!stored) return [];

  const habits: HabitData[] = JSON.parse(stored);
  const ids = new Set(habitIds);
  const flipped: string[] = [];
  for (const h of habits) {
    if (!ids.has(h.id) || !h.completedToday) continue;
    h.completedToday = false;
    h.streak = streakWith(false, h.history);
    flipped.push(h.id);
  }
  if (flipped.length > 0) {
    await redis.set(habitsKey(userId, date), JSON.stringify(habits));
  }
  return flipped;
}
