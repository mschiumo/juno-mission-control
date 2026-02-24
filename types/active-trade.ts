/**
 * Active Trade Types
 * 
 * Type definitions for tracking stocks with actual positions
 */

export interface ActiveTrade {
  id: string;
  ticker: string;
  // From watchlist/planned
  plannedEntry: number;
  plannedStop: number;
  plannedTarget: number;
  // Actual position
  actualEntry: number;
  actualShares: number;
  positionValue: number;
  openedAt: string; // ISO timestamp
  // Optional
  notes?: string;
}

export interface ActiveTradeWithPnL extends ActiveTrade {
  currentPrice?: number;
  unrealizedPnL?: number;
  unrealizedPnLPercent?: number;
}
