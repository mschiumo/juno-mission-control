import { NextResponse } from 'next/server';
import { clearAllTrades } from '@/lib/db/trades-v2';

/**
 * POST /api/trades/clear
 * 
 * Wipes all trade data from Redis
 */
export async function POST() {
  try {
    await clearAllTrades();
    
    return NextResponse.json({
      success: true,
      message: 'All trade data cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear trades' },
      { status: 500 }
    );
  }
}