import { getRedisClient } from '@/lib/redis';
import { DailyFee } from '@/lib/parsers/tos-parser';

function feesKey(userId: string) {
  return `user:fees:${userId}`;
}

export async function getDailyFees(userId: string): Promise<DailyFee[]> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(feesKey(userId));
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error getting daily fees:', error);
    return [];
  }
}

export async function saveDailyFees(incoming: DailyFee[], userId: string): Promise<number> {
  if (incoming.length === 0) return 0;
  try {
    const redis = await getRedisClient();
    const existing = await getDailyFees(userId);

    const merged = new Map<string, number>();
    existing.forEach(f => merged.set(f.date, f.amount));
    incoming.forEach(f => merged.set(f.date, f.amount));

    const result: DailyFee[] = [...merged.entries()]
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    await redis.set(feesKey(userId), JSON.stringify(result));
    return result.length;
  } catch (error) {
    console.error('Error saving daily fees:', error);
    throw error;
  }
}
