import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import { fetchRecentActivities, type StravaActivity } from '@/lib/strava';

// POST — pull recent Strava activities and auto-complete matching habits for
// today. Returns the last 7 days of activities for display either way.

const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);

interface HabitData {
  id: string;
  name: string;
  icon: string;
  completedToday: boolean;
  streak: number;
  history: boolean[];
  [key: string]: unknown;
}

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

function streakWith(completed: boolean, history: boolean[]): number {
  let streak = completed ? 1 : 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]) streak++;
    else break;
  }
  return streak;
}

// Habit ids aren't stable slugs (list was seeded once and users add their
// own), so match by id OR name.
function isRunHabit(h: HabitData): boolean {
  return h.id === 'run' || h.id === 'ran' || /\brun/i.test(h.name);
}

function isExerciseHabit(h: HabitData): boolean {
  return h.id === 'exercise' || /exercise|work\s?out|lift|gym|train/i.test(h.name);
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

    const today = getTodayEST();
    const todaysActivities = activities.filter((a) => a.start_date_local.slice(0, 10) === today);
    const hasRunToday = todaysActivities.some((a) => RUN_SPORTS.has(a.sport_type));
    const hasAnyToday = todaysActivities.length > 0;

    const completedHabits: { id: string; name: string; icon: string }[] = [];

    if (hasAnyToday) {
      const redis = await getRedisClient();
      const key = `habits_data:${userId}:${today}`;
      const stored = await redis.get(key);
      if (stored) {
        const habits: HabitData[] = JSON.parse(stored);
        for (const h of habits) {
          if (h.completedToday) continue;
          const matches = (isExerciseHabit(h) && hasAnyToday) || (isRunHabit(h) && hasRunToday);
          if (matches) {
            h.completedToday = true;
            h.streak = streakWith(true, h.history);
            completedHabits.push({ id: h.id, name: h.name, icon: h.icon });
          }
        }
        if (completedHabits.length > 0) {
          await redis.set(key, JSON.stringify(habits));
        }
      }
    }

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
