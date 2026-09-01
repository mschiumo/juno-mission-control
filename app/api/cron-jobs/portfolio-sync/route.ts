/**
 * Scheduled Portfolio force-refresh (Vercel cron) — owner-only.
 *
 * Every 12 hours (10:30/22:30 UTC) triggers SnapTrade's manual holdings
 * refresh so the Portfolio tab shows live brokerage data instead of
 * SnapTrade's once-a-day cache, waits for the refresh to land, then re-syncs.
 *
 * Owner-gated on purpose: the refresh endpoint bills per call, so only the
 * owner's portfolio connection gets it. Other Platinum portfolios keep the
 * free cache sync piggybacked on /api/cron-jobs/snaptrade-sync. Gated by
 * CRON_SECRET in middleware.ts, same as the other /api/cron-jobs/* routes.
 */

import { NextResponse } from 'next/server';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import { OWNER_EMAIL } from '@/lib/owner';
import { getUserByEmail } from '@/lib/db/users';
import { getPortfolioConnection } from '@/lib/db/portfolio-connection';
import { refreshAndSyncPortfolio } from '@/lib/portfolio-sync';

export async function POST() {
  const startTime = Date.now();

  if (!isSnapTradeConfigured()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'SnapTrade not configured' });
  }

  const owner = await getUserByEmail(OWNER_EMAIL);
  if (!owner) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Owner account not found' });
  }

  const connection = await getPortfolioConnection(owner.id);
  if (!connection || connection.accounts.length === 0) {
    return NextResponse.json({ success: true, skipped: true, reason: 'No portfolio connected' });
  }

  try {
    const result = await refreshAndSyncPortfolio(connection, { pollTimeoutMs: 120_000 });
    return NextResponse.json({
      success: true,
      data: { ...result, durationMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[PortfolioSyncCron] failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

export async function GET() {
  return POST();
}
