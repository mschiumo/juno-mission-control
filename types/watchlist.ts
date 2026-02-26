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
}

export type WatchlistStorageKey = 'juno:trade-watchlist';
