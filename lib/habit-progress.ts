/**
 * Habit progress math for the Habits → Progress modal.
 *
 * Input is the raw per-day habit records (`habits_data:<user>:<date>`) plus the
 * user's current habit list; output is everything the modal renders. Pure
 * module (no Redis, no React) so it can be unit-tested.
 *
 * Scoring rules:
 *   - Daily-cadence habits (`daily`, `weekdays`) score one unit per *due* day.
 *     Weekends aren't due for weekday-only habits (`weekdays` frequency or
 *     trading habits — same rule the card uses to hide them on weekends).
 *   - Goal-per-period habits (`4x`, `weekly`, `monthly`, …) score one unit per
 *     required completion in each period that *ends* inside the range, capped
 *     at the goal — so a 4x/week habit isn't judged as a 7-day habit.
 *   - Paused days, and days before a habit existed, are not due.
 *   - A skip is a miss. A day with no record at all (the app was never opened)
 *     is also counted as a skip, using the habit set from the last recorded
 *     day — the same roll-forward the card does when it starts a new day.
 *   - Today is still in progress, so ranges end yesterday; only the current
 *     streak peeks at today (a habit already done today extends it).
 *
 * Dates are ET `YYYY-MM-DD` strings; all math is UTC-anchored string math.
 */

import {
  type HabitFrequency,
  frequencyGoal,
  frequencyPeriod,
  monthStartFor,
  normalizeFrequency,
  shiftDate,
  weekStartFor,
} from '@/lib/habit-frequency';

// ── Types ──────────────────────────────────────────────────────────────────

/** One habit's state in one stored day record (what the history API returns). */
export interface DayHabit {
  id: string;
  completed: boolean;
  skipped: boolean;
  paused: boolean;
}

/** date → that day's stored habits. Only days that have a record appear. */
export type HistoryDays = Record<string, DayHabit[]>;

/** The current definition of a habit (frequency etc. are taken from here). */
export interface HabitDef {
  id: string;
  name: string;
  icon: string;
  frequency: HabitFrequency | string;
  category?: string;
  paused?: boolean;
}

/**
 * done / skipped / missed / nodata are due; the rest aren't.
 * `nodata` = no record that day (app not opened) — scored as a skip.
 */
export type DayStatus = 'done' | 'skipped' | 'missed' | 'nodata' | 'paused' | 'off' | 'absent';

export interface Timeline {
  habits: HabitDef[];
  /** date → habitId → status, for every date the history covers. */
  byDate: Map<string, Map<string, DayStatus>>;
  /** Dates that had an actual record (vs. rolled forward). */
  recorded: Set<string>;
  /** First date with a record, or null when there's no history at all. */
  firstDate: string | null;
}

export type RangeId = '1m' | '3m' | '6m' | 'ytd';

export interface RangeWindow {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

// ── Small date helpers ────────────────────────────────────────────────────

function dow(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

function isWeekend(date: string): boolean {
  const d = dow(date);
  return d === 0 || d === 6;
}

/** Inclusive list of dates (no length cap, unlike `datesBetween`). */
export function dateSpan(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) out.push(d);
  return out;
}

function monthEndFor(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return shiftDate(next, -1);
}

function dayDiff(from: string, to: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(to) - p(from)) / 86_400_000);
}

// ── Habit classification ──────────────────────────────────────────────────

// Trading habits are hidden on Sat/Sun (market closed). Habit ids aren't stable
// slugs across users, so match the seeded ids AND names, plus anything the user
// has explicitly marked as weekdays-frequency or trading-category.
const TRADING_HABIT_IDS = ['market-brief', 'trade', 'trade-journal'];

export function isWeekdayOnlyHabit(habit: { id: string; name: string; frequency?: string; category?: string }): boolean {
  if (habit.frequency === 'weekdays' || habit.category === 'trading') return true;
  if (TRADING_HABIT_IDS.includes(habit.id)) return true;
  const name = habit.name.trim().toLowerCase();
  return name === 'trade' || name === 'trade journal' || name.startsWith('read market brief');
}

