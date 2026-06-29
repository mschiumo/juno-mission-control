/**
 * Daily Favorites Seeding Cron
 *
 * Runs each weekday at 12:00 UTC (~8 AM EDT / 7 AM EST), before the market open,
 * and refreshes a fixed set of tickers in the owner's Daily Favorites.
 *
 * "Daily Favorites" are ticker-only watchlist rows (all prices = 0). When you fill
 * in entry/stop/target the row graduates to a Potential Trade (prices > 0) and is
 * left untouched by this job. Rows you add by hand are also left untouched.
 *
 * Each run (reset-daily behavior):
 *   1. Removes this job's own *untouched* rows from the previous run
 *      (autoSeeded === true AND all prices === 0).
 *   2. Re-adds the full SEED_TICKERS set as ticker-only favorites,
 *      skipping any ticker already present (manual favorite or promoted trade).
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts; Vercel sends
 * "Authorization: Bearer <CRON_SECRET>" automatically. No in-route check needed.
 */

import { NextResponse } from 'next/server';
import { WatchlistItem } from '@/types/watchlist';
import { getWatchlist, replaceWatchlist } from '@/lib/db/watchlist';
import { getUserByEmail } from '@/lib/db/users';
import { isMarketOpenToday, logToActivityLog, postToCronResults } from '@/lib/cron-helpers';

export const dynamic = 'force-dynamic';

/**
 * Tickers seeded into Daily Favorites every weekday morning.
 * Edit this one line to change the set.
 */

const SEED_TICKERS: string[] = ['SPY', 'FAC', 'NOW', 'QQQ', 'SPCX', 'BMNR', 'POET', 'QTEX', 'QBTS', 'TZA', 'NVD', 'EROC', 'SIDU'];

// The account these favorites are seeded into. Resolved to a user id at runtime.
const SEED_ACCOUNT_EMAIL = 'mschiumo18@gmail.com';

export async function GET() {
  const startTime = Date.now();

  try {
    // Skip weekends and market holidays (cron is Mon-Fri; this also catches holidays).
    if (!isMarketOpenToday()) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Market closed today' });
    }

    if (SEED_TICKERS.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No seed tickers configured' });
    }

    const user = await getUserByEmail(SEED_ACCOUNT_EMAIL);
    if (!user) {
      const msg = `Seed account not found: ${SEED_ACCOUNT_EMAIL}`;
      console.error(`[SeedDailyFavorites] ${msg}`);
      await logToActivityLog('Daily Favorites Failed', msg, 'cron');
      return NextResponse.json({ success: false, error: msg }, { status: 404 });
    }

    const userId = user.id;
    const existing = await getWatchlist(userId);

    // 1) Drop this job's own untouched rows from the previous run.
    //    Keep manual rows (autoSeeded !== true) and any promoted trades (a price > 0).
    const kept = existing.filter((item) => {
      const untouchedAutoSeed =
        item.autoSeeded === true &&
        item.entryPrice === 0 &&
        item.stopPrice === 0 &&
        item.targetPrice === 0;
      return !untouchedAutoSeed;
    });

    // 2) Add today's set, skipping tickers already present (manual favorite or promoted trade).
    const present = new Set(kept.map((i) => i.ticker.toUpperCase()));
    const nowIso = new Date().toISOString();
    const toAdd: WatchlistItem[] = SEED_TICKERS
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0)
      .filter((t, i, arr) => arr.indexOf(t) === i) // de-dupe the seed list itself
      .filter((t) => !present.has(t))
      .map((ticker) => ({
        id: crypto.randomUUID(),
        ticker,
        entryPrice: 0,
        stopPrice: 0,
        targetPrice: 0,
        riskRatio: 2,
        stopSize: 0,
        shareSize: 0,
        potentialReward: 0,
        positionValue: 0,
        createdAt: nowIso,
        isFavorite: false,
        autoSeeded: true,
      }));

    const finalItems = [...toAdd, ...kept];
    const removed = existing.length - kept.length;

    await replaceWatchlist(finalItems, userId);

    const addedTickers = toAdd.map((i) => i.ticker);
    const summary = `Reset Daily Favorites for ${SEED_ACCOUNT_EMAIL}: removed ${removed} stale, added ${addedTickers.length} (${addedTickers.join(', ') || 'none'})`;
    console.log(`[SeedDailyFavorites] ${summary}`);
    await logToActivityLog('Daily Favorites', summary, 'cron');
    await postToCronResults('Daily Favorites', summary, 'market');

    return NextResponse.json({
      success: true,
      account: SEED_ACCOUNT_EMAIL,
      removed,
      added: addedTickers,
      alreadyPresent: SEED_TICKERS.length - toAdd.length,
      total: finalItems.length,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[SeedDailyFavorites] Error:', msg);
    await logToActivityLog('Daily Favorites Failed', msg, 'cron');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
