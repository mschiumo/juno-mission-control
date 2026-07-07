import { getRedisClient } from '@/lib/redis';
import { hasJournalContentRaw } from '@/lib/journal-content';
import type { TradingGoal } from '@/types/trading-goals';

function goalsKey(userId: string) {
  return `trading-goals:${userId}`;
}

export async function getAllGoals(userId: string): Promise<TradingGoal[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(goalsKey(userId));
    if (!data) return [];
    const parsed = JSON.parse(data);
    return parsed.goals || [];
  } catch (error) {
    console.error('Error getting trading goals from Redis:', error);
    return [];
  }
}

export async function getGoalById(id: string, userId: string): Promise<TradingGoal | null> {
  const goals = await getAllGoals(userId);
  return goals.find((g) => g.id === id) || null;
}

export async function saveGoal(goal: TradingGoal, userId: string): Promise<TradingGoal> {
  const redis = await getRedisClient();
  const existing = await getAllGoals(userId);
  const index = existing.findIndex((g) => g.id === goal.id);
  if (index >= 0) {
    existing[index] = { ...goal, updatedAt: new Date().toISOString() };
  } else {
    existing.push(goal);
  }
  await redis.set(goalsKey(userId), JSON.stringify({ goals: existing }));
  return goal;
}

export async function updateGoal(
  id: string,
  updates: Partial<TradingGoal>,
  userId: string,
): Promise<TradingGoal | null> {
  const redis = await getRedisClient();
  const existing = await getAllGoals(userId);
  const index = existing.findIndex((g) => g.id === id);
  if (index === -1) return null;
  // Never let an update rewrite identity fields.
  existing[index] = {
    ...existing[index],
    ...updates,
    id,
    userId,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(goalsKey(userId), JSON.stringify({ goals: existing }));
  return existing[index];
}

export async function deleteGoal(id: string, userId: string): Promise<boolean> {
  const redis = await getRedisClient();
  const existing = await getAllGoals(userId);
  const filtered = existing.filter((g) => g.id !== id);
  if (filtered.length === existing.length) return false;
  await redis.set(goalsKey(userId), JSON.stringify({ goals: filtered }));
  return true;
}

/**
 * The set of YYYY-MM-DD dates that have a daily journal entry with actual
 * text, used by the journal_consistency goal metric. Content-less entries
 * (e.g. stubs left behind by older statement imports) don't count.
 */
export async function getJournaledDates(userId: string): Promise<Set<string>> {
  try {
    const redis = await getRedisClient();
    const keys = await redis.keys(`daily-journal:${userId}:*`);
    const prefix = `daily-journal:${userId}:`;
    const dates: string[] = [];
    for (const key of keys) {
      const date = key.slice(prefix.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const promptsJson = await redis.hGet(key, 'prompts');
      if (hasJournalContentRaw(promptsJson ?? undefined)) dates.push(date);
    }
    return new Set(dates);
  } catch (error) {
    console.error('Error reading journaled dates from Redis:', error);
    return new Set();
  }
}
