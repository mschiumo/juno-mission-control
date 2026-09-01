/**
 * POST /api/portfolio/sync — Platinum feature (owner always included).
 *
 * Manual "Sync now" for the Portfolio tab. SnapTrade only relays brokerage
 * data once a day on its own, so a plain sync re-reads a stale cache — this
 * route instead triggers SnapTrade's billable force-refresh (bounded wait for
 * it to land), then syncs. A per-user cooldown keeps repeated clicks from
 * stacking refresh charges; inside the cooldown it falls back to a cache sync.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import { getPortfolioConnection } from '@/lib/db/portfolio-connection';
import { refreshAndSyncPortfolio, syncPortfolio } from '@/lib/portfolio-sync';

/** Minimum spacing between billable SnapTrade force-refreshes per user. */
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Brokerage connections are not configured yet.' },
      { status: 503 }
    );
  }

  const connection = await getPortfolioConnection(userId);
  if (!connection || connection.accounts.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No portfolio brokerage is connected.' },
      { status: 409 }
    );
  }

  const lastRefresh = connection.lastRefreshedAt
    ? Date.parse(connection.lastRefreshedAt)
    : 0;
  const cooledDown = Date.now() - lastRefresh >= REFRESH_COOLDOWN_MS;

  try {
    const result = cooledDown
      ? await refreshAndSyncPortfolio(connection, { pollTimeoutMs: 60_000 })
      : { ...(await syncPortfolio(connection)), refreshed: false, holdingsUpdated: false };
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Portfolio sync failed:', error);
    return NextResponse.json(
      { success: false, error: 'Sync failed. Please try again.' },
      { status: 502 }
    );
  }
}
