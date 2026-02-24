/**
 * Migration API - One-time data migration from global to user-scoped keys
 * 
 * POST /api/migrate - Migrate all legacy data to user-scoped keys
 * DELETE /api/migrate - Delete all legacy data (after confirming migration)
 * GET /api/migrate - Check migration status
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { 
  migrateLegacyData, 
  deleteLegacyData,
  getUserId,
  getTradesKey,
  getGoalsKey,
  LEGACY_KEYS
} from '@/lib/db/user-data';
import { getRedisClient } from '@/lib/redis';

// Only allow admin users to run migration
// For now, any authenticated user can run it (first user becomes admin)

/**
 * GET /api/migrate
 * Check migration status
 */
export async function GET(request: NextRequest) {
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
    
    // Check what legacy data exists
    const legacyStatus: Record<string, boolean> = {};
    legacyStatus.trades = !!(await redis.get(LEGACY_KEYS.trades));
    legacyStatus.goals = !!(await redis.get(LEGACY_KEYS.goals));
    legacyStatus.cronResults = !!(await redis.get(LEGACY_KEYS.cronResults));
    legacyStatus.activityLog = !!(await redis.get(LEGACY_KEYS.activityLog));
    legacyStatus.eveningCheckin = !!(await redis.get(LEGACY_KEYS.eveningCheckin));
    legacyStatus.habits = (await redis.keys('habits_data:*')).length > 0;
    legacyStatus.journal = (await redis.keys('daily-journal:*')).length > 0;
    
    // Check what user-scoped data exists
    const userStatus: Record<string, boolean> = {};
    userStatus.trades = !!(await redis.get(getTradesKey(userId)));
    userStatus.goals = !!(await redis.get(getGoalsKey(userId)));
    userStatus.cronResults = !!(await redis.get(`cron_results:${userId}`));
    userStatus.activityLog = !!(await redis.get(`activity_log:${userId}`));
    userStatus.eveningCheckin = !!(await redis.get(`evening_checkin:${userId}`));
    userStatus.habits = (await redis.keys(`habits:${userId}:data:*`)).length > 0;
    userStatus.journal = (await redis.keys(`journal:${userId}:entry:*`)).length > 0;
    
    const hasLegacyData = Object.values(legacyStatus).some(Boolean);
    const hasUserData = Object.values(userStatus).some(Boolean);
    
    return NextResponse.json({
      success: true,
      status: {
        legacy: legacyStatus,
        userScoped: userStatus,
        hasLegacyData,
        hasUserData,
        canMigrate: hasLegacyData && !hasUserData,
        canDelete: !hasLegacyData && hasUserData
      }
    });
    
  } catch (error) {
    console.error('Migration status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check migration status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/migrate
 * Migrate all legacy data to user-scoped keys
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    
    // Run migration
    const result = await migrateLegacyData(userId);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Migration completed successfully',
        migrated: result.migrated,
        userId
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          migrated: result.migrated 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { success: false, error: 'Migration failed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/migrate
 * Delete all legacy data after migration
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Run deletion
    const result = await deleteLegacyData();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Legacy data deleted successfully',
        deleted: result.deleted
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          deleted: result.deleted 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Delete legacy data error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete legacy data' },
      { status: 500 }
    );
  }
}