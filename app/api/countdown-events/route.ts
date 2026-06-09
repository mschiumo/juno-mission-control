import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import { randomUUID } from 'crypto';

// Countdown events — a simple per-user list of upcoming deadlines, stored as a
// single JSON array under countdown-events:${userId}.

export interface CountdownLabel {
  type: 'emoji' | 'color';
  value: string;
}

export interface CountdownEvent {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  label: CountdownLabel;
  createdAt: string;
}

function countdownKey(userId: string) {
  return `countdown-events:${userId}`;
}

async function readEvents(userId: string): Promise<CountdownEvent[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(countdownKey(userId));
  return raw ? (JSON.parse(raw) as CountdownEvent[]) : [];
}

async function writeEvents(userId: string, events: CountdownEvent[]) {
  const redis = await getRedisClient();
  await redis.set(countdownKey(userId), JSON.stringify(events));
}

// GET — list all events (sorted soonest-first)
export async function GET() {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const events = await readEvents(userId);
    events.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error('Error fetching countdown events:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 },
    );
  }
}

// POST — add a new event
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const body = await request.json();
    const title: string = (body.title || '').trim();
    const dueDate: string = body.dueDate || '';
    const label: CountdownLabel = body.label || { type: 'emoji', value: '🎯' };

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ success: false, error: 'A valid due date is required' }, { status: 400 });
    }

    const event: CountdownEvent = {
      id: randomUUID(),
      title,
      dueDate,
      label: label.type === 'color' || label.type === 'emoji' ? label : { type: 'emoji', value: '🎯' },
      createdAt: new Date().toISOString(),
    };

    const events = await readEvents(userId);
    events.push(event);
    await writeEvents(userId, events);

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error('Error creating countdown event:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create event' },
      { status: 500 },
    );
  }
}

// DELETE — remove an event by id (?id=)
export async function DELETE(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Event id is required' }, { status: 400 });
    }

    const events = await readEvents(userId);
    const next = events.filter((e) => e.id !== id);
    await writeEvents(userId, next);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting countdown event:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete event' },
      { status: 500 },
    );
  }
}
