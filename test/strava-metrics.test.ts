import { describe, it, expect } from 'vitest';
import {
  distanceTotals, runRecords, paceSecPerMile, speedMph,
  fmtPace, fmtMiles, mondayOf, weekDailyDistance, monthDailyDistance,
  type ActivitySummary,
} from '../lib/strava-metrics';

const MI = 1609.344;

function act(over: Partial<ActivitySummary>): ActivitySummary {
  return {
    id: Math.floor(Math.random() * 1e9),
    name: 'a',
    sport_type: 'Run',
    distance: MI,
    moving_time: 600,
    total_elevation_gain: 0,
    start_date_local: '2026-07-07T06:00:00Z',
    ...over,
  };
}

describe('mondayOf', () => {
  it('returns the Monday of the containing week', () => {
    expect(mondayOf('2026-07-07')).toBe('2026-07-06'); // Tue → Mon
    expect(mondayOf('2026-07-06')).toBe('2026-07-06'); // Mon → itself
    expect(mondayOf('2026-07-12')).toBe('2026-07-06'); // Sun → prior Mon
  });
});

describe('distanceTotals', () => {
  it('buckets by today / Monday week / calendar month', () => {
    const activities = [
      act({ distance: 3 * MI, start_date_local: '2026-07-07T06:00:00Z' }), // today
      act({ distance: 5 * MI, start_date_local: '2026-07-06T06:00:00Z' }), // this week
      act({ distance: 7 * MI, start_date_local: '2026-07-05T06:00:00Z' }), // Sun — last week, this month
      act({ distance: 11 * MI, start_date_local: '2026-06-28T06:00:00Z' }), // last month
    ];
    const t = distanceTotals(activities, '2026-07-07');
    expect(t.today / MI).toBeCloseTo(3);
    expect(t.week / MI).toBeCloseTo(8); // today + Monday
    expect(t.month / MI).toBeCloseTo(15); // all July
  });

  it('ignores future-dated activities', () => {
    const t = distanceTotals([act({ start_date_local: '2026-07-08T06:00:00Z' })], '2026-07-07');
    expect(t.month).toBe(0);
  });
});

describe('runRecords', () => {
  it('finds fastest pace and longest run among runs only', () => {
    const fast = act({ distance: 3 * MI, moving_time: 3 * 7 * 60 }); // 7:00/mi
    const slow = act({ distance: 10 * MI, moving_time: 10 * 9 * 60 }); // 9:00/mi, longest
    const ride = act({ sport_type: 'Ride', distance: 30 * MI, moving_time: 5400 });
    const { bestPace, longest } = runRecords([slow, fast, ride]);
    expect(bestPace?.activity.id).toBe(fast.id);
    expect(fmtPace(bestPace!.secPerMile)).toBe('7:00/mi');
    expect(longest?.id).toBe(slow.id);
  });

  it('ignores sub-quarter-mile GPS noise', () => {
    const noise = act({ distance: 100, moving_time: 10 }); // absurd pace
    expect(runRecords([noise]).bestPace).toBeNull();
  });

  it('returns nulls with no runs', () => {
    expect(runRecords([act({ sport_type: 'WeightTraining', distance: 0 })])).toEqual({
      bestPace: null,
      longest: null,
    });
  });
});

describe('formatting', () => {
  it('formats pace and distance', () => {
    expect(fmtPace(7 * 60 + 30)).toBe('7:30/mi');
    expect(fmtMiles(5 * MI)).toBe('5.0 mi');
    expect(fmtMiles(0)).toBe('0 mi');
  });

  it('computes pace and speed', () => {
    expect(paceSecPerMile(act({ distance: 2 * MI, moving_time: 16 * 60 }))).toBeCloseTo(480);
    expect(speedMph(act({ sport_type: 'Ride', distance: 20 * MI, moving_time: 3600 }))).toBeCloseTo(20);
    expect(paceSecPerMile(act({ distance: 0 }))).toBeNull();
  });
});

describe('weekDailyDistance', () => {
  it('returns 7 Monday-first buckets with summed meters', () => {
    const days = [
      { distance: 3 * MI, start_date_local: '2026-07-06T06:00:00Z' }, // Mon
      { distance: 2 * MI, start_date_local: '2026-07-07T06:00:00Z' }, // Tue
      { distance: 1 * MI, start_date_local: '2026-07-07T18:00:00Z' }, // Tue again
      { distance: 9 * MI, start_date_local: '2026-07-01T06:00:00Z' }, // outside week
    ].map((o) => act(o));
    const buckets = weekDailyDistance(days, '2026-07-07');
    expect(buckets).toHaveLength(7);
    expect(buckets[0].date).toBe('2026-07-06');
    expect(buckets[0].meters / MI).toBeCloseTo(3);
    expect(buckets[1].meters / MI).toBeCloseTo(3); // 2 + 1
    expect(buckets[6].date).toBe('2026-07-12');
    expect(buckets.slice(2).every((b) => b.meters === 0)).toBe(true);
  });
});

describe('monthDailyDistance', () => {
  it('returns one bucket per calendar day with summed meters', () => {
    const days = [
      act({ distance: 4 * MI, start_date_local: '2026-07-01T06:00:00Z' }),
      act({ distance: 6 * MI, start_date_local: '2026-07-07T06:00:00Z' }),
      act({ distance: 9 * MI, start_date_local: '2026-06-30T06:00:00Z' }), // prior month
    ];
    const buckets = monthDailyDistance(days, '2026-07-07');
    expect(buckets).toHaveLength(31);
    expect(buckets[0].date).toBe('2026-07-01');
    expect(buckets[0].meters / MI).toBeCloseTo(4);
    expect(buckets[6].meters / MI).toBeCloseTo(6);
    expect(buckets[30].date).toBe('2026-07-31');
  });
});
