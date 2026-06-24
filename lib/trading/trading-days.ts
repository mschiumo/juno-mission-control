/**
 * Client-safe trading-day helpers (EST, holiday-aware).
 *
 * Kept separate from lib/cron-helpers.ts (which imports node-redis) so it can be
 * imported into client components — the goal create form previews "N trading
 * days" in the browser — without pulling server-only modules into the bundle.
 *
 * US_MARKET_HOLIDAYS here is the single source of truth for the whole app;
 * lib/cron-helpers.ts re-exports it. Add new years from the official NYSE
 * calendar (nyse.com/markets/hours-calendars), using the observed date when a
 * holiday falls on a weekend.
 */

// US market holidays — full-day NYSE/Nasdaq closures (observed dates).
export const US_MARKET_HOLIDAYS = [
  // 2026
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
  // 2027
  '2027-01-01', // New Year's Day
  '2027-01-18', // Martin Luther King Jr. Day
  '2027-02-15', // Presidents' Day
  '2027-03-26', // Good Friday
  '2027-05-31', // Memorial Day
  '2027-06-18', // Juneteenth (observed)
  '2027-07-05', // Independence Day (observed)
  '2027-09-06', // Labor Day
  '2027-11-25', // Thanksgiving
  '2027-12-24', // Christmas Day (observed)
  // 2028
  '2028-01-17', // Martin Luther King Jr. Day
  '2028-02-21', // Presidents' Day
  '2028-04-14', // Good Friday
  '2028-05-29', // Memorial Day
  '2028-06-19', // Juneteenth
  '2028-07-04', // Independence Day
  '2028-09-04', // Labor Day
  '2028-11-23', // Thanksgiving
  '2028-12-25', // Christmas Day
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
