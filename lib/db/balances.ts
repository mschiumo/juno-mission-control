import { getRedisClient } from '@/lib/redis';
import { DailyBalance } from '@/lib/parsers/tos-parser';

function balancesKey(userId: string) {
  return `user:daily-balances:${userId}`;
}

export async function getDailyBalances(userId: string): Promise<DailyBalance[]> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(balancesKey(userId));
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error getting daily balances:', error);
    return [];
  }
}

/**
 * Merge new daily balances into the stored set. For any date present in
 * `incoming`, the new value overrides the stored one — uploads always reflect
 * the latest broker truth for the dates they cover. Untouched dates are
 * preserved so daily uploads accumulate history naturally.
 */
export async function saveDailyBalances(incoming: DailyBalance[], userId: string): Promise<number> {
  if (incoming.length === 0) return 0;
  try {
    const redis = await getRedisClient();
    const existing = await getDailyBalances(userId);

    const merged = new Map<string, number>();
    existing.forEach(b => merged.set(b.date, b.balance));
    incoming.forEach(b => merged.set(b.date, b.balance));

    const result: DailyBalance[] = [...merged.entries()]
      .map(([date, balance]) => ({ date, balance }))
      .sort((a, b) => a.date.localeCompare(b.date));

    await redis.set(balancesKey(userId), JSON.stringify(result));
    return result.length;
  } catch (error) {
    console.error('Error saving daily balances:', error);
    throw error;
  }
}

export async function clearDailyBalances(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(balancesKey(userId));
  } catch (error) {
    console.error('Error clearing daily balances:', error);
  }
}
