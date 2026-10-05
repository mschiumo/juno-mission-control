import { describe, it, expect } from 'vitest';
import {
  type HabitDef, type HistoryDays, type DayHabit,
  buildTimeline, rangeWindow, scoreHabit, summarize, heatmap, insights, dateSpan,
} from '../lib/habit-progress';

const daily: HabitDef = { id: 'read', name: 'Read', icon: '📚', frequency: 'daily' };
const weekdays: HabitDef = { id: 'trade', name: 'Trade', icon: '📈', frequency: 'weekdays', category: 'trading' };
const threeX: HabitDef = { id: 'gym', name: 'Gym', icon: '💪', frequency: '3x' };

function h(id: string, over: Partial<DayHabit> = {}): DayHabit {
  return { id, completed: false, skipped: false, paused: false, ...over };
}

/** Build history where `fill(date)` returns that day's record (or null = no record). */
function history(from: string, to: string, fill: (date: string) => DayHabit[] | null): HistoryDays {
  const out: HistoryDays = {};
  for (const d of dateSpan(from, to)) {
    const r = fill(d);
    if (r) out[d] = r;
  }
  return out;
}

// 2026-09-07 is a Monday.
const MON = '2026-09-07';
const SUN = '2026-09-13';

describe('buildTimeline', () => {
  it('rolls a missing day forward as nodata and leaves pre-history days uncovered', () => {
    const days: HistoryDays = {
      '2026-09-08': [h('read', { completed: true })],
      '2026-09-10': [h('read', { completed: true })],
    };
    const t = buildTimeline(days, [daily], MON, '2026-09-10');
    expect(t.byDate.has(MON)).toBe(false); // before first record
    expect(t.byDate.get('2026-09-08')!.get('read')).toBe('done');
    expect(t.byDate.get('2026-09-09')!.get('read')).toBe('nodata');
    expect(t.recorded.has('2026-09-09')).toBe(false);
    expect(t.firstDate).toBe('2026-09-08');
  });

  it('marks paused, absent, skipped, weekend-off states', () => {
    const days = history(MON, SUN, (d) => [
      h('read', { skipped: d === MON, paused: d === '2026-09-08' }),
      h('trade'),
    ]);
    const t = buildTimeline(days, [daily, weekdays, threeX], MON, SUN);
    expect(t.byDate.get(MON)!.get('read')).toBe('skipped');
    expect(t.byDate.get('2026-09-08')!.get('read')).toBe('paused');
    expect(t.byDate.get('2026-09-09')!.get('read')).toBe('missed');
    expect(t.byDate.get('2026-09-12')!.get('trade')).toBe('off'); // Saturday
    expect(t.byDate.get(MON)!.get('gym')).toBe('absent'); // not in the record
  });
});

