import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { clearUserTrades, getUserId } from '@/lib/db/user-data';

/**
 * POST /api/trades/clear
 * 
 * Wipes all trade data from Redis for the authenticated user
 */
export async function POST() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    await clearUserTrades(userId);
    
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