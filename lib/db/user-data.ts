/**
 * User-scoped data access helpers
 * 
 * This module provides helper functions for accessing data with user-scoped Redis keys.
 * All data is now isolated per user using their email as the userId.
 */

import { getRedisClient } from '@/lib/redis';
import { getUserIdFromEmail } from '@/types/user';
import type { Trade } from '@/types/trading';

// ==================== KEY PATTERNS ====================

// Trades: trades:v2:{userId}:data
export function getTradesKey(userId: string): string {
  return `trades:v2:${userId}:data`;
}

// Habits: habits:{userId}:data:{date}
export function getHabitsKey(userId: string, date: string): string {
  return `habits:${userId}:data:${date}`;
}

// Habits pattern for searching
export function getHabitsPattern(userId: string): string {
  return `habits:${userId}:data:*`;
}

// Journal: journal:{userId}:entries
export function getJournalKey(userId: string, date: string): string {
  return `journal:${userId}:entry:${date}`;
}

// Journal pattern for searching
export function getJournalPattern(userId: string): string {
  return `journal:${userId}:entry:*`;
}

// Goals: goals:{userId}:data
export function getGoalsKey(userId: string): string {
  return `goals:${userId}:data`;
}

// Cron results: cron_results:{userId}
export function getCronResultsKey(userId: string): string {
  return `cron_results:${userId}`;
}

// Activity log: activity_log:{userId}
export function getActivityLogKey(userId: string): string {
  return `activity_log:${userId}`;
}

// Evening check-ins: evening_checkin:{userId}
export function getEveningCheckinKey(userId: string): string {
  return `evening_checkin:${userId}`;
}

// Notifications (already user-scoped, keep as-is)
export function getNotificationKey(userId: string, notificationId: string): string {
  return `notification:${userId}:${notificationId}`;
}

// Notifications pattern
export function getNotificationsPattern(userId: string): string {
  return `notification:${userId}:*`;
}

// ==================== LEGACY KEYS (for migration) ====================

export const LEGACY_KEYS = {
  trades: 'trades:v2:data',
  habits: 'habits_data',  // prefix pattern
  goals: 'goals_data',
  cronResults: 'cron_results',
  activityLog: 'activity_log',
  eveningCheckin: 'evening_checkins',
  dailyJournal: 'daily-journal:',  // prefix
} as const;

// ==================== HELPER FUNCTIONS ====================

/**
 * Get user ID from session email
 */
export function getUserId(email: string | null | undefined): string {
  return getUserIdFromEmail(email);
}

/**
 * Check if a user is authenticated and return userId
 * Throws error if not authenticated
 */
export function requireAuth(email: string | null | undefined): string {
  const userId = getUserId(email);
  if (userId === 'anonymous') {
    throw new Error('Unauthorized');
  }
  return userId;
}

// ==================== TRADES DATA ACCESS ====================

/**
 * Get all trades for a user
 */
export async function getUserTrades(userId: string): Promise<Trade[]> {
  const redis = await getRedisClient();
  const key = getTradesKey(userId);
  const data = await redis.get(key);
  
  if (!data) {
    return [];
  }
  
  const parsed = JSON.parse(data);
  return parsed.trades || [];
}

/**
 * Save trades for a user
 */
export async function saveUserTrades(userId: string, trades: Trade[]): Promise<void> {
  const redis = await getRedisClient();
  const key = getTradesKey(userId);
  await redis.set(key, JSON.stringify({ trades }));
}

/**
 * Save a single trade for a user
 */
export async function saveUserTrade(userId: string, trade: Trade): Promise<void> {
  const trades = await getUserTrades(userId);
  const index = trades.findIndex(t => t.id === trade.id);
  
  if (index >= 0) {
    trades[index] = { ...trade, updatedAt: new Date().toISOString() };
  } else {
    trades.push(trade);
  }
  
  await saveUserTrades(userId, trades);
}

/**
 * Delete a trade for a user
 */
export async function deleteUserTrade(userId: string, tradeId: string): Promise<void> {
  const trades = await getUserTrades(userId);
  const filtered = trades.filter(t => t.id !== tradeId);
  await saveUserTrades(userId, filtered);
}

/**
 * Clear all trades for a user
 */
export async function clearUserTrades(userId: string): Promise<void> {
  const redis = await getRedisClient();
  const key = getTradesKey(userId);
  await redis.del(key);
}

