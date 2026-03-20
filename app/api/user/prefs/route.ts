import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';

interface UserPrefs {
  calendarUrl: string | null;
}

async function getPrefs(userId: string): Promise<UserPrefs> {
  const redis = await getRedisClient();
  const raw = await redis.get(`user:prefs:${userId}`);
  if (!raw) return { calendarUrl: null };
  try {
    return JSON.parse(raw as string) as UserPrefs;
  } catch {
    return { calendarUrl: null };
  }
}

async function savePrefs(userId: string, prefs: UserPrefs): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(`user:prefs:${userId}`, JSON.stringify(prefs));
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const prefs = await getPrefs(userId);
  return NextResponse.json({ success: true, prefs });
}

export async function POST(request: Request) {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  let body: { calendarUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.calendarUrl !== 'string' || !body.calendarUrl.trim()) {
    return NextResponse.json({ success: false, error: 'calendarUrl is required' }, { status: 400 });
  }

  const existing = await getPrefs(userId);
  await savePrefs(userId, { ...existing, calendarUrl: body.calendarUrl.trim() });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const existing = await getPrefs(userId);
  await savePrefs(userId, { ...existing, calendarUrl: null });

  return NextResponse.json({ success: true });
}
