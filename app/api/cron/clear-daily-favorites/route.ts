/**
 * Daily Favorites Clear Cron Job
 * 
 * Runs at midnight (00:00) every day to clear all Daily Favorites
 * Uses the watchlist API to delete all items
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWatchlist, deleteWatchlistItem } from '@/lib/db/watchlist';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Get all watchlist items for default user
    const items = await getWatchlist('default');
    
    // Delete all items
    let deletedCount = 0;
    for (const item of items) {
      await deleteWatchlistItem(item.id, 'default');
      deletedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${deletedCount} items from Daily Favorites`,
      deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error clearing Daily Favorites:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to clear Daily Favorites' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
