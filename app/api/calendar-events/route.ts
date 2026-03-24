import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { RRule, rrulestr } from 'rrule';

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

// Parsed VEVENT before recurrence expansion
interface ParsedVEvent {
  uid: string;
  title: string;
  startDate: Date;
  endDate: Date;
  durationMs: number;
  allDay: boolean;
  location: string;
  description: string;
  color: string;
  rrule: string | null;       // raw RRULE string
  exdates: Date[];            // EXDATE exclusions
  hasRecurrenceId: boolean;   // true if this is an exception instance
  startKey: string;           // original DTSTART property name (for TZID)
}

/**
 * Expand a recurring event into occurrences that fall within [windowStart, windowEnd].
 * Non-recurring events are returned as-is if they overlap the window.
 */
function expandEvent(
  ev: ParsedVEvent,
  windowStart: Date,
  windowEnd: Date,
): CalendarEvent[] {
  const results: CalendarEvent[] = [];

  if (!ev.rrule) {
    // Non-recurring: check simple overlap
    const s = ev.startDate.getTime();
    const e = ev.endDate.getTime();
    if (s <= windowEnd.getTime() && e >= windowStart.getTime()) {
      results.push({
        id: ev.uid,
        title: ev.title,
        start: ev.startDate.toISOString(),
        end: ev.endDate.toISOString(),
        allDay: ev.allDay,
        location: ev.location,
        description: ev.description,
        color: ev.color,
      });
    }
    return results;
  }

  // Build an RRule from the RRULE string + DTSTART
  try {
    // Extract TZID from original DTSTART property if present.
    // BYDAY rules (e.g. TU) must be evaluated in the event's local timezone,
    // otherwise an event at 9 PM ET on Tuesday (= 1 AM UTC Wednesday) would
    // be skipped by a BYDAY=TU rule evaluated in UTC.
    const tzid = ev.startKey.match(/TZID=([^;:]+)/)?.[1];

    let rule: InstanceType<typeof RRule>;

    if (tzid) {
      // Build RRule using local datetime components so BYDAY matches the
      // event's local day-of-week, then convert occurrences back to UTC.
      const localDt = toLocalComponents(ev.startDate, tzid);
      rule = rrulestr(
        `DTSTART;TZID=${tzid}:${localDt}\nRRULE:${ev.rrule}`,
        { tzid }
      );
    } else {
      const dtStartStr = formatDateForRRule(ev.startDate);
      rule = rrulestr(`DTSTART:${dtStartStr}\nRRULE:${ev.rrule}`);
    }

    // Get occurrences within a padded window (pad by 1 day to be safe with timezones)
    const padMs = 24 * 60 * 60 * 1000;
    const occurrences = rule.between(
      new Date(windowStart.getTime() - padMs),
      new Date(windowEnd.getTime() + padMs),
      true, // inclusive
    );

    // Build EXDATE set for quick lookup
    const exdateSet = new Set(ev.exdates.map(d => d.toISOString().slice(0, 10)));

    for (const occ of occurrences) {
      // rrule with TZID returns "local-looking" UTC dates — the numeric
      // components represent the local time but the Date object is in UTC.
      // Convert to a real UTC timestamp.
      const occUtc = tzid ? localFakeUtcToReal(occ, tzid) : occ;

      // Skip if excluded
      if (exdateSet.has(occUtc.toISOString().slice(0, 10))) continue;

      const occStart = occUtc;
      const occEnd = new Date(occUtc.getTime() + ev.durationMs);

      // Final overlap check against the actual window
      if (occStart.getTime() <= windowEnd.getTime() && occEnd.getTime() >= windowStart.getTime()) {
        results.push({
          id: `${ev.uid}_${occUtc.toISOString()}`,
          title: ev.title,
          start: occStart.toISOString(),
          end: occEnd.toISOString(),
          allDay: ev.allDay,
          location: ev.location,
          description: ev.description,
          color: ev.color,
        });
      }
    }
  } catch (err) {
    // If RRULE parsing fails, fall back to treating as non-recurring
    console.error(`Failed to parse RRULE for "${ev.title}":`, err);
    const s = ev.startDate.getTime();
    const e = ev.endDate.getTime();
    if (s <= windowEnd.getTime() && e >= windowStart.getTime()) {
      results.push({
        id: ev.uid,
        title: ev.title,
        start: ev.startDate.toISOString(),
        end: ev.endDate.toISOString(),
        allDay: ev.allDay,
        location: ev.location,
        description: ev.description,
        color: ev.color,
      });
    }
  }

  return results;
}

