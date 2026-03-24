/**
 * Account Value Tracking Types
 *
 * Snapshots of total account value derived from Position Statement imports
 * or manual entries. Used to build an equity curve on the calendar.
 */

export interface AccountValueSnapshot {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD (EST)
  /** Total value of all positions (sum of Qty * Mark) */
  totalPositionValue: number;
  /** Total unrealised P/L across all positions */
  totalPLOpen: number;
  /** Total realised P/L for the day */
  totalPLDay: number;
  /** User-supplied cash / sweep balance (optional) */
  cashBalance?: number;
  /** Net liquidating value = totalPositionValue + (cashBalance ?? 0) */
  netLiquidatingValue: number;
  /** Where this snapshot came from */
  source: 'position_statement' | 'manual';
  createdAt: string;
  updatedAt: string;
}
