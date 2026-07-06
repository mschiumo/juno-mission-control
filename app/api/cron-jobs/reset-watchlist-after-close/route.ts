/**
 * After-Close Watchlist Reset Cron
 *
 * Runs each weekday at 21:30 UTC (~5:30 PM EDT / 4:30 PM EST), after the market
 * close, and resets the owner's Trade Management watchlist back to exactly the
 * preset SEED_TICKERS set — everything else (manual rows, promoted trades,
 * leftover favorites) is cleared so the next session starts from a clean slate.
 *
 * Companion to seed-daily-favorites (pre-open), which shares the same seed list
 * but preserves manual rows and promoted trades.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts; Vercel sends
 * "Authorization: Bearer <CRON_SECRET>" automatically. No in-route check needed.
 */

import { NextResponse } from 'next/server';
import { getWatchlist, replaceWatchlist } from '@/lib/db/watchlist';
import { getUserByEmail } from '@/lib/db/users';
import { isMarketOpenToday, logToActivityLog, postToCronResults } from '@/lib/cron-helpers';
import { SEED_TICKERS, SEED_ACCOUNT_EMAIL, buildSeedItems } from '@/lib/daily-favorites-seed';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();

  try {
    // Skip weekends and market holidays — nothing accumulated on the list today.
    if (!isMarketOpenToday()) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Market closed today' });
    }

    if (SEED_TICKERS.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No seed tickers configured' });
    }

    const user = await getUserByEmail(SEED_ACCOUNT_EMAIL);
    if (!user) {
      const msg = `Seed account not found: ${SEED_ACCOUNT_EMAIL}`;
      console.error(`[ResetWatchlistAfterClose] ${msg}`);
      await logToActivityLog('Watchlist Reset Failed', msg, 'cron');
      return NextResponse.json({ success: false, error: msg }, { status: 404 });
    }

    const userId = user.id;
    const existing = await getWatchlist(userId);
    const seeded = buildSeedItems();

    await replaceWatchlist(seeded, userId);

    const removed = existing.filter(
      (item) => !seeded.some((s) => s.ticker === item.ticker.toUpperCase())
    );
    const summary = `Reset watchlist for ${SEED_ACCOUNT_EMAIL} to ${seeded.length} preset tickers; cleared ${removed.length} other row(s) (${removed.map((i) => i.ticker).join(', ') || 'none'})`;
    console.log(`[ResetWatchlistAfterClose] ${summary}`);
    await logToActivityLog('Watchlist Reset', summary, 'cron');
    await postToCronResults('Watchlist Reset', summary, 'market');

    return NextResponse.json({
      success: true,
      account: SEED_ACCOUNT_EMAIL,
      seeded: seeded.map((i) => i.ticker),
      cleared: removed.map((i) => i.ticker),
      total: seeded.length,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ResetWatchlistAfterClose] Error:', msg);
    await logToActivityLog('Watchlist Reset Failed', msg, 'cron');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
