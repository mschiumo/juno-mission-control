import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { fetchActivityHistory, attachCalories } from '@/lib/strava';

// GET — long-window activity history (24 months) for the Fitness Progress
// modal. ?refresh=1 bypasses the 30-minute history cache.

export const maxDuration = 60;

const HISTORY_MONTHS = 24;

/** Unix seconds for the 1st of the month HISTORY_MONTHS back (ET). Stable
 *  within a month, so it doubles as a cache key component. */
function historyStartSec(): number {
  const [y, m] = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' })
    .split('-')
    .map(Number);
  const start = new Date(Date.UTC(y, m - 1 - HISTORY_MONTHS, 1, 5)); // 00:00 EST
  return Math.floor(start.getTime() / 1000);
}

export async function GET(req: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const force = req.nextUrl.searchParams.get('refresh') === '1';

  try {
    let history;
    try {
      history = await fetchActivityHistory(userId, historyStartSec(), { force });
    } catch (err) {
      console.error('Strava history fetch error:', err);
      return NextResponse.json({ success: false, error: 'Strava API request failed' }, { status: 502 });
    }
    if (history === null) {
      return NextResponse.json({ success: true, connected: false, activities: [] });
    }

    // Calories live in a per-activity cache filled by the detail endpoint;
    // a long history backfills over a few opens (capped per request to stay
    // well inside Strava's rate limits).
    const { activities } = history;
    try {
      await attachCalories(userId, activities, 40);
    } catch (err) {
      console.error('attachCalories (history) failed:', err);
    }
    const caloriesPending = activities.filter((a) => a.calories === undefined).length;

    return NextResponse.json({
      success: true,
      connected: true,
      activities,
      fetchedAt: history.fetchedAt,
      caloriesPending,
    });
  } catch (err) {
    console.error('Strava history error:', err);
    return NextResponse.json({ success: false, error: 'Failed to load history' }, { status: 500 });
  }
}