describe('scoreHabit', () => {
  it('scores daily habits per due day; skips and no-record days count as misses', () => {
    // Mon done, Tue skipped, Wed no record, Thu–Sun done.
    const days = history(MON, SUN, (d) => (d === '2026-09-09' ? null : [h('read', { completed: d !== '2026-09-08', skipped: d === '2026-09-08' })]));
    const t = buildTimeline(days, [daily], MON, SUN);
    const s = scoreHabit(t, daily, MON, SUN, '2026-09-14');
    expect(s.due).toBe(7);
    expect(s.done).toBe(5);
    expect(s.pct).toBe(71);
    expect(s.skips).toBe(2);
    expect(s.noDataSkips).toBe(1);
    expect(s.forgot).toBe(0);
    expect(s.longestStreak).toBe(4);
    expect(s.currentStreak).toBe(4); // Thu–Sun, today (Mon 14th) not recorded → nothing to add
  });

  it("doesn't count weekends against weekday-only habits", () => {
    const days = history(MON, SUN, (d) => [h('trade', { completed: d <= '2026-09-11' })]);
    const t = buildTimeline(days, [weekdays], MON, SUN);
    const s = scoreHabit(t, weekdays, MON, SUN, '2026-09-14');
    expect(s.due).toBe(5);
    expect(s.pct).toBe(100);
  });

  it('scores goal-per-period habits by period, capped at the goal', () => {
    // Week 1: 4 sessions (goal 3 → capped), week 2: 1 session.
    const done = new Set(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-16']);
    const days = history(MON, '2026-09-20', (d) => [h('gym', { completed: done.has(d) })]);
    const t = buildTimeline(days, [threeX], MON, '2026-09-20');
    const s = scoreHabit(t, threeX, MON, '2026-09-20', '2026-09-21');
    expect(s.periodsTotal).toBe(2);
    expect(s.periodsHit).toBe(1);
    expect(s.due).toBe(6);
    expect(s.done).toBe(4);
    expect(s.pct).toBe(67);
    expect(s.weekly).toEqual([100, 33]);
  });

  it('ignores a period the habit was paused in, or that predates it', () => {
    const days = history(MON, '2026-09-20', (d) => (d < '2026-09-09' ? [] : [h('gym', { paused: d === '2026-09-15' })]));
    const t = buildTimeline(days, [threeX], MON, '2026-09-20');
    const s = scoreHabit(t, threeX, MON, '2026-09-20', '2026-09-21');
    expect(s.periodsTotal).toBe(0);
    expect(s.pct).toBeNull();
  });
});

describe('heatmap', () => {
  it('flags no-record and all-skipped days; goal habits only count when done', () => {
    const days = history(MON, '2026-09-09', (d) =>
      d === '2026-09-08' ? null : [h('read', { skipped: d === '2026-09-09', completed: d === MON }), h('gym', { completed: d === MON })]);
    const t = buildTimeline(days, [daily, threeX], MON, '2026-09-09');
    const [mon, tue, wed] = heatmap(t, MON, '2026-09-09');
    expect(mon).toMatchObject({ due: 2, done: 2, ratio: 1 });
    expect(tue).toMatchObject({ noData: true, ratio: 0 });
    expect(wed).toMatchObject({ allSkipped: true, due: 1 });
  });
});

describe('summarize + insights', () => {
  it('rolls habits into overall %, perfect days, weekdays, and callouts', () => {
    const days = history('2026-08-03', '2026-09-27', (d) => {
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      return [
        h('read', { completed: dow !== 0 }), // misses every Sunday
        h('trade', { completed: false, skipped: dow >= 1 && dow <= 5 && dow % 2 === 1 }),
      ];
    });
    const t = buildTimeline(days, [daily, weekdays], '2026-08-03', '2026-09-27');
    const cur = summarize(t, '2026-08-31', '2026-09-27', '2026-09-28');
    const prev = summarize(t, '2026-08-03', '2026-08-30', '2026-09-28');
    expect(cur.scores.find((s) => s.habit.id === 'read')!.pct).toBe(86);
    expect(cur.scores.find((s) => s.habit.id === 'trade')!.pct).toBe(0);
    expect(cur.perfectDays).toBe(4); // only Saturdays: Read done, Trade off
    expect(cur.weekdays.find((d) => d.label === 'Sun')!.pct).toBe(0);
    const ins = insights(cur, prev);
    expect(ins.improve[0].habitId).toBe('trade');
    expect(ins.improve.some((i) => i.text.includes('skipped'))).toBe(true);
    expect(ins.wins.some((i) => i.habitId === 'read')).toBe(true);
  });
});

describe('insights wording', () => {
  it('calls only the lowest habit "weakest"', () => {
    const write: HabitDef = { id: 'write', name: 'Write', icon: '📝', frequency: 'daily' };
    const days = history('2026-09-01', '2026-09-28', (d) => {
      const n = Number(d.slice(8));
      return [h('read', { completed: n % 5 === 0 }), h('write', { completed: n % 3 === 0 })];
    });
    const t = buildTimeline(days, [daily, write], '2026-09-01', '2026-09-28');
    const ins = insights(summarize(t, '2026-09-01', '2026-09-28', '2026-09-29'), null);
    expect(ins.improve.filter((i) => i.text.includes('weakest habit'))).toHaveLength(1);
    expect(ins.improve[0].habitId).toBe('read');
    expect(ins.improve[1].text).toContain('also lagging');
  });
});

describe('rangeWindow', () => {
  it('ends yesterday with an equal-length comparison window', () => {
    expect(rangeWindow('1m', '2026-10-04')).toEqual({ from: '2026-09-04', to: '2026-10-03', prevFrom: '2026-08-05', prevTo: '2026-09-03' });
  });
  it('YTD runs Jan 1 → yesterday against the same span last year', () => {
    expect(rangeWindow('ytd', '2026-10-04')).toEqual({ from: '2026-01-01', to: '2026-10-03', prevFrom: '2025-01-01', prevTo: '2025-10-03' });
  });
});
