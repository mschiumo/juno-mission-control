/**
 * Server-only helpers for the Collaborative activity feed (goals_activity:{userId}).
 * Kept separate from lib/goals/types.ts because it imports Redis — types.ts is
 * also imported by client components and must stay server-import-free.
 */
import { randomUUID } from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';
import { ActivityEvent, goalsActivityKey, ACTIVITY_CAP } from './types';

type RedisClient = Awaited<ReturnType<typeof getRedisClient>>;

/** Append one event to the owner's feed (capped, newest last). Best-effort — never throws. */
export async function appendActivity(
  redis: RedisClient,
  userId: string,
  event: Omit<ActivityEvent, 'id' | 'at'>,
): Promise<void> {
  try {
    const key = goalsActivityKey(userId);
    const raw = await redis.get(key);
    const events: ActivityEvent[] = raw ? JSON.parse(raw) : [];
    events.push({ id: randomUUID(), at: getNowInEST(), ...event });
    if (events.length > ACTIVITY_CAP) events.splice(0, events.length - ACTIVITY_CAP);
    await redis.set(key, JSON.stringify(events));
  } catch (e) {
    console.error('appendActivity failed:', e);
  }
}

export async function readActivity(redis: RedisClient, userId: string): Promise<ActivityEvent[]> {
  const raw = await redis.get(goalsActivityKey(userId));
  return raw ? (JSON.parse(raw) as ActivityEvent[]) : [];
}