/** Format a Date as an iCal UTC datetime string for rrule parsing */
function formatDateForRRule(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Convert a UTC Date to local iCal datetime string (YYYYMMDDTHHMMSS) in a
 * given IANA timezone.  This is needed so rrule evaluates BYDAY in the
 * event's local timezone.
 */
function toLocalComponents(utcDate: Date, tzid: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

/**
 * The rrule library with TZID returns Date objects whose UTC components
 * actually represent the local time (fake-UTC).  Convert to a real UTC
 * timestamp by computing the timezone offset.
 */
function localFakeUtcToReal(fakeUtc: Date, tzid: string): Date {
  // fakeUtc.getUTCHours() etc. hold the local-time values.
  // We need to find the real UTC time that corresponds to those local values.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(fakeUtc);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = fakeUtc.getTime() - tzAsUtc;
  return new Date(fakeUtc.getTime() + offsetMs);
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
      headers: { 'User-Agent': 'ConfluenceTrading/1.0', Accept: 'text/calendar' },
      next: { revalidate: 300 }, // cache 5 minutes server-side
    });

    if (!res.ok) {
      throw new Error(`iCal fetch failed: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const lines = unfold(text);

    // ---------------------------------------------------------------
    // Phase 1: Parse all VEVENTs into ParsedVEvent objects
    // ---------------------------------------------------------------
    const masterEvents: ParsedVEvent[] = [];
    const exceptionEvents: CalendarEvent[] = []; // exception instances (RECURRENCE-ID)
    const exceptionUids = new Set<string>(); // UIDs that have exceptions on the target day

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
        const uid = props['UID'] ?? `${startVal}-${title}`;
        const hasRecurrenceId = Object.keys(props).some(k => k.startsWith('RECURRENCE-ID'));
        const rruleStr = props['RRULE'] ?? null;

        // Collect EXDATE values (comma-separated dates that should be excluded)
        const exdates: Date[] = [];
        for (const [k, v] of Object.entries(props)) {
          if (k.startsWith('EXDATE')) {
            for (const part of v.split(',')) {
              const trimmed = part.trim();
              if (trimmed) {
                try {
                  exdates.push(parseICalDate(trimmed, k));
                } catch { /* skip unparseable */ }
              }
            }
          }
        }

        const durationMs = endDate.getTime() - startDate.getTime();

        const parsed: ParsedVEvent = {
          uid,
          title,
          startDate,
          endDate,
          durationMs: durationMs > 0 ? durationMs : 3600000, // default 1h
          allDay,
          location: unescape(props['LOCATION'] ?? ''),
          description: unescape(props['DESCRIPTION'] ?? ''),
          color: colorForTitle(title),
          rrule: rruleStr,
          exdates,
          hasRecurrenceId,
          startKey,
        };

        if (hasRecurrenceId) {
          // This is an exception to a recurring event — store as a one-off
          exceptionEvents.push({
            id: `${uid}_exception_${startVal}`,
            title: parsed.title,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            allDay,
            location: parsed.location,
            description: parsed.description,
            color: parsed.color,
          });
        } else {
          masterEvents.push(parsed);
        }

        continue;
      }

      if (!inEvent) continue;

      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const key = line.slice(0, colon);
      const val = line.slice(colon + 1);
      props[key] = val;
    }

    // ---------------------------------------------------------------
    // Phase 2: Expand recurring events for the requested day
    // ---------------------------------------------------------------
    const { dayStart, dayEnd } = getDayBoundsForTz(tz, dateStr);
    const windowStartDate = new Date(dayStart);
    const windowEndDate = new Date(dayEnd);

    const allOccurrences: CalendarEvent[] = [];

    for (const ev of masterEvents) {
      const expanded = expandEvent(ev, windowStartDate, windowEndDate);
      allOccurrences.push(...expanded);
    }

    // Add exception events that fall on this day
    for (const ex of exceptionEvents) {
      const s = new Date(ex.start).getTime();
      const e = new Date(ex.end).getTime();
      if (s <= dayEnd && e >= dayStart) {
        allOccurrences.push(ex);
        // Track that this UID has an exception on this day
        const baseUid = ex.id.split('_exception_')[0];
        exceptionUids.add(baseUid);
      }
    }

    // ---------------------------------------------------------------
    // Phase 3: Deduplicate — if an exception exists for a UID on this
    // day, remove the master occurrence that was generated by RRULE
    // ---------------------------------------------------------------
    const deduped = allOccurrences.filter(e => {
      if (exceptionUids.size === 0) return true;
      // Exception events themselves should always be kept
      if (e.id.includes('_exception_')) return true;
      // For master occurrences, strip the timestamp suffix to get the base UID
      const baseUid = e.id.includes('_') ? e.id.slice(0, e.id.lastIndexOf('_')) : e.id;
      return !exceptionUids.has(baseUid);
    });

    // Sort: all-day first, then by start time
    const todayEvents = deduped.sort((a, b) => {
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
