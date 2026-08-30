/**
 * GET /api/cron-jobs/entitlements-sweep — nightly reconciliation.
 *
 * Two jobs, both about not paying SnapTrade for users who shouldn't have
 * live sync:
 *  1. Tear down brokerage for anyone whose plan record lapsed below Gold
 *     (expired trial, expired referral month, lapsed subscription).
 *  2. Retry SnapTrade deregistrations that failed at disconnect time and
 *     were queued in the orphan set.
 *
 * Records that are merely expired are left in place (they resolve to no
 * plan on read); fully-lapsed users are dropped from the plan index once
 * their teardown succeeds.
 */

import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth-session';
import {
  getEntitlementRecord,
  listLapsedBrokerageUserIds,
  clearPlanIndex,
} from '@/lib/db/entitlements';
import { getBrokerConnection } from '@/lib/db/broker-connections';
import { isRecordActive } from '@/lib/entitlements';
import { disconnectBrokerage, retryOrphanedDeregistrations } from '@/lib/brokerage-access';
import { disconnectPortfolio } from '@/lib/portfolio-access';
import { getAllPortfolioConnections } from '@/lib/db/portfolio-connection';
import { getEntitlements } from '@/lib/db/entitlements';
import { recordPlanEvent } from '@/lib/db/plan-events';

export async function GET(request: Request): Promise<NextResponse> {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const lapsed = await listLapsedBrokerageUserIds();
  let disconnected = 0;
  let orphaned = 0;
  for (const userId of lapsed) {
    try {
      const connection = await getBrokerConnection(userId);
      if (connection) {
        const result = await disconnectBrokerage(userId);
        if (result.hadConnection) disconnected++;
        if (result.orphaned) orphaned++;
        await recordPlanEvent({
          type: 'plan_expired',
          userId,
          detail: `Lapsed below Gold; brokerage ${result.deregistered ? 'disconnected' : 'queued for retry'}`,
        });
      }
      // Only drop fully-inactive records from the index; an active Silver
      // holder stays listed for support even though they hold no brokerage.
      const record = await getEntitlementRecord(userId);
      if (!isRecordActive(record)) await clearPlanIndex(userId);
    } catch (error) {
      console.error(`Entitlements sweep failed for ${userId}:`, error);
    }
  }

  // Portfolio connections are Platinum-only and billed per SnapTrade user, so
  // sweep every stored connection against the holder's CURRENT entitlements —
  // this catches lapsed/downgraded plans and deleted accounts alike (a missing
  // record resolves to free; the owner always resolves platinum).
  let portfoliosDisconnected = 0;
  for (const connection of await getAllPortfolioConnections()) {
    try {
      const entitlements = await getEntitlements(connection.userId);
      if (entitlements.features.portfolio) continue;
      const result = await disconnectPortfolio(connection.userId);
      if (result.hadConnection) portfoliosDisconnected++;
      if (result.orphaned) orphaned++;
      await recordPlanEvent({
        type: 'plan_expired',
        userId: connection.userId,
        detail: `Lapsed below Platinum; portfolio ${result.deregistered ? 'disconnected' : 'queued for retry'}`,
      });
    } catch (error) {
      console.error(`Portfolio sweep failed for ${connection.userId}:`, error);
    }
  }

  const retries = await retryOrphanedDeregistrations();
  return NextResponse.json({
    success: true,
    lapsedChecked: lapsed.length,
    disconnected,
    portfoliosDisconnected,
    orphaned,
    orphansRetried: retries.retried,
    orphansCleared: retries.cleared,
  });
}