/** Scored day by day (vs. by goal-per-period). */
export function isDailyCadence(habit: HabitDef): boolean {
  const f = normalizeFrequency(habit.frequency);
  return f === 'daily' || f === 'weekdays';
}

const DUE: ReadonlySet<DayStatus> = new Set(['done', 'skipped', 'missed', 'nodata']);
export const isDue = (s: DayStatus | undefined): s is DayStatus => !!s && DUE.has(s);
const isSkip = (s: DayStatus | undefined) => s === 'skipped' || s === 'nodata';

// ── Timeline ──────────────────────────────────────────────────────────────

/**
 * Resolve every habit's status for every date in [from, to]. Days with no
 * record roll forward from the last recorded day (habit set + paused flags)
 * and come out as `nodata`; days before the first record aren't covered.
 */
export function buildTimeline(days: HistoryDays, habits: HabitDef[], from: string, to: string): Timeline {
  const byDate = new Map<string, Map<string, DayStatus>>();
  const recorded = new Set<string>();
  const recordDates = Object.keys(days).filter((d) => d <= to).sort();
  const firstDate = recordDates[0] ?? null;

  // Seed the roll-forward with the last record before the window, if any.
  let last: Map<string, DayHabit> | null = null;
  for (const d of recordDates) {
    if (d >= from) break;
    last = new Map(days[d].map((h) => [h.id, h]));
  }

  for (const date of dateSpan(from, to)) {
    const record = days[date];
    let source: Map<string, DayHabit> | null;
    let rolled = false;
    if (record) {
      source = new Map(record.map((h) => [h.id, h]));
      last = source;
      recorded.add(date);
    } else {
      source = last;
      rolled = true;
    }
    if (!source) continue; // before any history

    const statuses = new Map<string, DayStatus>();
    for (const habit of habits) {
      const h = source.get(habit.id);
      let status: DayStatus;
      if (!h) status = 'absent';
      else if (h.paused) status = 'paused';
      // Weekday-only habits aren't due on weekends — though a goal-per-period
      // habit done on a weekend still counts toward its goal.
      else if (isWeekdayOnlyHabit(habit) && isWeekend(date) && (isDailyCadence(habit) || rolled || !h.completed)) status = 'off';
      else if (rolled) status = 'nodata';
      else if (h.completed) status = 'done';
      else if (h.skipped) status = 'skipped';
      else status = 'missed';
      statuses.set(habit.id, status);
    }
    byDate.set(date, statuses);
  }

  return { habits, byDate, recorded, firstDate };
}

// ── Ranges ────────────────────────────────────────────────────────────────

export const RANGE_DAYS: Record<Exclude<RangeId, 'ytd'>, number> = { '1m': 30, '3m': 91, '6m': 182 };

/** [from, to] (ending yesterday) plus the comparison window before it. */
export function rangeWindow(range: RangeId, today: string): RangeWindow {
  const to = shiftDate(today, -1);
  if (range === 'ytd') {
    // Jan 1 → yesterday, compared with the same span last year. On Jan 1
    // itself the window is empty-ish, so fall back to the last 30 days.
    const from = `${today.slice(0, 4)}-01-01`;
    if (from > to) return rangeWindow('1m', today);
    const prevFrom = `${Number(today.slice(0, 4)) - 1}-01-01`;
    return { from, to, prevFrom, prevTo: shiftDate(prevFrom, dayDiff(from, to)) };
  }
  const len = RANGE_DAYS[range];
  const from = shiftDate(to, -(len - 1));
  const prevTo = shiftDate(from, -1);
  return { from, to, prevFrom: shiftDate(prevTo, -(len - 1)), prevTo };
}

// ── Scoring ───────────────────────────────────────────────────────────────

interface Period {
  start: string;
  end: string;
}

