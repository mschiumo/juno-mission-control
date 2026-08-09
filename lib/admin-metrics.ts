/**
 * Account metrics — one computation shared by the owner's Accounts tab
 * (GET /api/admin/metrics) and the daily digest email cron, so the numbers
 * in both always agree.
 *
 * O(users) Redis reads; fine at current scale, revisit with pipelining if
 * the user base grows past a few thousand.
 */

import { getRedisClient } from '@/lib/redis';
import { getAllUserIds, getUserById } from '@/lib/db/users';
import { getEntitlementRecord } from '@/lib/db/entitlements';
import { getBrokerConnection } from '@/lib/db/broker-connections';
import { isRecordActive, type Tier, type EntitlementSource } from '@/lib/entitlements';
import { isOwnerEmail } from '@/lib/owner';
import { listPlanEvents, eventsSince, type PlanEvent } from '@/lib/db/plan-events';

export interface AccountMetrics {
  generatedAt: string;
  totalUsers: number;
  /** Active tier counts; silver = everyone without an active paid record. */
  tiers: Record<Tier, number>;
  /** Where active Gold/Platinum access came from. */
  paidSources: Record<EntitlementSource, number>;
  brokerageConnected: number;
  briefingOptIns: number;
  trialsUsedTotal: number;
  referralsRedeemedTotal: number;
  /** Users with an expiring record (trial/referral) ending within 7 days. */
  expiringWithin7Days: { email: string; tier: Tier; source: string; expiresAt: string }[];
  /** Newest first. */
  recentEvents: PlanEvent[];
  /** Events in the last 24 hours, newest first. */
  last24h: PlanEvent[];
}

export async function computeAccountMetrics(): Promise<AccountMetrics> {
  const redis = await getRedisClient();
  const userIds = await getAllUserIds();

  const tiers: Record<Tier, number> = { silver: 0, gold: 0, platinum: 0 };
  const paidSources: Record<EntitlementSource, number> = {
    owner: 0,
    admin: 0,
    billing: 0,
    trial: 0,
    referral: 0,
  };
  let brokerageConnected = 0;
  let briefingOptIns = 0;
  const expiringWithin7Days: AccountMetrics['expiringWithin7Days'] = [];
  const soon = Date.now() + 7 * 24 * 60 * 60 * 1000;

  for (const userId of userIds) {
    const user = await getUserById(userId);
    const owner = isOwnerEmail(user?.email);

    const record = await getEntitlementRecord(userId);
    const active = isRecordActive(record);
    if (owner) {
      tiers.platinum++;
      paidSources.owner++;
    } else if (active && record) {
      tiers[record.tier]++;
      paidSources[record.source]++;
      if (record.expiresAt && Date.parse(record.expiresAt) <= soon) {
        expiringWithin7Days.push({
          email: user?.email ?? userId,
          tier: record.tier,
          source: record.source,
          expiresAt: record.expiresAt,
        });
      }
    } else {
      tiers.silver++;
    }

    if (await getBrokerConnection(userId)) brokerageConnected++;

    try {
      const prefsRaw = await redis.get(`user:prefs:${userId}`);
      const prefs = prefsRaw ? JSON.parse(prefsRaw as string) : {};
      if (prefs?.emailAlerts?.marketBriefing) briefingOptIns++;
    } catch {
      // prefs are optional; skip
    }
  }

  // Lifetime counters from the once-per-user flags.
  const trialKeys = await redis.keys('user:entitlements:trial-used:*');
  const referralKeys = await redis.keys('user:entitlements:referral-used:*');

  const recentEvents = await listPlanEvents(100);
  const last24h = eventsSince(recentEvents, new Date(Date.now() - 24 * 60 * 60 * 1000));

  return {
    generatedAt: new Date().toISOString(),
    totalUsers: userIds.length,
    tiers,
    paidSources,
    brokerageConnected,
    briefingOptIns,
    trialsUsedTotal: trialKeys.length,
    referralsRedeemedTotal: referralKeys.length,
    expiringWithin7Days,
    recentEvents: recentEvents.slice(0, 30),
    last24h,
  };
}
