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
  createdAt: string;
  updatedAt: string;
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

    const counter: DaysSinceCounter = {
      ...existing,
      title: title || existing.title,
      startDate: reset ? today : existing.startDate,
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
