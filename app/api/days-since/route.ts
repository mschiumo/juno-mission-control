import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getTodayInEST } from '@/lib/date-utils';
import { randomUUID } from 'crypto';

// Days Since — owner-only list of independent counters (e.g. "Days since last
// rule break"), stored as one JSON array under days-since:${userId}. Each
// item's day count is derived from its startDate (EST) so it increments
// automatically; each item keeps its own longest-streak record.

export interface DaysSinceItem {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD (EST) — day the counter was started/last reset
  // Longest run ever recorded for this counter, in days. Captured at reset time
  // (the run that just ended) so it survives startDate moving to today, and
  // editable by hand via PATCH. The UI shows max(longestStreak, current run).
  longestStreak: number;
  createdAt: string;
  updatedAt: string;
}

// Shape stored before the card supported multiple items (PR #617 and earlier).
interface LegacySingleCounter {
  title: string;
  startDate: string;
  longestStreak?: number;
  createdAt: string;
  updatedAt: string;
}

function daysSinceKey(userId: string) {
  return `days-since:${userId}`;
}

// Whole days elapsed from startDate (YYYY-MM-DD) to today (EST). Mirrors the
// client-side daysSince() in components/DaysSinceCard.tsx.
function daysSince(startDate: string, today: string): number {
  const a = new Date(startDate + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function normalizeLongest(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

async function writeItems(userId: string, items: DaysSinceItem[]) {
  const redis = await getRedisClient();
  await redis.set(daysSinceKey(userId), JSON.stringify(items));
}

// Reads the list, transparently upgrading a legacy single-counter blob into a
// one-item list (and persisting it so the generated id stays stable).
async function readItems(userId: string): Promise<DaysSinceItem[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(daysSinceKey(userId));
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return (parsed as DaysSinceItem[]).map((item) => ({
      ...item,
      longestStreak: normalizeLongest(item.longestStreak),
    }));
  }

  if (parsed && typeof parsed === 'object' && typeof (parsed as LegacySingleCounter).title === 'string') {
    const legacy = parsed as LegacySingleCounter;
    const migrated: DaysSinceItem = {
      id: randomUUID(),
      title: legacy.title,
      startDate: legacy.startDate,
      longestStreak: normalizeLongest(legacy.longestStreak),
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
    };
    await writeItems(userId, [migrated]);
    return [migrated];
  }

  return [];
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function serverError(context: string, error: unknown) {
  console.error(`Error ${context} days-since:`, error);
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : `Failed ${context}` },
    { status: 500 },
  );
}

// GET — list all counters (oldest first)
export async function GET() {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const items = await readItems(userId);
    return NextResponse.json({ success: true, items });
  } catch (error) {
    return serverError('fetching', error);
  }
}

// POST — add a new counter. Body: { title: string }
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const body = await request.json();
    const title: string = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return fail('Title is required', 400);

    const now = new Date().toISOString();
    const item: DaysSinceItem = {
      id: randomUUID(),
      title,
      startDate: getTodayInEST(),
      longestStreak: 0,
      createdAt: now,
      updatedAt: now,
    };

    const items = await readItems(userId);
    items.push(item);
    await writeItems(userId, items);

    return NextResponse.json({ success: true, item, items });
  } catch (error) {
    return serverError('creating', error);
  }
}

// PATCH — update one counter: rename, reset to 0, and/or set its record by hand.
// Body: { id: string, title?: string, reset?: boolean, longestStreak?: number }
export async function PATCH(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const body = await request.json();
    const id: string = typeof body.id === 'string' ? body.id : '';
    if (!id) return fail('Item id is required', 400);

    const items = await readItems(userId);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return fail('Item not found', 404);
    const existing = items[index];

    const title: string = typeof body.title === 'string' ? body.title.trim() : '';
    const reset: boolean = body.reset === true;
    const today = getTodayInEST();

    // A reset closes out the current run: it becomes the record if it beat the
    // old one. A manual longestStreak value overrides whatever that math says.
    const endingRun = reset ? daysSince(existing.startDate, today) : 0;
    let longestStreak = Math.max(existing.longestStreak, endingRun);
    if (body.longestStreak !== undefined && body.longestStreak !== null) {
      const manual = Number(body.longestStreak);
      if (!Number.isFinite(manual) || manual < 0) {
        return fail('longestStreak must be a non-negative number', 400);
      }
      longestStreak = Math.floor(manual);
    }

    const updated: DaysSinceItem = {
      ...existing,
      title: title || existing.title,
      startDate: reset ? today : existing.startDate,
      longestStreak,
      updatedAt: new Date().toISOString(),
    };
    items[index] = updated;
    await writeItems(userId, items);

    return NextResponse.json({ success: true, item: updated, items });
  } catch (error) {
    return serverError('updating', error);
  }
}

// DELETE — remove a counter by id (?id=)
export async function DELETE(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail('Item id is required', 400);

    const items = await readItems(userId);
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return fail('Item not found', 404);
    await writeItems(userId, next);

    return NextResponse.json({ success: true, items: next });
  } catch (error) {
    return serverError('deleting', error);
  }
}
