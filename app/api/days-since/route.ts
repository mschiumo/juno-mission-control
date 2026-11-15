import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getTodayInEST } from '@/lib/date-utils';

// Days Since — a single owner-only counter (e.g. "Days since last rule break"),
// stored as one JSON blob under days-since:${userId}. The day count is derived
// from startDate (EST) so it increments automatically each day.

export interface DaysSinceCounter {
  title: string;
  startDate: string; // YYYY-MM-DD (EST) — day the counter was started/last reset
  // Longest run ever recorded for this counter, in days. Captured at reset time
  // (the run that just ended) so it survives the startDate being moved to today.
  // Absent on counters created before this field existed — treat as 0; the UI
  // shows max(longestStreak, current run) so the live run is always counted.
  longestStreak?: number;
  createdAt: string;
  updatedAt: string;
}

// Whole days elapsed from startDate (YYYY-MM-DD) to today (EST). Mirrors the
// client-side daysSince() in components/DaysSinceCard.tsx.
function daysSince(startDate: string, today: string): number {
  const a = new Date(startDate + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function daysSinceKey(userId: string) {
  return `days-since:${userId}`;
}

async function readCounter(userId: string): Promise<DaysSinceCounter | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(daysSinceKey(userId));
  return raw ? (JSON.parse(raw) as DaysSinceCounter) : null;
}

async function writeCounter(userId: string, counter: DaysSinceCounter) {
  const redis = await getRedisClient();
  await redis.set(daysSinceKey(userId), JSON.stringify(counter));
}

// GET — fetch the counter (null if not set up yet)
export async function GET() {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const counter = await readCounter(userId);
    return NextResponse.json({ success: true, counter });
  } catch (error) {
    console.error('Error fetching days-since counter:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch counter' },
      { status: 500 },
    );
  }
}

// POST — create the counter, rename it, or reset it to 0.
// Body: { title?: string, reset?: boolean }
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const body = await request.json();
    const title: string = typeof body.title === 'string' ? body.title.trim() : '';
    const reset: boolean = body.reset === true;

    const existing = await readCounter(userId);
    const now = new Date().toISOString();
    const today = getTodayInEST();

    if (!existing) {
      if (!title) {
        return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
      }
      const counter: DaysSinceCounter = { title, startDate: today, createdAt: now, updatedAt: now };
      await writeCounter(userId, counter);
      return NextResponse.json({ success: true, counter });
    }

    // On reset, the run that just ended becomes the historic record if it beat
    // the previous one. Renames leave the record untouched.
    const endingRun = reset ? daysSince(existing.startDate, today) : 0;
    const longestStreak = Math.max(existing.longestStreak ?? 0, endingRun);

    const counter: DaysSinceCounter = {
      ...existing,
      title: title || existing.title,
      startDate: reset ? today : existing.startDate,
      longestStreak,
      updatedAt: now,
    };
    await writeCounter(userId, counter);
    return NextResponse.json({ success: true, counter });
  } catch (error) {
    console.error('Error updating days-since counter:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update counter' },
      { status: 500 },
    );
  }
}
