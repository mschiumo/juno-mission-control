import { getRedisClient } from '@/lib/redis';
import { AccountValueSnapshot } from '@/types/account-value';

const ACCOUNT_VALUE_KEY_PREFIX = 'account-value:data';

function userKey(userId: string) {
  return `${ACCOUNT_VALUE_KEY_PREFIX}:${userId}`;
}

export async function getAllSnapshots(userId: string): Promise<AccountValueSnapshot[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(userKey(userId));
    if (!data) return [];
    const parsed = JSON.parse(data);
    return (parsed.snapshots || []) as AccountValueSnapshot[];
  } catch (error) {
    console.error('Error getting account value snapshots:', error);
    return [];
  }
}

export async function saveSnapshot(snapshot: AccountValueSnapshot): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllSnapshots(snapshot.userId);

    // Upsert: replace any existing snapshot for the same date + source
    const index = existing.findIndex(
      (s) => s.date === snapshot.date && s.source === snapshot.source
    );

    if (index >= 0) {
      existing[index] = { ...snapshot, updatedAt: new Date().toISOString() };
    } else {
      existing.push(snapshot);
    }

    // Keep sorted by date
    existing.sort((a, b) => a.date.localeCompare(b.date));

    await redis.set(userKey(snapshot.userId), JSON.stringify({ snapshots: existing }));
  } catch (error) {
    console.error('Error saving account value snapshot:', error);
    throw error;
  }
}

export async function deleteSnapshot(userId: string, snapshotId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllSnapshots(userId);
    const filtered = existing.filter((s) => s.id !== snapshotId);
    await redis.set(userKey(userId), JSON.stringify({ snapshots: filtered }));
  } catch (error) {
    console.error('Error deleting account value snapshot:', error);
    throw error;
  }
}

export async function getSnapshotsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<AccountValueSnapshot[]> {
  const all = await getAllSnapshots(userId);
  return all.filter((s) => s.date >= startDate && s.date <= endDate);
}