/** Periods (week or month) of this habit's cadence that END inside [from, to]. */
function periodsEndingIn(habit: HabitDef, from: string, to: string): Period[] {
  const periodType = frequencyPeriod(habit.frequency);
  const out: Period[] = [];
  if (periodType === 'week') {
    // First Sunday on/after `from`.
    let end = shiftDate(weekStartFor(from), 6);
    for (; end <= to; end = shiftDate(end, 7)) out.push({ start: shiftDate(end, -6), end });
  } else {
    let end = monthEndFor(from);
    for (; end <= to; end = monthEndFor(shiftDate(end, 1))) out.push({ start: monthStartFor(end), end });
  }
  return out;
}

interface PeriodScore extends Period {
  completions: number;
  goal: number;
  hit: boolean;
  skips: number;
}

/**
 * Score one goal-per-period habit over one period, or null when the period
 * doesn't count: the habit didn't exist yet at the start, was paused at any
 * point, or the period isn't covered by history.
 */
function scorePeriod(t: Timeline, habit: HabitDef, p: Period): PeriodScore | null {
  let completions = 0;
  let skips = 0;
  for (const date of dateSpan(p.start, p.end)) {
    const s = t.byDate.get(date)?.get(habit.id);
    if (s === undefined) return null; // outside history
    if (s === 'absent' && date === p.start) return null;
    if (s === 'paused') return null;
    if (s === 'done') completions++;
    if (isSkip(s)) skips++;
  }
  const goal = frequencyGoal(habit.frequency);
  return { ...p, completions, goal, hit: completions >= goal, skips };
}

export interface HabitScore {
  habit: HabitDef;
  daily: boolean;
  /** Units due / done in the range (days for daily cadence, goal units otherwise). */
  due: number;
  done: number;
  /** 0–100, or null when nothing was due. */
  pct: number | null;
  /** Explicit skips + app-not-opened days (daily cadence: due days only). */
  skips: number;
  /** Of `skips`, the days with no record. */
  noDataSkips: number;
  /** Due days left unchecked without a skip (daily cadence only). */
  forgot: number;
  /** Goal-per-period habits: periods that hit the goal / counted. */
  periodsHit: number;
  periodsTotal: number;
  /** In days (daily cadence) or periods (goal habits). */
  longestStreak: number;
  currentStreak: number;
  streakUnit: 'day' | 'week' | 'month';
  /** Completion % per week in the range (null = nothing due that week). */
  weekly: (number | null)[];
}

function pctOf(done: number, due: number): number | null {
  return due > 0 ? Math.round((done / due) * 100) : null;
}

/** Monday-start weeks overlapping [from, to]. */
export function weeksIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = weekStartFor(from); w <= to; w = shiftDate(w, 7)) out.push(w);
  return out;
}

function dailyScore(t: Timeline, habit: HabitDef, from: string, to: string) {
  let due = 0, done = 0, skips = 0, noData = 0, forgot = 0, run = 0, longest = 0;
  for (const date of dateSpan(from, to)) {
    const s = t.byDate.get(date)?.get(habit.id);
    if (!isDue(s)) continue; // off / paused / absent days don't break a streak
    due++;
    if (s === 'done') {
      done++;
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
      if (s === 'nodata') { skips++; noData++; }
      else if (s === 'skipped') skips++;
      else forgot++;
    }
  }
  return { due, done, skips, noData, forgot, longest };
}

/** Consecutive done due-days ending today (if done) or yesterday. */
function currentDailyStreak(t: Timeline, habit: HabitDef, today: string): number {
  let streak = 0;
  let date = today;
  const todayStatus = t.byDate.get(today)?.get(habit.id);
  if (todayStatus !== 'done') date = shiftDate(today, -1);
  for (; t.byDate.has(date); date = shiftDate(date, -1)) {
    const s = t.byDate.get(date)!.get(habit.id);
    if (!isDue(s)) {
      if (s === 'absent') break;
      continue;
    }
    if (s !== 'done') break;
    streak++;
  }
  return streak;
}

