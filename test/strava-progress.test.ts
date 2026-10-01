import { describe, it, expect } from 'vitest';
import type { ActivitySummary } from '../lib/strava-metrics';
import {
  sportCategory, monthlyBuckets, weeklyBuckets, sportBreakdown, weekdayTotals, consistency, progressRecords,
  metricValue, totalsOf, addMonths,
} from '../lib/strava-progress';

const MI = 1609.344;
let nextId = 1;

function act(over: Partial<ActivitySummary>): ActivitySummary {
  return {
    id: nextId++,
    name: 'a',
    sport_type: 'Run',
    distance: MI,
    moving_time: 600,
    total_elevation_gain: 0,
    start_date_local: '2026-07-07T06:00:00Z',
    ...over,
  };
}

describe('sportCategory', () => {
  it('maps Strava sport types into the five stack categories', () => {
    expect(sportCategory('TrailRun')).toBe('run');
    expect(sportCategory('GravelRide')).toBe('ride');
    expect(sportCategory('Hike')).toBe('walk');
    expect(sportCategory('WeightTraining')).toBe('strength');
    expect(sportCategory('Swim')).toBe('other');
  });
});

describe('addMonths', () => {
  it('crosses year boundaries', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
  });
});

describe('monthlyBuckets', () => {
  it('creates empty months and splits totals by category', () => {
    const b = monthlyBuckets(
      [
        act({ distance: 3 * MI, start_date_local: '2026-07-01T06:00:00Z' }),
        act({ sport_type: 'Ride', distance: 10 * MI, start_date_local: '2026-07-20T06:00:00Z' }),
        act({ distance: 2 * MI, start_date_local: '2026-09-03T06:00:00Z' }),
        act({ distance: 99 * MI, start_date_local: '2026-05-03T06:00:00Z' }), // outside
      ],
      '2026-07',
      '2026-09',
    );
    expect(b.map((x) => x.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(metricValue(b[0].totals, 'distance')).toBeCloseTo(13);
    expect(metricValue(b[0].byCategory.ride, 'distance')).toBeCloseTo(10);
    expect(b[1].totals.count).toBe(0);
    expect(b[2].totals.count).toBe(1);
  });
});

describe('weeklyBuckets', () => {
  it('buckets by Monday week', () => {
    const w = weeklyBuckets(
      [act({ start_date_local: '2026-07-07T06:00:00Z' }), act({ start_date_local: '2026-07-12T06:00:00Z' })],
      '2026-07-01',
      '2026-07-14',
    );
    expect(w.map((x) => x.key)).toEqual(['2026-06-29', '2026-07-06', '2026-07-13']);
    expect(w[1].totals.count).toBe(2);
  });
});

describe('sportBreakdown', () => {
  it('computes distance-weighted pace and sorts by count', () => {
    const rows = sportBreakdown([
      act({ distance: 1 * MI, moving_time: 480 }),
      act({ distance: 3 * MI, moving_time: 1800 }),
      act({ sport_type: 'Ride', distance: 15 * MI, moving_time: 3600 }),
    ]);
    expect(rows[0].sport).toBe('Run');
    expect(rows[0].avgPaceSecPerMile).toBeCloseTo(2280 / 4);
    expect(rows[1].avgMph).toBeCloseTo(15);
    expect(rows[1].avgPaceSecPerMile).toBeNull();
  });
});

describe('weekdayTotals', () => {
  it('is Monday-first', () => {
    const d = weekdayTotals([act({ start_date_local: '2026-07-06T06:00:00Z' }), act({ start_date_local: '2026-07-12T06:00:00Z' })]);
    expect(d[0].count).toBe(1); // Mon
    expect(d[6].count).toBe(1); // Sun
  });
});

describe('consistency', () => {
  it('finds longest and current streaks', () => {
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-08', '2026-07-09'];
    const c = consistency(days.map((d) => act({ start_date_local: `${d}T06:00:00Z` })), '2026-07-01', '2026-07-10');
    expect(c.activeDays).toBe(5);
    expect(c.longestStreak).toBe(3);
    expect(c.currentStreak).toBe(2); // today (07-10) empty → counts back from yesterday
    expect(c.activeWeeks).toBe(2);
  });
});

describe('progressRecords', () => {
  it('ignores sub-mile runs for fastest pace', () => {
    const recs = progressRecords([
      act({ distance: 0.5 * MI, moving_time: 120 }), // blistering but too short
      act({ distance: 2 * MI, moving_time: 960 }),
      act({ distance: 5 * MI, moving_time: 3000 }),
    ]);
    const pace = recs.find((r) => r.id === 'fastestPace')!;
    expect(pace.value).toBeCloseTo(480);
    expect(recs.find((r) => r.id === 'longestRun')!.value).toBeCloseTo(5 * MI);
    expect(recs.find((r) => r.id === 'longestRide')).toBeUndefined();
  });
});

describe('totalsOf', () => {
  it('treats missing calories as 0', () => {
    expect(totalsOf([act({ calories: 300 }), act({})]).calories).toBe(300);
  });
});
