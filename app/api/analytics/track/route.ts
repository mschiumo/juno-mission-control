import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  recordUsageEvents,
  sanitizeField,
  MAX_EVENTS_PER_BATCH,
  type UsageEventInput,
} from '@/lib/db/usage-analytics';

/**
 * Usage-event ingest. Deliberately session-optional (middleware bypasses it):
 * logged-out landing-page visits must count too. Anonymous visitors send a
 * self-generated id; authenticated visitors are keyed by their user id, which
 * is taken from the session — never from the payload — so a visitor can't
 * impersonate another user's activity.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { visitor?: unknown; events?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ success: false, error: 'No events' }, { status: 400 });
  }
  if (body.events.length > MAX_EVENTS_PER_BATCH) {
    return NextResponse.json({ success: false, error: 'Too many events' }, { status: 400 });
  }

  const events: UsageEventInput[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== 'object') continue;
    const { type, page, label } = raw as Record<string, unknown>;
    const cleanPage = sanitizeField(page);
    if (!cleanPage) continue;
    if (type === 'pageview') {
      events.push({ type, page: cleanPage });
    } else if (type === 'click') {
      const cleanLabel = sanitizeField(label);
      if (cleanLabel) events.push({ type, page: cleanPage, label: cleanLabel });
    }
  }
  if (events.length === 0) {
    return NextResponse.json({ success: false, error: 'No valid events' }, { status: 400 });
  }

  const session = await auth();
  const anonId =
    typeof body.visitor === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.visitor)
      ? body.visitor
      : 'unknown';
  const visitor = session?.user?.id ? `u:${session.user.id}` : `a:${anonId}`;

  await recordUsageEvents(visitor, events);
  return NextResponse.json({ success: true });
}
