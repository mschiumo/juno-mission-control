// Pure aggregation helpers for the Fitness Progress modal — month / week /
// sport / weekday breakdowns, streaks, and all-time-in-window records over a
// long Strava history. Dependency-free like strava-metrics.ts.

import {
  type ActivitySummary, RUN_SPORTS, WALK_SPORTS, activityDate, mondayOf, metersToMiles, paceSecPerMile, speedMph,
} from './strava-metrics';

export type SportCategory = 'run' | 'ride' | 'walk' | 'strength' | 'other';
export type ProgressMetric = 'distance' | 'time' | 'count' | 'calories' | 'elevation';

/** Fixed stack/legend order — color follows the category, never its rank. */
export const CATEGORY_ORDER: SportCategory[] = ['run', 'ride', 'walk', 'strength', 'other'];

const STRENGTH_SPORTS = new Set([
  'WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining', 'Pilates', 'Yoga',
]);

export function sportCategory(sport: string): SportCategory {
  if (RUN_SPORTS.has(sport)) return 'run';
  if (WALK_SPORTS.has(sport)) return 'walk';
  if (sport.includes('Ride')) return 'ride';
  if (STRENGTH_SPORTS.has(sport)) return 'strength';
  return 'other';
}

export interface Totals {
  count: number;
  meters: number;
  seconds: number; // moving time
  calories: number;
  elevation: number; // meters
}

function emptyTotals(): Totals {
  return { count: 0, meters: 0, seconds: 0, calories: 0, elevation: 0 };
}

function addInto(t: Totals, a: ActivitySummary): void {
  t.count += 1;
  t.meters += a.distance || 0;
  t.seconds += a.moving_time || 0;
  t.calories += a.calories ?? 0;
  t.elevation += a.total_elevation_gain || 0;
}

export function totalsOf(activities: ActivitySummary[]): Totals {
  const t = emptyTotals();
  for (const a of activities) addInto(t, a);
  return t;
}

/** Display value of a metric: miles, hours, count, kcal, feet. */
export function metricValue(t: Totals, metric: ProgressMetric): number {
  switch (metric) {
    case 'distance': return metersToMiles(t.meters);
    case 'time': return t.seconds / 3600;
    case 'count': return t.count;
    case 'calories': return t.calories;
    case 'elevation': return t.elevation * 3.28084;
  }
}

/** Activities whose local date falls in [from, to] (inclusive, YYYY-MM-DD). */
export function inRange(activities: ActivitySummary[], from: string, to: string): ActivitySummary[] {
  return activities.filter((a) => {
    const d = activityDate(a);
    return d >= from && d <= to;
  });
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n, 12));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + n, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface Bucket {
  key: string; // YYYY-MM for months, Monday YYYY-MM-DD for weeks
  totals: Totals;
  byCategory: Record<SportCategory, Totals>;
}

function emptyBucket(key: string): Bucket {
  return {
    key,
    totals: emptyTotals(),
    byCategory: { run: emptyTotals(), ride: emptyTotals(), walk: emptyTotals(), strength: emptyTotals(), other: emptyTotals() },
  };
}

/** One bucket per calendar month from `fromMonth` to `toMonth` (YYYY-MM, inclusive). */
export function monthlyBuckets(activities: ActivitySummary[], fromMonth: string, toMonth: string): Bucket[] {
  const buckets: Bucket[] = [];
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) buckets.push(emptyBucket(m));
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const a of activities) {
    const b = byKey.get(activityDate(a).slice(0, 7));
    if (!b) continue;
    addInto(b.totals, a);
    addInto(b.byCategory[sportCategory(a.sport_type)], a);
  }
  return buckets;
}

/** One bucket per Monday-based week covering [from, to]. */
export function weeklyBuckets(activities: ActivitySummary[], from: string, to: string): Bucket[] {
  const buckets: Bucket[] = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) buckets.push(emptyBucket(w));
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const a of activities) {
    const d = activityDate(a);
    if (d < from || d > to) continue;
    const b = byKey.get(mondayOf(d));
    if (!b) continue;
    addInto(b.totals, a);
    addInto(b.byCategory[sportCategory(a.sport_type)], a);
  }
  return buckets;
}

export interface SportRow {
  sport: string;
  category: SportCategory;
  totals: Totals;
  avgPaceSecPerMile: number | null; // runs / walks
  avgMph: number | null; // rides
  avgHeartrate: number | null;
}