export function scoreHabit(t: Timeline, habit: HabitDef, from: string, to: string, today: string): HabitScore {
  const weeks = weeksIn(from, to);
  if (isDailyCadence(habit)) {
    const s = dailyScore(t, habit, from, to);
    const weekly = weeks.map((w) => {
      const ws = dailyScore(t, habit, w < from ? from : w, shiftDate(w, 6) > to ? to : shiftDate(w, 6));
      return pctOf(ws.done, ws.due);
    });
    return {
      habit, daily: true, due: s.due, done: s.done, pct: pctOf(s.done, s.due),
      skips: s.skips, noDataSkips: s.noData, forgot: s.forgot,
      periodsHit: 0, periodsTotal: 0,
      longestStreak: s.longest, currentStreak: currentDailyStreak(t, habit, today), streakUnit: 'day', weekly,
    };
  }

  const periods = periodsEndingIn(habit, from, to)
    .map((p) => scorePeriod(t, habit, p))
    .filter((p): p is PeriodScore => p !== null);
  const due = periods.reduce((a, p) => a + p.goal, 0);
  const done = periods.reduce((a, p) => a + Math.min(p.completions, p.goal), 0);

  let run = 0, longest = 0;
  for (const p of periods) {
    run = p.hit ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  // Current streak: consecutive hit periods ending with the latest finished
  // one — plus the in-progress period when its goal is already met.
  const all = periodsEndingIn(habit, shiftDate(today, -400), shiftDate(today, -1))
    .map((p) => scorePeriod(t, habit, p))
    .filter((p): p is PeriodScore => p !== null);
  let current = 0;
  for (let i = all.length - 1; i >= 0 && all[i].hit; i--) current++;
  const inProgressStart = frequencyPeriod(habit.frequency) === 'month' ? monthStartFor(today) : weekStartFor(today);
  let inProgress = 0;
  for (const date of dateSpan(inProgressStart, today)) if (t.byDate.get(date)?.get(habit.id) === 'done') inProgress++;
  if (inProgress >= frequencyGoal(habit.frequency)) current++;

  const weekly = weeks.map((w) => {
    const end = shiftDate(w, 6);
    const ps = periods.filter((p) => p.end >= w && p.end <= end);
    const g = ps.reduce((a, p) => a + p.goal, 0);
    return pctOf(ps.reduce((a, p) => a + Math.min(p.completions, p.goal), 0), g);
  });

  return {
    habit, daily: false, due, done, pct: pctOf(done, due),
    skips: periods.reduce((a, p) => a + p.skips, 0), noDataSkips: 0, forgot: 0,
    periodsHit: periods.filter((p) => p.hit).length, periodsTotal: periods.length,
    longestStreak: longest, currentStreak: current,
    streakUnit: frequencyPeriod(habit.frequency) === 'month' ? 'month' : 'week', weekly,
  };
}

// ── Aggregates ────────────────────────────────────────────────────────────

export interface HeatDay {
  date: string;
  /** 0–1 share of due habits done, or null when nothing was due / not covered. */
  ratio: number | null;
  due: number;
  done: number;
  /** No record that day — the app wasn't opened. */
  noData: boolean;
  /** Every due habit was explicitly skipped. */
  allSkipped: boolean;
  covered: boolean;
}

/**
 * One cell per day. Daily-cadence habits are the denominator; a goal-per-period
 * habit only counts on days it was done (as a bonus), so a 3x/week habit
 * doesn't paint its four rest days as failures.
 */
export function heatmap(t: Timeline, from: string, to: string): HeatDay[] {
  return dateSpan(from, to).map((date) => {
    const day = t.byDate.get(date);
    if (!day) return { date, ratio: null, due: 0, done: 0, noData: false, allSkipped: false, covered: false };
    let due = 0, done = 0, skipped = 0;
    for (const habit of t.habits) {
      const s = day.get(habit.id);
      if (isDailyCadence(habit)) {
        if (!isDue(s)) continue;
        due++;
        if (s === 'done') done++;
        if (s === 'skipped') skipped++;
      } else if (s === 'done') {
        due++;
        done++;
      }
    }
    const noData = !t.recorded.has(date);
    return {
      date, due, done, noData, covered: true,
      ratio: due > 0 ? done / due : null,
      allSkipped: !noData && due > 0 && skipped === due,
    };
  });
}

export interface RangeSummary {
  from: string;
  to: string;
  scores: HabitScore[];
  due: number;
  done: number;
  pct: number | null;
  perfectDays: number;
  scoredDays: number;
  skips: number;
  noDataSkips: number;
  noDataDays: number;
  forgot: number;
  /** Days in range with history (recorded or rolled forward). */
  coveredDays: number;
  /** Overall completion % per Monday-start week. */
  weekly: { week: string; pct: number | null }[];
  /** Mon..Sun daily-cadence completion %. */
  weekdays: { label: string; pct: number | null; due: number }[];
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function summarize(t: Timeline, from: string, to: string, today: string): RangeSummary {
  const scores = t.habits.map((h) => scoreHabit(t, h, from, to, today)).filter((s) => s.due > 0 || s.currentStreak > 0);
  const due = scores.reduce((a, s) => a + s.due, 0);
  const done = scores.reduce((a, s) => a + s.done, 0);

  const days = heatmap(t, from, to);
  const dailyHabits = t.habits.filter(isDailyCadence);
  let perfectDays = 0, scoredDays = 0;
  const wd = WEEKDAY_LABELS.map(() => ({ due: 0, done: 0 }));
  for (const date of dateSpan(from, to)) {
    const day = t.byDate.get(date);
    if (!day) continue;
    let d = 0, x = 0;
    for (const h of dailyHabits) {
      const s = day.get(h.id);
      if (!isDue(s)) continue;
      d++;
      if (s === 'done') x++;
    }
    if (d === 0) continue;
    scoredDays++;
    if (x === d) perfectDays++;
    const i = (dow(date) + 6) % 7;
    wd[i].due += d;
    wd[i].done += x;
  }

  const weeks = weeksIn(from, to);
  const weekly = weeks.map((week, i) => {
    let d = 0, x = 0;
    for (const s of scores) {
      const p = s.weekly[i];
      if (p === null) continue;
      // Re-weight by the habit's units that week so a 1x/week habit doesn't
      // count as much as a daily one.
      const units = s.daily
        ? dateSpan(week < from ? from : week, shiftDate(week, 6) > to ? to : shiftDate(week, 6))
            .filter((date) => isDue(t.byDate.get(date)?.get(s.habit.id))).length
        : frequencyGoal(s.habit.frequency);
      d += units;
      x += (p / 100) * units;
    }
    return { week, pct: d > 0 ? Math.round((x / d) * 100) : null };
  });

  return {
    from, to, scores, due, done, pct: pctOf(done, due),
    perfectDays, scoredDays,
    skips: scores.reduce((a, s) => a + s.skips, 0),
    noDataSkips: scores.reduce((a, s) => a + s.noDataSkips, 0),
    noDataDays: days.filter((d) => d.covered && d.noData).length,
    forgot: scores.reduce((a, s) => a + s.forgot, 0),
    coveredDays: days.filter((d) => d.covered).length,
    weekly,
    weekdays: WEEKDAY_LABELS.map((label, i) => ({ label, pct: pctOf(wd[i].done, wd[i].due), due: wd[i].due })),
  };
}

// ── Insights ──────────────────────────────────────────────────────────────

export interface Insight {
  text: string;
  habitId?: string;
}

export interface Insights {
  improve: Insight[];
  wins: Insight[];
}

/**
 * Rule-based callouts — no AI. `prev` is the comparison range (null when it
 * isn't covered by history), used for "slipping" / "most improved".
 */
export function insights(cur: RangeSummary, prev: RangeSummary | null): Insights {
  const improve: Insight[] = [];
  const wins: Insight[] = [];
  const scored = cur.scores.filter((s) => s.pct !== null && s.due >= 3);
  const prevPct = new Map(prev?.scores.map((s) => [s.habit.id, s.pct]) ?? []);
  const name = (s: HabitScore) => `${s.habit.icon} ${s.habit.name}`;

  // Weakest habits.
  const weakest = [...scored].filter((s) => s.pct! < 60).sort((a, b) => a.pct! - b.pct!).slice(0, 2);
  for (const s of weakest) {
    improve.push({
      habitId: s.habit.id,
      text: s.daily
        ? `${name(s)} is your weakest habit at ${s.pct}% — try anchoring it to something you already do every day.`
        : `${name(s)} hit its goal in ${s.periodsHit} of ${s.periodsTotal} ${s.streakUnit}s (${s.pct}%) — consider lowering the target or scheduling the sessions.`,
    });
  }

  // Slipping vs the previous period.
  const slipping = scored
    .map((s) => ({ s, delta: prevPct.get(s.habit.id) != null ? s.pct! - prevPct.get(s.habit.id)! : null }))
    .filter((x): x is { s: HabitScore; delta: number } => x.delta !== null && x.delta <= -10)
    .sort((a, b) => a.delta - b.delta)
    .filter((x) => !weakest.includes(x.s))
    .slice(0, 2);
  for (const { s, delta } of slipping) {
    improve.push({ habitId: s.habit.id, text: `${name(s)} slipped ${Math.abs(delta)} pts vs the previous period (now ${s.pct}%).` });
  }

  // Frequently skipped.
  const skippy = scored
    .filter((s) => s.daily && s.due > 0 && s.skips - s.noDataSkips >= 3 && (s.skips - s.noDataSkips) / s.due >= 0.2)
    .sort((a, b) => (b.skips - b.noDataSkips) / b.due - (a.skips - a.noDataSkips) / a.due)
    .slice(0, 1);
  for (const s of skippy) {
    improve.push({ habitId: s.habit.id, text: `You skipped ${name(s)} ${s.skips - s.noDataSkips} times — if it keeps getting skipped, it may need a different time slot or a smaller version.` });
  }

  // Weakest weekday (only when there's a real spread).
  const days = cur.weekdays.filter((d) => d.pct !== null && d.due >= 5);
  if (days.length >= 5) {
    const worst = days.reduce((a, b) => (b.pct! < a.pct! ? b : a));
    const best = days.reduce((a, b) => (b.pct! > a.pct! ? b : a));
    if (best.pct! - worst.pct! >= 15) {
      improve.push({ text: `${worst.label} is your weakest day (${worst.pct}% vs ${best.pct}% on ${best.label}s) — plan that day the night before.` });
      wins.push({ text: `${best.label}s are your strongest day at ${best.pct}%.` });
    }
  }

  // App never opened.
  if (cur.noDataDays >= 2) {
    improve.push({ text: `The app wasn't opened on ${cur.noDataDays} days — every habit on those days counted as skipped.` });
  }

  // Wins.
  const strongest = [...scored].filter((s) => s.pct! >= 80).sort((a, b) => b.pct! - a.pct!).slice(0, 2);
  for (const s of strongest) {
    wins.push({ habitId: s.habit.id, text: `${name(s)} is locked in at ${s.pct}%.` });
  }
  const improved = scored
    .map((s) => ({ s, delta: prevPct.get(s.habit.id) != null ? s.pct! - prevPct.get(s.habit.id)! : null }))
    .filter((x): x is { s: HabitScore; delta: number } => x.delta !== null && x.delta >= 10)
    .sort((a, b) => b.delta - a.delta)[0];
  if (improved) wins.push({ habitId: improved.s.habit.id, text: `${name(improved.s)} is up ${improved.delta} pts vs the previous period.` });

  const streaker = [...cur.scores].filter((s) => s.daily).sort((a, b) => b.longestStreak - a.longestStreak)[0];
  if (streaker && streaker.longestStreak >= 5) {
    wins.push({ habitId: streaker.habit.id, text: `Longest run: ${streaker.longestStreak} days straight of ${name(streaker)}.` });
  }
  if (cur.perfectDays > 0) {
    wins.push({ text: `${cur.perfectDays} perfect ${cur.perfectDays === 1 ? 'day' : 'days'} — every daily habit done.` });
  }

  if (improve.length === 0 && scored.length > 0) {
    improve.push({ text: 'Nothing is lagging — consider raising a target or adding a new habit.' });
  }

  return { improve, wins };
}
