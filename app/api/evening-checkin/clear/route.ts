import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getUserId, getEveningCheckinKey } from '@/lib/db/user-data';
import { getRedisClient } from '@/lib/redis';

/**
 * POST /api/evening-checkin/clear
 * 
 * Clear all evening check-in data for the authenticated user
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
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    const storageKey = getEveningCheckinKey(userId);
    await redis.del(storageKey);
    
    return NextResponse.json({
      success: true,
      message: 'Evening check-in data cleared successfully'
    });
  } catch (error) {
    console.error('Clear evening check-in error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear evening check-in data' },
      { status: 500 }
    );
  }
}