// ==================== MIGRATION HELPERS ====================

/**
 * Migrate legacy global data to user-scoped data
 */
export async function migrateLegacyData(
  adminUserId: string
): Promise<{ success: boolean; migrated: Record<string, boolean>; error?: string }> {
  const redis = await getRedisClient();
  const migrated: Record<string, boolean> = {};
  
  try {
    // Migrate trades
    const legacyTrades = await redis.get(LEGACY_KEYS.trades);
    if (legacyTrades) {
      await redis.set(getTradesKey(adminUserId), legacyTrades);
      migrated.trades = true;
    }
    
    // Migrate goals
    const legacyGoals = await redis.get(LEGACY_KEYS.goals);
    if (legacyGoals) {
      await redis.set(getGoalsKey(adminUserId), legacyGoals);
      migrated.goals = true;
    }
    
    // Migrate cron results
    const legacyCronResults = await redis.get(LEGACY_KEYS.cronResults);
    if (legacyCronResults) {
      await redis.set(getCronResultsKey(adminUserId), legacyCronResults);
      migrated.cronResults = true;
    }
    
    // Migrate activity log
    const legacyActivityLog = await redis.get(LEGACY_KEYS.activityLog);
    if (legacyActivityLog) {
      await redis.set(getActivityLogKey(adminUserId), legacyActivityLog);
      migrated.activityLog = true;
    }
    
    // Migrate evening checkins
    const legacyCheckins = await redis.get(LEGACY_KEYS.eveningCheckin);
    if (legacyCheckins) {
      await redis.set(getEveningCheckinKey(adminUserId), legacyCheckins);
      migrated.eveningCheckin = true;
    }
    
    // Migrate habits (find all habit_data:* keys)
    const habitKeys = await redis.keys('habits_data:*');
    for (const key of habitKeys) {
      const data = await redis.get(key);
      if (data) {
        // Extract date from key (habits_data:YYYY-MM-DD)
        const date = key.split(':')[1];
        await redis.set(getHabitsKey(adminUserId, date), data);
      }
    }
    if (habitKeys.length > 0) {
      migrated.habits = true;
    }
    
    // Migrate journal entries (find all daily-journal:* keys)
    const journalKeys = await redis.keys('daily-journal:*');
    for (const key of journalKeys) {
      const data = await redis.hGetAll(key);
      if (data && data.id) {
        // Extract date from key (daily-journal:YYYY-MM-DD)
        const date = key.split(':')[1];
        const newKey = getJournalKey(adminUserId, date);
        await redis.hSet(newKey, data);
      }
    }
    if (journalKeys.length > 0) {
      migrated.journal = true;
    }
    
    return { success: true, migrated };
  } catch (error) {
    console.error('Migration error:', error);
    return { 
      success: false, 
      migrated, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Delete all legacy global data after migration
 * WARNING: This is destructive - only run after confirming migration worked
 */
export async function deleteLegacyData(): Promise<{ success: boolean; deleted: string[]; error?: string }> {
  const redis = await getRedisClient();
  const deleted: string[] = [];
  
  try {
    // Delete trades
    await redis.del(LEGACY_KEYS.trades);
    deleted.push(LEGACY_KEYS.trades);
    
    // Delete goals
    await redis.del(LEGACY_KEYS.goals);
    deleted.push(LEGACY_KEYS.goals);
    
    // Delete cron results
    await redis.del(LEGACY_KEYS.cronResults);
    deleted.push(LEGACY_KEYS.cronResults);
    
    // Delete activity log
    await redis.del(LEGACY_KEYS.activityLog);
    deleted.push(LEGACY_KEYS.activityLog);
    
    // Delete evening checkins
    await redis.del(LEGACY_KEYS.eveningCheckin);
    deleted.push(LEGACY_KEYS.eveningCheckin);
    
    // Delete all habit_data keys
    const habitKeys = await redis.keys('habits_data:*');
    if (habitKeys.length > 0) {
      await redis.del(habitKeys);
      deleted.push(...habitKeys);
    }
    
    // Delete all daily-journal keys
    const journalKeys = await redis.keys('daily-journal:*');
    for (const key of journalKeys) {
      await redis.del(key);
      deleted.push(key);
    }
    
    return { success: true, deleted };
  } catch (error) {
    console.error('Delete legacy data error:', error);
    return { 
      success: false, 
      deleted, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
