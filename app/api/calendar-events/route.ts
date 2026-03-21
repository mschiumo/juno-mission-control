import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  color: string;
}

// iCal lines can be "folded" — continuation lines start with a space or tab
function unfold(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter(Boolean);
}

function parseICalDate(value: string, propName: string): Date {
  // All-day: DTSTART;VALUE=DATE:YYYYMMDD  or DTSTART:YYYYMMDD
  if (!value.includes('T')) {
    const y = +value.slice(0, 4);
    const m = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    return new Date(y, m, d, 0, 0, 0);
  }
  // UTC datetime: ends with Z
  if (value.endsWith('Z')) {
    const iso = value.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z'
    );
    return new Date(iso);
  }
  // Local datetime with optional TZID (e.g. DTSTART;TZID=America/New_York:20260320T090000)
  const tzid = propName.match(/TZID=([^;:]+)/)?.[1];
  const localIso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;

  if (tzid) {
    // Convert local time in the given TZID to a UTC Date.
    // Trick: treat localIso as UTC to get a starting point, then compute the
    // real UTC offset of that timezone at that moment and adjust.
    const utcGuess = new Date(localIso + 'Z');
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tzid,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(utcGuess);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return new Date(utcGuess.getTime() + (utcGuess.getTime() - tzAsUtc));
  }

  // No TZID — fall back to treating as UTC (common for floating times in exported iCal)
  return new Date(localIso + 'Z');
}

function isAllDay(propName: string, value: string): boolean {
  return propName.includes('VALUE=DATE') || !value.includes('T');
}

function colorForTitle(title: string): string {
  const t = title.toLowerCase();
  if (/lift|workout|gym|run|exercise|sport/.test(t)) return '#238636';
  if (/trading|market|stock|invest/.test(t)) return '#ff6b35';
  if (/lab|doctor|medical|dentist|appt|appointment/.test(t)) return '#d29922';
  if (/meet|call|zoom|standup|sync|interview/.test(t)) return '#1f6feb';
  if (/birthday|anniversary|party|celebrat/.test(t)) return '#bc8cff';
  return '#ff6b35';
}

function unescape(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}

// Return a day's start/end as UTC ms, computed in the caller's IANA timezone.
// Accepts an optional YYYY-MM-DD dateStr; defaults to today.
// Prevents Vercel's UTC server clock from shifting the date relative to the user.
function getDayBoundsForTz(tz: string, dateStr?: string): { dayStart: number; dayEnd: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  let year: number, month0: number, day: number, utcOffsetMs: number;

  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    year = y; month0 = m - 1; day = d;
    // Use noon UTC of the target date to compute a DST-correct offset for that day
    const noonApprox = new Date(Date.UTC(year, month0, day, 12, 0, 0));
    const parts = fmt.formatToParts(noonApprox);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    const tzNoonMs = new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')).getTime();
    utcOffsetMs = tzNoonMs - noonApprox.getTime();
  } else {
    const now = new Date();
    const parts = fmt.formatToParts(now);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
    year = get('year'); month0 = get('month') - 1; day = get('day');
    const tzNowMs = new Date(year, month0, day, get('hour'), get('minute'), get('second')).getTime();
    utcOffsetMs = tzNowMs - now.getTime();
  }

  const dayStart = new Date(year, month0, day, 0, 0, 0).getTime() - utcOffsetMs;
  const dayEnd   = new Date(year, month0, day, 23, 59, 59, 999).getTime() - utcOffsetMs;

  return { dayStart, dayEnd };
}

export async function GET(request: Request) {
  // Authenticate user
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  // Load the user's calendar URL from Redis
  const redis = await getRedisClient();
  const prefsRaw = await redis.get(`user:prefs:${userId}`);
  let calendarUrl: string | null = null;
  if (prefsRaw) {
    try {
      const prefs = JSON.parse(prefsRaw as string);
      calendarUrl = prefs.calendarUrl ?? null;
    } catch {
      calendarUrl = null;
    }
  }

  // No calendar configured — return empty state signal
  if (!calendarUrl) {
    return NextResponse.json({ success: true, events: [], noCalendar: true });
  }

  const { searchParams } = new URL(request.url);
  const tz = searchParams.get('tz') ?? 'America/New_York';
  const dateStr = searchParams.get('date') ?? undefined;

  try {
    const res = await fetch(calendarUrl, {
      headers: { 'User-Agent': 'JunoMissionControl/1.0', Accept: 'text/calendar' },
      next: { revalidate: 300 }, // cache 5 minutes server-side
    });

    if (!res.ok) {
      throw new Error(`iCal fetch failed: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const lines = unfold(text);

    type RawEvent = CalendarEvent & { hasRecurrenceId: boolean };
    const events: RawEvent[] = [];
    let inEvent = false;
    let props: Record<string, string> = {};

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        props = {};
        continue;
      }
      if (line === 'END:VEVENT') {
        inEvent = false;

        const startKey = Object.keys(props).find(k => k.startsWith('DTSTART')) ?? '';
        const endKey = Object.keys(props).find(k => k.startsWith('DTEND')) ?? '';
        const startVal = props[startKey] ?? '';
        const endVal = props[endKey] ?? '';

        if (!startVal) continue;

        const startDate = parseICalDate(startVal, startKey);
        const endDate = endVal ? parseICalDate(endVal, endKey) : startDate;
        const allDay = isAllDay(startKey, startVal);
        const title = unescape(props['SUMMARY'] ?? 'Untitled');
        const hasRecurrenceId = Object.keys(props).some(k => k.startsWith('RECURRENCE-ID'));

        events.push({
          id: props['UID'] ?? `${startVal}-${title}`,
          title,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          allDay,
          location: unescape(props['LOCATION'] ?? ''),
          description: unescape(props['DESCRIPTION'] ?? ''),
          color: colorForTitle(title),
          hasRecurrenceId,
        });
        continue;
      }

      if (!inEvent) continue;

      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const key = line.slice(0, colon);
      const val = line.slice(colon + 1);
      props[key] = val;
    }

    // Filter to the requested day, using the caller's timezone
    const { dayStart, dayEnd } = getDayBoundsForTz(tz, dateStr);

    const todayRaw = events.filter(e => {
      const s = new Date(e.start).getTime();
      const en = new Date(e.end).getTime();
      return s <= dayEnd && en >= dayStart;
    });

    // Deduplicate by UID: when a recurring event has both a master VEVENT
    // (RRULE, DTSTART = today) and a specific exception (RECURRENCE-ID = today),
    // both pass the filter. Keep only the exception; fall back to master if none.
    const byUid = new Map<string, RawEvent>();
    for (const e of todayRaw) {
      const existing = byUid.get(e.id);
      if (!existing || (!existing.hasRecurrenceId && e.hasRecurrenceId)) {
        byUid.set(e.id, e);
      }
    }

    const todayEvents = [...byUid.values()]
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

    return NextResponse.json({
      success: true,
      data: todayEvents,
      count: todayEvents.length,
      date: new Date(dayStart).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
