import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { fetchRecentActivities, attachCalories, type StravaActivity } from '@/lib/strava';
import { completeMatchingHabits, isExerciseHabit, isRunHabit, isCardioHabit } from '@/lib/habit-sync';
import { RUN_SPORTS, WALK_SPORTS } from '@/lib/strava-metrics';

// POST — pull recent Strava activities and auto-complete matching habits for
// today. Returns the synced window of activities for display either way.

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

export async function POST() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    // Window: whichever reaches further back — 30 rolling days (pace records)
    // or the start of the current calendar month (monthly distance total).
    const nowSec = Math.floor(Date.now() / 1000);
    const thirtyDaysAgoSec = nowSec - 30 * 24 * 60 * 60;
    const monthStartSec = Math.floor(new Date(`${getTodayEST().slice(0, 7)}-01T00:00:00-05:00`).getTime() / 1000);
    const afterSec = Math.min(thirtyDaysAgoSec, monthStartSec);
    let activities: StravaActivity[] | null;
    try {
      activities = await fetchRecentActivities(userId, afterSec);
    } catch (err) {
      console.error('Strava sync fetch error:', err);
      return NextResponse.json({ success: false, error: 'Strava API request failed' }, { status: 502 });
    }
    if (activities === null) {
      return NextResponse.json({ success: true, connected: false, activities: [], completedHabits: [] });
    }

    activities.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));

    // Fill in calories (cached per activity; capped detail fetches per sync).
    try {
      await attachCalories(userId, activities);
    } catch (err) {
      console.error('attachCalories failed:', err);
    }

    const today = getTodayEST();
    const todaysActivities = activities.filter((a) => a.start_date_local.slice(0, 10) === today);
    const hasRunToday = todaysActivities.some((a) => RUN_SPORTS.has(a.sport_type));
    // Runs and walks both count as cardio.
    const hasCardioToday = todaysActivities.some((a) => RUN_SPORTS.has(a.sport_type) || WALK_SPORTS.has(a.sport_type));
    const hasAnyToday = todaysActivities.length > 0;

    const completedHabits = hasAnyToday
      ? await completeMatchingHabits(userId, today, (h) =>
          (isExerciseHabit(h) && hasAnyToday) || (isRunHabit(h) && hasRunToday) || (isCardioHabit(h) && hasCardioToday)
        )
      : [];

    return NextResponse.json({
      success: true,
      connected: true,
      activities,
      completedHabits,
    });
  } catch (err) {
    console.error('Strava sync error:', err);
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}
