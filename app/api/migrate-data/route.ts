/**
 * One-time data migration API
 *
 * POST /api/migrate-data
 *
 * Copies all legacy (non-userId-scoped) Redis keys to the authenticated
 * user's scoped keys. Safe to call multiple times — existing scoped data
 * is never overwritten if it already exists.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';

export async function POST() {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  const redis = await getRedisClient();
  const migrated: string[] = [];
  const skipped: string[] = [];

  // Helper: copy a string key only if the destination doesn't already exist
  async function migrateString(oldKey: string, newKey: string) {
    const existing = await redis.exists(newKey);
    if (existing) {
      skipped.push(`${oldKey} → ${newKey} (destination already exists)`);
      return;
    }
    const value = await redis.get(oldKey);
    if (value !== null) {
      await redis.set(newKey, value);
      migrated.push(`${oldKey} → ${newKey}`);
    } else {
      skipped.push(`${oldKey} (not found)`);
    }
  }

  // Helper: copy a hash key only if the destination doesn't already exist
  async function migrateHash(oldKey: string, newKey: string) {
    const existing = await redis.exists(newKey);
    if (existing) {
      skipped.push(`${oldKey} → ${newKey} (destination already exists)`);
      return;
    }
    const value = await redis.hGetAll(oldKey);
    if (value && Object.keys(value).length > 0) {
      await redis.hSet(newKey, value);
      migrated.push(`${oldKey} → ${newKey}`);
    } else {
      skipped.push(`${oldKey} (not found or empty)`);
    }
  }

  try {
    // --- Trades (v2) ---
    await migrateString('trades:v2:data', `trades:v2:data:${userId}`);

    // --- Habits list ---
    await migrateString('habits_list', `habits_list:${userId}`);

    // --- Habit status by date: habits_data:{date} ---
    // Old pattern: habits_data:YYYY-MM-DD (date starts with digit)
    // New pattern: habits_data:{userId}:YYYY-MM-DD
    const habitDataKeys = await redis.keys('habits_data:*');
    const oldHabitDataKeys = habitDataKeys.filter(k => {
      const suffix = k.slice('habits_data:'.length);
      return /^\d{4}-\d{2}-\d{2}$/.test(suffix); // Only old-style date keys
    });
    for (const oldKey of oldHabitDataKeys) {
      const date = oldKey.slice('habits_data:'.length);
      await migrateString(oldKey, `habits_data:${userId}:${date}`);
    }

    // --- Trade journal by date: journal:{date} ---
    // Old pattern: journal:YYYY-MM-DD
    // New pattern: journal:{userId}:YYYY-MM-DD
    const journalKeys = await redis.keys('journal:*');
    const oldJournalKeys = journalKeys.filter(k => {
      const suffix = k.slice('journal:'.length);
      return /^\d{4}-\d{2}-\d{2}$/.test(suffix);
    });
    for (const oldKey of oldJournalKeys) {
      const date = oldKey.slice('journal:'.length);
      const newKey = `journal:${userId}:${date}`;
      await migrateHash(oldKey, newKey);
    }

    // --- Daily journal by date: daily-journal:{date} ---
    // Old pattern: daily-journal:YYYY-MM-DD
    // New pattern: daily-journal:{userId}:YYYY-MM-DD
    const dailyJournalKeys = await redis.keys('daily-journal:*');
    const oldDailyJournalKeys = dailyJournalKeys.filter(k => {
      const suffix = k.slice('daily-journal:'.length);
      return /^\d{4}-\d{2}-\d{2}$/.test(suffix);
    });
    for (const oldKey of oldDailyJournalKeys) {
      const date = oldKey.slice('daily-journal:'.length);
      const newKey = `daily-journal:${userId}:${date}`;
      await migrateHash(oldKey, newKey);
    }

    // --- Goals ---
    await migrateString('goals_data', `goals_data:${userId}`);

    // --- Evening checkins ---
    await migrateString('evening_checkins', `evening_checkins:${userId}`);

    // --- Active trades (was keyed by 'default') ---
    await migrateString('trades:active:data:default', `trades:active:data:${userId}`);

    // --- Closed positions (was keyed by 'default') ---
    await migrateString('trades:closed:data:default', `trades:closed:data:${userId}`);

    // --- Watchlist (was keyed by 'default') ---
    await migrateString('trades:watchlist:data:default', `trades:watchlist:data:${userId}`);

    return NextResponse.json({
      success: true,
      userId,
      migrated,
      skipped,
      message: `Migration complete. ${migrated.length} keys copied, ${skipped.length} skipped.`
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { success: false, error: 'Migration failed', detail: String(error) },
      { status: 500 }
    );
  }
}
