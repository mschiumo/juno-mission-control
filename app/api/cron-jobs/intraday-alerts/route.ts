/**
 * Intraday Alerts cron
 *
 * Runs every 30 minutes during market hours. Scans the 1h/2h/4h windows that
 * have fully elapsed since the open, scores the movers, diffs against the prior
 * run to flag new tickers, and stores the top 10 in Redis for the Trade
 * Management screen to read.
 *
 * Auth: middleware.ts gates /api/cron-jobs/* with CRON_SECRET (Vercel sends it
 * as a Bearer token), so no in-route auth is needed.
 *
 * Schedule is a broad UTC band (vercel.json); this route gates the exact ET
 * trading window + window eligibility itself, so it's DST-proof — firings
 * outside 10:30 AM–4:00 PM ET bail cheaply before the expensive snapshot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isMarketOpenToday } from '@/lib/cron-helpers';
import { getMarketSession } from '@/lib/gap-scanner-polygon';
import { scanIntradayWindows } from '@/lib/intraday-movers';
import { scoreMovers, markNewAlerts, getLatestAlerts, storeAlerts } from '@/lib/intraday-alerts';
import type { IntradayAlertSnapshot } from '@/types/intraday-alerts';

export const dynamic = 'force-dynamic';

const ALL_WINDOWS = [1, 2, 4];
const REGULAR_OPEN_MIN = 9 * 60 + 30; // 9:30 AM ET

/** Current ET wall-clock as minutes-of-day. */
function etMinutesOfDay(): number {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return et.getHours() * 60 + et.getMinutes();
}

/**
 * Windows whose full duration has elapsed since the 9:30 open (the user's rule:
 * 1H at 10:30, 2H at 11:30, 4H at 1:30). A 1-minute grace absorbs cron jitter.
 */
function eligibleWindows(): number[] {
  const elapsedMin = etMinutesOfDay() - REGULAR_OPEN_MIN + 1;
  return ALL_WINDOWS.filter((w) => elapsedMin >= w * 60);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  // Dev-only override to exercise the full scan regardless of the time gate.
  const force =
    process.env.NODE_ENV !== 'production' &&
    new URL(request.url).searchParams.get('force') === '1';

  try {
    const market = getMarketSession();

    // Cheap bail-outs before the 20-50MB snapshot.
    if (!force) {
      if (!isMarketOpenToday()) {
        return NextResponse.json({ success: true, skipped: 'market-closed' });
      }
      if (market.session !== 'market-open') {
        return NextResponse.json({ success: true, skipped: `session-${market.session}` });
      }
    }

    const windows = force ? ALL_WINDOWS : eligibleWindows();

    if (windows.length === 0) {
      // Before 10:30 ET — no full window yet. Store a "warming up" snapshot so
      // the UI can say so rather than showing stale data.
      const snapshot: IntradayAlertSnapshot = {
        generatedAt: new Date().toISOString(),
        tradingDate: market.tradingDate,
        marketSession: market.session,
        eligibleWindows: [],
        alerts: [],
        scanned: 0,
        message: 'Warming up — first alerts at 10:30 AM ET (one full hour after the open).',
      };
      await storeAlerts(snapshot);
      return NextResponse.json({ success: true, ...snapshot });
    }

    const scan = await scanIntradayWindows(windows, { minMovePercent: 5 });
    const scored = scoreMovers(scan.movers);

    // Diff against the previous run BEFORE overwriting it.
    const previous = await getLatestAlerts();
    const previousSymbols = previous?.alerts?.map((a) => a.symbol) ?? [];
    const alerts = markNewAlerts(scored, previousSymbols);

    const snapshot: IntradayAlertSnapshot = {
      generatedAt: new Date().toISOString(),
      tradingDate: market.tradingDate,
      marketSession: market.session,
      eligibleWindows: windows,
      alerts,
      scanned: scan.scanned,
      message: alerts.length === 0 ? (scan.message ?? 'No qualifying setups in this scan.') : undefined,
    };
    await storeAlerts(snapshot);

    return NextResponse.json({
      success: true,
      generatedAt: snapshot.generatedAt,
      eligibleWindows: windows,
      alertCount: alerts.length,
      newCount: alerts.filter((a) => a.isNew).length,
      scanned: scan.scanned,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[IntradayAlerts] cron failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Vercel cron may invoke via GET.
export async function GET(request: NextRequest) {
  return POST(request);
}
