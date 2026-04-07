import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';

interface EmailAlertPrefs {
  marketBriefing: boolean;
  gapScanner: boolean;
}

interface UserPrefs {
  calendarUrl: string | null;
  tradingTourCompleted?: boolean;
  startingBalance?: number;
  emailAlerts?: EmailAlertPrefs;
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

  const url = body.calendarUrl.trim();

  // Validate protocol to prevent SSRF (reject file://, ftp://, internal IPs, etc.)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
  }
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    return NextResponse.json({ success: false, error: 'Only HTTPS/HTTP calendar URLs are allowed' }, { status: 400 });
  }
  // Block private/loopback IP ranges to prevent SSRF
  const hostname = parsedUrl.hostname;
  const privateRanges = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i;
  if (privateRanges.test(hostname)) {
    return NextResponse.json({ success: false, error: 'Private network URLs are not allowed' }, { status: 400 });
  }

  const isIcalUrl = url.includes('/ical/') || url.endsWith('.ics') || url.includes('ical=true');
  if (!isIcalUrl) {
    return NextResponse.json({
      success: false,
      error: 'Please use the iCal URL (ends in .ics). In Google Calendar: Settings → your calendar → "Integrate calendar" → copy "Public address in iCal format".'
    }, { status: 400 });
  }

  const existing = await getPrefs(userId);
  await savePrefs(userId, { ...existing, calendarUrl: url });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  let body: Partial<UserPrefs>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const existing = await getPrefs(userId);
  const updated: UserPrefs = { ...existing };

  if (typeof body.tradingTourCompleted === 'boolean') {
    updated.tradingTourCompleted = body.tradingTourCompleted;
  }

  if (typeof body.startingBalance === 'number' && body.startingBalance >= 0) {
    updated.startingBalance = body.startingBalance;
  }

  if (body.emailAlerts && typeof body.emailAlerts === 'object') {
    updated.emailAlerts = {
      marketBriefing: !!body.emailAlerts.marketBriefing,
      gapScanner: !!body.emailAlerts.gapScanner,
    };
  }

  await savePrefs(userId, updated);
  return NextResponse.json({ success: true, prefs: updated });
}

export async function DELETE() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const existing = await getPrefs(userId);
  await savePrefs(userId, { ...existing, calendarUrl: null });

  return NextResponse.json({ success: true });
}
