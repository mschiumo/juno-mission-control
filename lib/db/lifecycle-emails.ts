/**
 * Lifecycle email bookkeeping — which onboarding emails each user has
 * already received, so the daily cron is idempotent and a user never gets
 * the same email twice.
 *
 * A flag is only recorded after a successful send; failures retry on the
 * next cron run. Deleting an account removes the key with the rest of the
 * user's data.
 */

import { getRedisClient } from '@/lib/redis';

export type LifecycleEmailKind = 'welcome' | 'checkin' | 'trialReminder';

export interface LifecycleEmailFlags {
  welcome?: string;
  checkin?: string;
  trialReminder?: string;
  /** Set manually (or by support) to stop all lifecycle emails for a user. */
  optOut?: boolean;
}

function key(userId: string): string {
  return `user:lifecycle-emails:${userId}`;
}

export async function getLifecycleFlags(userId: string): Promise<LifecycleEmailFlags> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(key(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw as string);
    return parsed && typeof parsed === 'object' ? (parsed as LifecycleEmailFlags) : {};
  } catch (error) {
    console.error('Error reading lifecycle email flags:', error);
    // Fail closed: pretending everything was sent beats double-sending.
    return { welcome: 'unknown', checkin: 'unknown', trialReminder: 'unknown' };
  }
}

export async function markLifecycleEmailSent(
  userId: string,
  kind: LifecycleEmailKind,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const flags = await getLifecycleFlags(userId);
    flags[kind] = new Date().toISOString();
    await redis.set(key(userId), JSON.stringify(flags));
  } catch (error) {
    console.error('Error marking lifecycle email sent:', error);
  }
}
