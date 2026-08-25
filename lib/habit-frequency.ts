/**
 * Habit frequency + period math — the single source of truth for "is this
 * habit done for its period yet?".
 *
 * A habit is checked off day by day, but what counts is the *cumulative* total
 * inside its period:
 *   - weekly-cadence habits run Monday 00:00 → Sunday 23:59 (ET dates)
 *   - monthly-cadence habits run the 1st → the last day of the month
 *
 * Once the period's goal is met the habit reads as complete for the rest of
 * that period and resets when the next one starts. A `daily` habit therefore
 * only reads as fulfilled once all 7 days of the week are checked off, while a
 * `weekly` habit stays checked from the moment it's logged until Monday.
 *
 * Pure module (no Redis, no React) so client components, API routes and crons
 * can all share it. Dates are `YYYY-MM-DD` strings already resolved to ET by
 * the caller — all math here is calendar math on those strings, never a
 * timeZone-formatted re-parse (which breaks for viewers east of ET).
 */

export type HabitFrequency =
  | 'daily'
  | 'weekdays'
  | '6x'
  | '5x'
  | '4x'
  | '3x'
  | '2x'
  | 'weekly'
  | 'monthly';

export type HabitPeriod = 'week' | 'month';

/** Ordered for the picker: most demanding first, monthly last. */
export const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string; hint: string }[] = [
  { value: 'daily',    label: 'Daily',    hint: '7x per week' },
  { value: 'weekdays', label: 'Weekdays', hint: 'Mon–Fri' },
  { value: '6x',       label: '6x/wk',    hint: '6x per week' },
  { value: '5x',       label: '5x/wk',    hint: '5x per week' },
  { value: '4x',       label: '4x/wk',    hint: '4x per week' },
  { value: '3x',       label: '3x/wk',    hint: '3x per week' },
  { value: '2x',       label: '2x/wk',    hint: '2x per week' },
  { value: 'weekly',   label: 'Weekly',   hint: 'Once per week' },
  { value: 'monthly',  label: 'Monthly',  hint: 'Once per month' },
];

const ALL_FREQUENCIES = FREQUENCY_OPTIONS.map((o) => o.value);

export function isHabitFrequency(value: unknown): value is HabitFrequency {
  return typeof value === 'string' && (ALL_FREQUENCIES as string[]).includes(value);
}

/** Anything unrecognised (including legacy rows with no frequency) is daily. */
export function normalizeFrequency(value: unknown): HabitFrequency {
  return isHabitFrequency(value) ? value : 'daily';
}

/** Which calendar period this frequency's goal is counted over. */
export function frequencyPeriod(frequency: HabitFrequency | string | undefined): HabitPeriod {
  return normalizeFrequency(frequency) === 'monthly' ? 'month' : 'week';
}

/** Completions required inside the period to fulfil the habit. */
export function frequencyGoal(frequency: HabitFrequency | string | undefined): number {
  switch (normalizeFrequency(frequency)) {
    case 'weekdays': return 5;
    case '6x':       return 6;
    case '5x':       return 5;
    case '4x':       return 4;
    case '3x':       return 3;
    case '2x':       return 2;
    case 'weekly':   return 1;
    case 'monthly':  return 1;
    default:         return 7; // daily
  }
}

/** Short chip text, e.g. "5x/wk" · "Weekly" · "Monthly". */
export function frequencyLabel(frequency: HabitFrequency | string | undefined): string {
  const f = normalizeFrequency(frequency);
  return FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? 'Daily';
}

// ── Calendar helpers (YYYY-MM-DD string math, UTC-anchored) ────────────────

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `date` shifted by `days` (negative = backwards). */
export function shiftDate(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** The Monday of the week containing `date` (weeks run Mon → Sun). */
export function weekStartFor(date: string): string {
  const dow = parse(date).getUTCDay(); // 0 = Sunday
  return shiftDate(date, -(dow === 0 ? 6 : dow - 1));
}

/** The Sunday closing the week containing `date`. */
export function weekEndFor(date: string): string {
  return shiftDate(weekStartFor(date), 6);
}

/** The 1st of the month containing `date`. */
export function monthStartFor(date: string): string {
  return `${date.slice(0, 8)}01`;
}

/** First day of the period this frequency is counted over. */
export function periodStartFor(frequency: HabitFrequency | string | undefined, date: string): string {
  return frequencyPeriod(frequency) === 'month' ? monthStartFor(date) : weekStartFor(date);
}

/** Every date from `start` through `end`, inclusive. Empty when end < start. */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) {
    dates.push(d);
    if (dates.length > 366) break; // guard against a malformed range
  }
  return dates;
}

/** "Aug 18 – Aug 24, 2026" for a Mon–Sun week. */
export function weekRangeLabel(weekStart: string): string {
  const start = parse(weekStart);
  const end = parse(shiftDate(weekStart, 6));
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

// ── Period progress ────────────────────────────────────────────────────────

export interface PeriodProgress {
  /** 'week' or 'month' — which calendar period the goal is counted over. */
  periodType: HabitPeriod;
  /** First day of the current period (YYYY-MM-DD). */
  periodStart: string;
  /** Completions required in the period. */
  periodGoal: number;
  /** Completions logged so far this period (today included). */
  periodCompletions: number;
  /** True once `periodCompletions >= periodGoal` — stays checked until reset. */
  fulfilled: boolean;
}

/**
 * Progress for one habit, given the dates in its current period on which it was
 * checked off. `completedDates` may include dates outside the period — they're
 * ignored.
 */
export function periodProgress(
  frequency: HabitFrequency | string | undefined,
  today: string,
  completedDates: Iterable<string>
): PeriodProgress {
  const periodType = frequencyPeriod(frequency);
  const periodStart = periodStartFor(frequency, today);
  const periodGoal = frequencyGoal(frequency);

  let periodCompletions = 0;
  for (const date of completedDates) {
    if (date >= periodStart && date <= today) periodCompletions++;
  }

  return {
    periodType,
    periodStart,
    periodGoal,
    periodCompletions,
    fulfilled: periodCompletions >= periodGoal,
  };
}

/** How many days back a set of habits needs looking at to cover their periods. */
export function lookbackDays(frequencies: (HabitFrequency | string | undefined)[], today: string): number {
  let earliest = today;
  for (const f of frequencies) {
    const start = periodStartFor(f, today);
    if (start < earliest) earliest = start;
  }
  return datesBetween(earliest, today).length - 1;
}
