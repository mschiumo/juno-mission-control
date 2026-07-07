import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { fetchRecentActivities } from '@/lib/strava';
import { completeMatchingHabits, isExerciseHabit, isRunHabit } from '@/lib/habit-sync';

/**
 * Scheduled Strava sync — runs every 12 hours (see vercel.json) so habits
 * auto-complete from activities even on days the dashboard is never opened.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts; Vercel
 * sends "Authorization: Bearer <CRON_SECRET>" automatically.
 */

export const maxDuration = 60;

const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);
const TOKEN_KEY_PREFIX = 'strava:tokens:';

function getTodayEST(): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

export async function GET() {
  try {
    const redis = await getRedisClient();
    const today = getTodayEST();
    // Yesterday+today window is plenty — we only auto-complete today's habits.
    const afterSec = Math.floor(Date.now() / 1000) - 48 * 60 * 60;

    const userIds: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: `${TOKEN_KEY_PREFIX}*`, COUNT: 100 })) {
      userIds.push(String(key).slice(TOKEN_KEY_PREFIX.length));
    }

    const results: { userId: string; status: string; completed?: string[] }[] = [];

    for (const userId of userIds) {
      try {
        // getValidAccessToken (inside fetchRecentActivities) refreshes and
        // persists rotated tokens, and self-clears dead ones (returns null).
        const activities = await fetchRecentActivities(userId, afterSec);
        if (activities === null) {
          results.push({ userId, status: 'disconnected' });
          continue;
        }

        const todays = activities.filter((a) => a.start_date_local.slice(0, 10) === today);
        if (todays.length === 0) {
          results.push({ userId, status: 'no-activity-today' });
          continue;
        }

        const hasRunToday = todays.some((a) => RUN_SPORTS.has(a.sport_type));
        const completed = await completeMatchingHabits(userId, today, (h) =>
          isExerciseHabit(h) || (isRunHabit(h) && hasRunToday)
        );
        results.push({ userId, status: 'synced', completed: completed.map((h) => h.name) });
      } catch (err) {
        console.error(`Strava cron sync failed for user ${userId}:`, err);
        results.push({ userId, status: 'error' });
      }
    }

    const summary = {
      success: true,
      today,
      users: userIds.length,
      synced: results.filter((r) => r.status === 'synced').length,
      habitsCompleted: results.flatMap((r) => r.completed ?? []).length,
      results,
    };
    console.log('Strava cron sync:', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error('Strava cron sync error:', err);
    return NextResponse.json({ success: false, error: 'Strava cron sync failed' }, { status: 500 });
  }
}
