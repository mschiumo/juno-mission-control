/**
 * Plan-lifecycle event log — the memory behind the owner's account metrics.
 *
 * Point-in-time state (who holds which tier) can always be recomputed from
 * entitlement records, but transitions — cancellations, deletions, trial
 * starts — vanish the moment they happen unless recorded. Every lifecycle
 * write appends here so the admin dashboard and the daily digest can report
 * "what changed", not just "what is".
 *
 * Storage: a Redis list, newest first, capped so it can't grow unbounded.
 * Recording is strictly best-effort — a metrics write must never break a
 * user-facing flow.
 */

import { getRedisClient } from '@/lib/redis';

export type PlanEventType =
  | 'signup'
  | 'trial_started'
  | 'referral_redeemed'
  | 'plan_cancelled'
  | 'account_deleted'
  | 'plan_expired'
  | 'admin_grant'
  | 'admin_revoke'
  | 'trial_converting'
  | 'subscription_started'
  | 'subscription_ended'
  | 'payment_failed';

export interface PlanEvent {
  type: PlanEventType;
  at: string;
  userId: string;
  /** Captured at event time — survives account deletion. */
  email?: string;
  /** Free-text context (tier granted, referral code, teardown result…). */
  detail?: string;
}

const EVENTS_KEY = 'admin:plan-events';
const MAX_EVENTS = 500;

export async function recordPlanEvent(event: Omit<PlanEvent, 'at'>): Promise<void> {
  try {
    const redis = await getRedisClient();
    const full: PlanEvent = { ...event, at: new Date().toISOString() };
    await redis.lPush(EVENTS_KEY, JSON.stringify(full));
    await redis.lTrim(EVENTS_KEY, 0, MAX_EVENTS - 1);
  } catch (error) {
    console.error('Failed to record plan event (non-fatal):', error);
  }
}

/** Newest first. */
export async function listPlanEvents(limit = 100): Promise<PlanEvent[]> {
  try {
    const redis = await getRedisClient();
    const raw: string[] = await redis.lRange(EVENTS_KEY, 0, limit - 1);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as PlanEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is PlanEvent => !!e);
  } catch (error) {
    console.error('Failed to list plan events:', error);
    return [];
  }
}

export function eventsSince(events: PlanEvent[], since: Date): PlanEvent[] {
  return events.filter((e) => Date.parse(e.at) >= since.getTime());
}
