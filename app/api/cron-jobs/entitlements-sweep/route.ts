/**
 * GET /api/cron-jobs/entitlements-sweep
 *
 * Nightly reconciliation between "who is entitled" and "who we are being
 * billed for". SnapTrade charges per connected user per month, so any drift
 * here is a recurring charge for someone who is not paying.
 *
 * Two jobs:
 *   1. Tear down brokerage connections for lapsed paid users. A missed billing
 *      webhook, an expired admin grant, or a cancelled subscription all land
 *      here, so entitlement expiry alone is enough to stop the spend.
 *   2. Retry deregistrations that previously failed. Those orphans hold live
 *      authorizations and would otherwise bill indefinitely, unreachable.
 *
 * Gated by CRON_SECRET in middleware.ts, like the other scheduled jobs.
 */

import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth-session';
import { listLapsedUserIds, clearPaidIndex } from '@/lib/db/entitlements';
import { disconnectBrokerage, retryOrphanedDeregistrations } from '@/lib/brokerage-access';

export async function GET(request: Request): Promise<NextResponse> {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const lapsed = await listLapsedUserIds();
  const torn: { userId: string; hadConnection: boolean; deregistered: boolean; orphaned: boolean }[] = [];

  for (const userId of lapsed) {
    try {
      const result = await disconnectBrokerage(userId);
      await clearPaidIndex(userId);
      torn.push({ userId, ...result });
      if (result.hadConnection) {
        console.warn(`entitlements-sweep: tore down brokerage for lapsed user ${userId}`);
      }
    } catch (error) {
      console.error(`entitlements-sweep: teardown failed for ${userId}`, error);
    }
  }

  const orphans = await retryOrphanedDeregistrations();

  return NextResponse.json({
    success: true,
    data: {
      lapsedChecked: lapsed.length,
      disconnected: torn.filter((t) => t.hadConnection).length,
      orphansRetried: orphans.retried,
      orphansCleared: orphans.cleared,
    },
  });
}
