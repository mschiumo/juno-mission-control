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
  // Local datetime (TZID in prop name or no suffix) — treat as local
  const y = +value.slice(0, 4);
  const mo = +value.slice(4, 6) - 1;
  const d = +value.slice(6, 8);
  const h = +value.slice(9, 11);
  const mi = +value.slice(11, 13);
  const s = +value.slice(13, 15);
  void propName;
  return new Date(y, mo, d, h, mi, s);
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
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

export async function GET() {
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

    // Filter to today only
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const todayEvents = events
      .filter(e => {
        const s = new Date(e.start);
        const en = new Date(e.end);
        return s <= todayEnd && en >= todayStart;
      })
      .sort((a, b) => {
        // All-day events first, then chronological
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

    return NextResponse.json({
      success: true,
      data: todayEvents,
      count: todayEvents.length,
      date: todayStart.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
