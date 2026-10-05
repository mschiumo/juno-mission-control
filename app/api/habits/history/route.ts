import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { getTodayInEST } from '@/lib/date-utils';
import { shiftDate } from '@/lib/habit-frequency';
import { dateSpan, type DayHabit, type HistoryDays } from '@/lib/habit-progress';

// GET — raw per-day habit records for the Habits → Progress modal. All the
// scoring happens client-side in lib/habit-progress.ts; this only reads the
// day keys in one round trip and strips them to what the math needs.
//
// The window covers the longest range (6M or YTD) plus its comparison window
// and a month of padding so periods straddling the range start score fully.

const LOOKBACK_DAYS = 400;

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const today = getTodayInEST();
    const dates = dateSpan(shiftDate(today, -LOOKBACK_DAYS), today);
    const values = await redis.mGet(dates.map((d) => `habits_data:${userId}:${d}`));

    const days: HistoryDays = {};
    dates.forEach((date, i) => {
      const raw = values[i];
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { id: string; completedToday?: boolean; skippedToday?: boolean; paused?: boolean }[];
        if (!Array.isArray(parsed)) return;
        days[date] = parsed.map((h): DayHabit => ({
          id: h.id,
          completed: !!h.completedToday,
          skipped: !h.completedToday && !!h.skippedToday,
          paused: !!h.paused,
        }));
      } catch {
        /* malformed day — treated as no record */
      }
    });

    return NextResponse.json({ success: true, today, days });
  } catch (err) {
    console.error('Habit history error:', err);
    return NextResponse.json({ success: false, error: 'Failed to load habit history' }, { status: 500 });
  }
}
