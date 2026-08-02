import { getRedisClient } from '@/lib/redis';
import { DailyFee } from '@/lib/parsers/tos-parser';

// Mirrors lib/db/balances.ts: `user:fees` holds statement-upload figures,
// `user:broker-fees` the series derived from the live brokerage sync. The read
// path merges them, broker winning on dates both cover.

function feesKey(userId: string) {
  return `user:fees:${userId}`;
}

function brokerFeesKey(userId: string) {
  return `user:broker-fees:${userId}`;
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

    // Replace each date's record wholesale (a re-import supersedes the prior
    // value for that day) while preserving the commissions/borrow breakdown.
    const merged = new Map<string, DailyFee>();
    existing.forEach(f => merged.set(f.date, f));
    incoming.forEach(f => merged.set(f.date, f));

    const result: DailyFee[] = [...merged.values()]
      .sort((a, b) => a.date.localeCompare(b.date));

    await redis.set(feesKey(userId), JSON.stringify(result));
    return result.length;
  } catch (error) {
    console.error('Error saving daily fees:', error);
    throw error;
  }
}

export async function getBrokerDailyFees(userId: string): Promise<DailyFee[]> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(brokerFeesKey(userId));
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error getting broker daily fees:', error);
    return [];
  }
}

/** Full overwrite — the series is recomputed from the complete ledger each sync. */
export async function saveBrokerDailyFees(fees: DailyFee[], userId: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    await redis.set(brokerFeesKey(userId), JSON.stringify(fees));
    return fees.length;
  } catch (error) {
    console.error('Error saving broker daily fees:', error);
    throw error;
  }
}

export async function clearBrokerDailyFees(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(brokerFeesKey(userId));
  } catch (error) {
    console.error('Error clearing broker daily fees:', error);
  }
}

/** Statement-upload fees extended/overridden by broker-derived ones (broker wins per date). */
export async function getCombinedDailyFees(userId: string): Promise<DailyFee[]> {
  const [manual, broker] = await Promise.all([
    getDailyFees(userId),
    getBrokerDailyFees(userId),
  ]);
  if (broker.length === 0) return manual;
  const merged = new Map<string, DailyFee>();
  manual.forEach(f => merged.set(f.date, f));
  broker.forEach(f => merged.set(f.date, f));
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}
