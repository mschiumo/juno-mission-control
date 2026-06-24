/**
 * Client-safe trading-day helpers (EST, holiday-aware).
 *
 * Kept separate from lib/cron-helpers.ts (which imports node-redis) so it can be
 * imported into client components — the goal create form previews "N trading
 * days" in the browser — without pulling server-only modules into the bundle.
 *
 * NOTE: US_MARKET_HOLIDAYS mirrors the list in lib/cron-helpers.ts. Keep the two
 * in sync when adding a new year of holidays.
 */

// US market holidays (full-day closures).
export const US_MARKET_HOLIDAYS = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas Day
];

const HOLIDAYS = new Set(US_MARKET_HOLIDAYS);

/** Weekday of a YYYY-MM-DD date, timezone-stable via UTC noon. 0=Sun … 6=Sat. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/** A weekday that is not a market holiday. */
export function isTradingDay(dateStr: string): boolean {
  const d = weekdayOf(dateStr);
  if (d === 0 || d === 6) return false;
  return !HOLIDAYS.has(dateStr);
}

/** Add `days` to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive count of trading days between two YYYY-MM-DD dates. */
export function countTradingDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr || endStr < startStr) return 0;
  let count = 0;
  let cur = startStr;
  let guard = 0;
  while (cur <= endStr && guard < 4000) {
    if (isTradingDay(cur)) count++;
    cur = addDays(cur, 1);
    guard++;
  }
  return count;
}

/** The trading-day date strings (YYYY-MM-DD) within an inclusive range. */
export function tradingDaysInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  if (!startStr || !endStr || endStr < startStr) return out;
  let cur = startStr;
  let guard = 0;
  while (cur <= endStr && guard < 4000) {
    if (isTradingDay(cur)) out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}
