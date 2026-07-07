// Pure helpers for Strava activity metrics — kept dependency-free so they run
// client-side in FitnessCard and are trivially testable.

export interface ActivitySummary {
  id: number;
  name: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number;
  start_date_local: string; // ISO, athlete-local wall time
  achievement_count?: number; // segment + best-effort achievements
  pr_count?: number; // personal records set on this activity
}

export const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const WALK_SPORTS = new Set(['Walk', 'Hike']);
const METERS_PER_MILE = 1609.344;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function fmtMiles(meters: number): string {
  const miles = metersToMiles(meters);
  if (miles === 0) return '0 mi';
  return `${miles.toFixed(miles >= 100 ? 0 : 1)} mi`;
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Seconds-per-mile → "M:SS/mi". */
export function fmtPace(secPerMile: number): string {
  const m = Math.floor(secPerMile / 60);
  const s = Math.round(secPerMile % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

/** Average pace of an activity in seconds per mile, or null when unmeasurable. */
export function paceSecPerMile(a: ActivitySummary): number | null {
  if (!a.distance || !a.moving_time) return null;
  return a.moving_time / metersToMiles(a.distance);
}

/** Average speed in mph (for rides), or null when unmeasurable. */
export function speedMph(a: ActivitySummary): number | null {
  if (!a.distance || !a.moving_time) return null;
  return metersToMiles(a.distance) / (a.moving_time / 3600);
}

/** The date component (YYYY-MM-DD) of an activity's athlete-local start. */
export function activityDate(a: ActivitySummary): string {
  return a.start_date_local.slice(0, 10);
}

/** Monday of the week containing dateStr (YYYY-MM-DD). */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - dow);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface DistanceTotals {
  today: number; // meters
  week: number; // Monday-based week containing today
  month: number; // calendar month containing today
}

export function distanceTotals(activities: ActivitySummary[], today: string): DistanceTotals {
  const weekStart = mondayOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const totals: DistanceTotals = { today: 0, week: 0, month: 0 };
  for (const a of activities) {
    const d = activityDate(a);
    if (d > today) continue;
    if (d === today) totals.today += a.distance;
    if (d >= weekStart) totals.week += a.distance;
    if (d >= monthStart) totals.month += a.distance;
  }
  return totals;
}

export interface DayBucket {
  date: string;
  meters: number;
  seconds: number; // moving time of distance-bearing activities (for avg pace)
}

function sumIntoBuckets(activities: ActivitySummary[], days: DayBucket[]): void {
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const a of activities) {
    const entry = byDate.get(activityDate(a));
    if (!entry) continue;
    entry.meters += a.distance;
    if (a.distance > 0) entry.seconds += a.moving_time;
  }
}

/**
 * Meters per day for the Monday-based week containing `today` (7 entries,
 * Monday first) — feeds the weekly mileage mini-chart.
 */
export function weekDailyDistance(activities: ActivitySummary[], today: string): DayBucket[] {
  const start = mondayOf(today);
  const [y, m, d] = start.split('-').map(Number);
  const days: DayBucket[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(y, m - 1, d + i, 12);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({ date: key, meters: 0, seconds: 0 });
  }
  sumIntoBuckets(activities, days);
  return days;
}

/**
 * Meters per day for the calendar month containing `today` (1st → last day,
 * in order) — feeds the monthly mileage mini-chart.
 */
export function monthDailyDistance(activities: ActivitySummary[], today: string): DayBucket[] {
  const [y, m] = today.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days: DayBucket[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: `${today.slice(0, 7)}-${String(i).padStart(2, '0')}`, meters: 0, seconds: 0 });
  }
  sumIntoBuckets(activities, days);
  return days;
}

export interface RunRecords {
  bestPace: { secPerMile: number; activity: ActivitySummary } | null;
  longest: ActivitySummary | null;
}

/**
 * Best (fastest) average pace and longest activity among the given sports
 * (runs by default). Activities shorter than a quarter mile are ignored —
 * GPS noise produces absurd paces on tiny distances.
 */
export function runRecords(activities: ActivitySummary[], sports: Set<string> = RUN_SPORTS): RunRecords {
  let bestPace: RunRecords['bestPace'] = null;
  let longest: ActivitySummary | null = null;
  for (const a of activities) {
    if (!sports.has(a.sport_type)) continue;
    if (metersToMiles(a.distance) < 0.25) continue;
    const pace = paceSecPerMile(a);
    if (pace !== null && (bestPace === null || pace < bestPace.secPerMile)) {
      bestPace = { secPerMile: pace, activity: a };
    }
    if (longest === null || a.distance > longest.distance) longest = a;
  }
  return { bestPace, longest };
}
