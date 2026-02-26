/**
 * Migration Script: localStorage Trades → Redis
 * 
 * This script migrates existing trades stored in browser localStorage to Redis.
 * Run once on deployment.
 * 
 * POST /api/admin/migrate-localstorage-trades
 * 
 * Expected localStorage keys:
 * - juno:trade-watchlist (potential trades)
 * - juno:active-trades (active trades)
 * - juno:closed-positions (closed positions)
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveWatchlistItems, clearWatchlist } from '@/lib/db/watchlist';
import { saveActiveTrades, clearActiveTrades } from '@/lib/db/active-trades';
import { saveClosedPositions, clearClosedPositions, ClosedPosition } from '@/lib/db/closed-positions';
import { WatchlistItem } from '@/types/watchlist';
import { ActiveTradeWithPnL } from '@/types/active-trade';

interface MigrationRequest {
  userId?: string;
  watchlist?: WatchlistItem[];
  activeTrades?: ActiveTradeWithPnL[];
  closedPositions?: ClosedPosition[];
  clearExisting?: boolean;
}

interface MigrationResult {
  watchlist: { migrated: number; errors: string[] };
  activeTrades: { migrated: number; errors: string[] };
  closedPositions: { migrated: number; errors: string[] };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const result: MigrationResult = {
    watchlist: { migrated: 0, errors: [] },
    activeTrades: { migrated: 0, errors: [] },
    closedPositions: { migrated: 0, errors: [] },
  };

  try {
    const body: MigrationRequest = await request.json();
    const userId = body.userId || 'default';
    const clearExisting = body.clearExisting ?? false;

    // Clear existing data if requested
    if (clearExisting) {
      await clearWatchlist(userId);
      await clearActiveTrades(userId);
      await clearClosedPositions(userId);
    }

    // Migrate Watchlist
    if (body.watchlist && Array.isArray(body.watchlist) && body.watchlist.length > 0) {
      try {
        // Validate watchlist items
        const validItems = body.watchlist.filter((item: WatchlistItem) => {
          if (!item.id || !item.ticker) {
            result.watchlist.errors.push(`Invalid item: missing id or ticker`);
            return false;
          }
          return true;
        });

        if (validItems.length > 0) {
          await saveWatchlistItems(validItems, userId);
          result.watchlist.migrated = validItems.length;
        }
      } catch (error) {
        result.watchlist.errors.push(`Migration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Migrate Active Trades
    if (body.activeTrades && Array.isArray(body.activeTrades) && body.activeTrades.length > 0) {
      try {
        // Validate active trades
        const validTrades = body.activeTrades.filter((trade: ActiveTradeWithPnL) => {
          if (!trade.id || !trade.ticker) {
            result.activeTrades.errors.push(`Invalid trade: missing id or ticker`);
            return false;
          }
          return true;
        });

        if (validTrades.length > 0) {
          await saveActiveTrades(validTrades, userId);
          result.activeTrades.migrated = validTrades.length;
        }
      } catch (error) {
        result.activeTrades.errors.push(`Migration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Migrate Closed Positions
    if (body.closedPositions && Array.isArray(body.closedPositions) && body.closedPositions.length > 0) {
      try {
        // Validate closed positions
        const validPositions = body.closedPositions.filter((position: ClosedPosition) => {
          if (!position.id || !position.ticker) {
            result.closedPositions.errors.push(`Invalid position: missing id or ticker`);
            return false;
          }
          return true;
        });

        if (validPositions.length > 0) {
          await saveClosedPositions(validPositions, userId);
          result.closedPositions.migrated = validPositions.length;
        }
      } catch (error) {
        result.closedPositions.errors.push(`Migration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    }

    const totalMigrated = result.watchlist.migrated + result.activeTrades.migrated + result.closedPositions.migrated;
    const totalErrors = result.watchlist.errors.length + result.activeTrades.errors.length + result.closedPositions.errors.length;

    return NextResponse.json({
      success: true,
      message: `Migration complete. Migrated ${totalMigrated} items with ${totalErrors} errors.`,
      result,
      userId,
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        result
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/migrate-localstorage-trades
 * 
 * Returns status/info about the migration endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    message: 'LocalStorage to Redis Migration API',
    usage: {
      method: 'POST',
      body: {
        userId: 'string (optional, defaults to "default")',
        watchlist: 'WatchlistItem[] (optional)',
        activeTrades: 'ActiveTradeWithPnL[] (optional)',
        closedPositions: 'ClosedPosition[] (optional)',
        clearExisting: 'boolean (optional, defaults to false)'
      }
    },
    expectedLocalStorageKeys: [
      'juno:trade-watchlist',
      'juno:active-trades',
      'juno:closed-positions'
    ]
  });
}
