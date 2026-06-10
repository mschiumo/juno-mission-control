/**
 * Intraday Alerts — client read endpoint.
 *
 * GET /api/intraday-alerts — returns the latest stored alert snapshot and flags
 * which tickers are already in the caller's watchlist / daily favorites.
 *
 * Read-only: the scan itself runs in the cron job, never here.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getLatestAlerts } from '@/lib/intraday-alerts';
import { getWatchlist } from '@/lib/db/watchlist';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const snapshot = await getLatestAlerts();
    if (!snapshot) {
      return NextResponse.json({ success: true, data: null });
    }

    const watchlist = await getWatchlist(userId);
    const owned = new Set(watchlist.map((w) => w.ticker.toUpperCase()));
    const alerts = snapshot.alerts.map((a) => ({
      ...a,
      alreadyAdded: owned.has(a.symbol.toUpperCase()),
    }));

    return NextResponse.json({ success: true, data: { ...snapshot, alerts } });
  } catch (err) {
    console.error('[IntradayAlerts] GET failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to load alerts' }, { status: 500 });
  }
}
