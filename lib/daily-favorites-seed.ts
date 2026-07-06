/**
 * Shared seed configuration for the Daily Favorites watchlist crons.
 *
 * Two jobs use this list:
 *   - seed-daily-favorites (pre-open):    tops the watchlist up with these tickers,
 *     preserving manual rows and promoted trades.
 *   - reset-watchlist-after-close (post-close): wipes the watchlist back to exactly
 *     these tickers.
 */

import { WatchlistItem } from '@/types/watchlist';

/**
 * Tickers seeded into Daily Favorites. Edit this one line to change the set.
 */
export const SEED_TICKERS: string[] = ['SPY', 'FAC', 'NOW', 'QQQ', 'SPCX', 'BMNR', 'POET', 'QTEX', 'QBTS', 'TZA', 'NVD', 'EROC', 'SIDU'];

// The account these favorites are seeded into. Resolved to a user id at runtime.
export const SEED_ACCOUNT_EMAIL = 'mschiumo18@gmail.com';

/**
 * Build fresh ticker-only watchlist rows (all prices = 0) for the given tickers,
 * normalized, de-duped, and flagged autoSeeded.
 */
export function buildSeedItems(tickers: string[] = SEED_TICKERS): WatchlistItem[] {
  const nowIso = new Date().toISOString();
  return tickers
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0)
    .filter((t, i, arr) => arr.indexOf(t) === i)
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
}
