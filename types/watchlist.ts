/**
 * Watchlist Types
 * 
 * Type definitions for the position calculator watchlist feature
 */

export interface WatchlistItem {
  id: string; // timestamp or UUID
  ticker: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  riskRatio: number;
  stopSize: number;
  shareSize: number;
  potentialReward: number;
  positionValue: number;
  createdAt: string; // ISO timestamp
  isFavorite?: boolean; // Optional favorite flag
  order?: number; // Optional order index for drag-and-drop sorting
  autoSeeded?: boolean; // Set by the daily-favorites seeding cron so the daily reset can identify & clear its own untouched rows
}

export type WatchlistStorageKey = 'ct:trade-watchlist';