/** Per-sport_type breakdown, most frequent first. */
export function sportBreakdown(activities: ActivitySummary[]): SportRow[] {
  const groups = new Map<string, ActivitySummary[]>();
  for (const a of activities) {
    const list = groups.get(a.sport_type) ?? [];
    list.push(a);
    groups.set(a.sport_type, list);
  }
  const rows: SportRow[] = [];
  for (const [sport, list] of groups) {
    const totals = totalsOf(list);
    const category = sportCategory(sport);
    // Distance-weighted averages: only activities that actually moved count.
    let movingMeters = 0;
    let movingSeconds = 0;
    for (const a of list) {
      if (a.distance > 0 && a.moving_time > 0) {
        movingMeters += a.distance;
        movingSeconds += a.moving_time;
      }
    }
    const miles = metersToMiles(movingMeters);
    const hrList = list.filter((a) => a.average_heartrate);
    rows.push({
      sport,
      category,
      totals,
      avgPaceSecPerMile: (category === 'run' || category === 'walk') && miles >= 0.25 ? movingSeconds / miles : null,
      avgMph: category === 'ride' && movingSeconds > 0 ? miles / (movingSeconds / 3600) : null,
      avgHeartrate: hrList.length
        ? hrList.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / hrList.length
        : null,
    });
  }
  return rows.sort((a, b) => b.totals.count - a.totals.count || b.totals.seconds - a.totals.seconds);
}

/** Totals per weekday, Monday first (7 entries). */
export function weekdayTotals(activities: ActivitySummary[]): Totals[] {
  const days = Array.from({ length: 7 }, emptyTotals);
  for (const a of activities) {
    const [y, m, d] = activityDate(a).split('-').map(Number);
    const dow = (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
    addInto(days[dow], a);
  }
  return days;
}

export interface Consistency {
  activeDays: number;
  longestStreak: number; // consecutive active days
  currentStreak: number; // ending today (or yesterday, if today has nothing yet)
  activeWeeks: number;
  totalWeeks: number;
}

export function consistency(activities: ActivitySummary[], from: string, to: string): Consistency {
  const days = new Set(inRange(activities, from, to).map(activityDate));
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  let cursor = days.has(to) ? to : addDays(to, -1);
  while (days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  const weeks = new Set(sorted.map(mondayOf));
  let totalWeeks = 0;
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) totalWeeks += 1;
  return { activeDays: days.size, longestStreak: longest, currentStreak: current, activeWeeks: weeks.size, totalWeeks };
}

export interface ProgressRecord {
  id: string;
  label: string;
  activity: ActivitySummary;
  value: number; // raw — formatted by the caller per id
}

/**
 * Bests within the given activities. Runs/walks shorter than a quarter mile
 * are ignored for pace (GPS noise), and fastest pace requires ≥ 1 mile so a
 * sprint doesn't stand in for a real effort.
 */
export function progressRecords(activities: ActivitySummary[]): ProgressRecord[] {
  const out: ProgressRecord[] = [];
  const best = (
    id: string,
    label: string,
    pick: (a: ActivitySummary) => number | null,
    lowerIsBetter = false,
  ) => {
    let top: { a: ActivitySummary; v: number } | null = null;
    for (const a of activities) {
      const v = pick(a);
      if (v === null || !Number.isFinite(v) || v <= 0) continue;
      if (!top || (lowerIsBetter ? v < top.v : v > top.v)) top = { a, v };
    }
    if (top) out.push({ id, label, activity: top.a, value: top.v });
  };
  const isRun = (a: ActivitySummary) => sportCategory(a.sport_type) === 'run';
  const isRide = (a: ActivitySummary) => sportCategory(a.sport_type) === 'ride';
  best('fastestPace', 'Fastest run pace (≥1 mi)', (a) => (isRun(a) && metersToMiles(a.distance) >= 1 ? paceSecPerMile(a) : null), true);
  best('longestRun', 'Longest run', (a) => (isRun(a) ? a.distance : null));
  best('longestRide', 'Longest ride', (a) => (isRide(a) ? a.distance : null));
  best('fastestRide', 'Fastest ride (≥5 mi)', (a) => (isRide(a) && metersToMiles(a.distance) >= 5 ? speedMph(a) : null));
  best('longestSession', 'Longest session', (a) => a.moving_time);
  best('mostElevation', 'Most elevation', (a) => a.total_elevation_gain);
  best('mostCalories', 'Most calories', (a) => a.calories ?? null);
  return out;
}
