import { NextResponse } from 'next/server';

const ICAL_URL =
  'https://calendar.google.com/calendar/ical/mschiumo18%40gmail.com/public/basic.ics';

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

// Return today's start/end as UTC ms, computed in the caller's IANA timezone.
// Prevents Vercel's UTC server clock from shifting the date relative to the user.
function getTodayBoundsForTz(tz: string): { todayStart: number; todayEnd: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const year = get('year'), month = get('month') - 1, day = get('day');
  const hour = get('hour'), minute = get('minute'), second = get('second');

  // UTC offset: local-clock ms minus actual UTC ms
  const tzNowMs = new Date(year, month, day, hour, minute, second).getTime();
  const utcOffsetMs = tzNowMs - now.getTime();

  // Midnight and end-of-day in the target tz, as UTC timestamps
  const todayStart = new Date(year, month, day, 0, 0, 0).getTime() - utcOffsetMs;
  const todayEnd   = new Date(year, month, day, 23, 59, 59, 999).getTime() - utcOffsetMs;

  return { todayStart, todayEnd };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tz = searchParams.get('tz') ?? 'America/New_York';

  try {
    const res = await fetch(ICAL_URL, {
      headers: { 'User-Agent': 'JunoMissionControl/1.0', Accept: 'text/calendar' },
      next: { revalidate: 300 }, // cache 5 minutes server-side
    });

    if (!res.ok) {
      throw new Error(`iCal fetch failed: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const lines = unfold(text);

    const events: CalendarEvent[] = [];
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

        events.push({
          id: props['UID'] ?? `${startVal}-${title}`,
          title,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          allDay,
          location: unescape(props['LOCATION'] ?? ''),
          description: unescape(props['DESCRIPTION'] ?? ''),
          color: colorForTitle(title),
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

    // Filter to today only, using the caller's timezone
    const { todayStart, todayEnd } = getTodayBoundsForTz(tz);

    const todayEvents = events
      .filter(e => {
        const s = new Date(e.start).getTime();
        const en = new Date(e.end).getTime();
        return s <= todayEnd && en >= todayStart;
      })
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

    return NextResponse.json({
      success: true,
      data: todayEvents,
      count: todayEvents.length,
      date: new Date(todayStart).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
