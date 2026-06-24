/**
 * Date utilities for EST (America/New_York) timezone handling
 * All dates are stored with -05:00 offset to ensure consistency
 */

const EST_TIMEZONE = 'America/New_York';
const EST_OFFSET = '-05:00';

/**
 * Get current date/time in EST as ISO string with -05:00 offset
 * Use this instead of new Date().toISOString() which returns UTC
 */
export function getNowInEST(): string {
  const now = new Date();
  const estDateStr = now.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse MM/DD/YYYY, HH:MM:SS format
  const [datePart, timePart] = estDateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}${EST_OFFSET}`;
}

/**
 * Get current date in EST as YYYY-MM-DD string
 */
export function getTodayInEST(): string {
  const now = new Date();
  const estDateStr = now.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [month, day, year] = estDateStr.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in EST as HH:MM:SS string
 */
export function getCurrentTimeInEST(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: EST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Convert a date string to EST ISO format with -05:00 offset
 * Handles various input formats
 */
export function toESTISOString(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) {
    return getNowInEST();
  }
  
  const estDateStr = date.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const [datePart, timePart] = estDateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}${EST_OFFSET}`;
}

/**
 * Extract date portion (YYYY-MM-DD) from an EST ISO timestamp
 */
export function getESTDateFromTimestamp(isoTimestamp: string): string {
  // If it already has the date in YYYY-MM-DD format at the start, extract it
  const match = isoTimestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return match[0];
  }
  
  // Otherwise parse and convert
  return toESTISOString(isoTimestamp).split('T')[0];
}

/**
 * Parse a date string that might be in various formats and convert to EST
 * Returns YYYY-MM-DD string
 */
export function parseDateToEST(dateStr: string): string {
  // If already in YYYY-MM-DD format, assume it's correct
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return getTodayInEST();
  }
  
  const estDateStr = date.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [month, day, year] = estDateStr.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Create start of day timestamp in EST for a given date string
 */
export function getStartOfDayEST(dateStr: string): string {
  const parsed = parseDateToEST(dateStr);
  return `${parsed}T00:00:00${EST_OFFSET}`;
}

/**
 * Create end of day timestamp in EST for a given date string
 */
export function getEndOfDayEST(dateStr: string): string {
  const parsed = parseDateToEST(dateStr);
  return `${parsed}T23:59:59${EST_OFFSET}`;
}

/**
 * Format a date for display in EST
 */
export function formatDateForDisplay(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  });
}

/**
 * Format time for display in EST
 */
export function formatTimeForDisplay(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    timeZone: EST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Period keys for recurring items (EST-aware, DST-immune)
//
// Keys derive from the EST *calendar day* (getTodayInEST), never from a raw
// timestamp, so daylight-saving transitions cannot shift which period a date
// falls in. Weeks are ISO-8601 (Monday start; week 1 holds the year's first
// Thursday). NOTE: do NOT use the getPeriodKey copies in the journal API routes
// (app/api/journal-insights, personal-journal-report) — those use UTC
// `new Date()` and non-ISO week math.
// ────────────────────────────────────────────────────────────────────────────

export type PeriodRecurrence = 'daily' | 'weekly' | 'monthly';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO-8601 week key (e.g. "2026-W26") for a 1-based calendar Y/M/D. */
export function isoWeekKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7; // Sunday 0 -> 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // move to the Thursday of this week
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${pad2(weekNo)}`;
}

/** Monday (UTC Date) that begins a given ISO week key ("YYYY-Www"). */
function isoWeekToMonday(weekKey: string): Date {
  const [yStr, wStr] = weekKey.split('-W');
  const isoYear = Number(yStr);
  const week = Number(wStr);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)); // Jan 4 is always in ISO week 1
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  return monday;
}

/** Period key for a recurrence cadence. Defaults to today (EST). */
export function getPeriodKey(recurrence: PeriodRecurrence, date?: string): string {
  const ymd = date ?? getTodayInEST(); // 'YYYY-MM-DD' EST calendar day
  const [y, m, d] = ymd.split('-').map(Number);
  if (recurrence === 'daily') return ymd;
  if (recurrence === 'monthly') return `${y}-${pad2(m)}`;
  return isoWeekKey(y, m, d);
}

/** The period key immediately before `key`, for streak-adjacency checks. */
export function previousPeriodKey(recurrence: PeriodRecurrence, key: string): string {
  if (recurrence === 'daily') {
    const [y, m, d] = key.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`;
  }
  if (recurrence === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, 1));
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}`;
  }
  const monday = isoWeekToMonday(key);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return isoWeekKey(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}
