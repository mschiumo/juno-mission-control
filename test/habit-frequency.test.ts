import { describe, it, expect } from 'vitest';
import {
  datesBetween,
  frequencyGoal,
  frequencyPeriod,
  lookbackDays,
  normalizeFrequency,
  periodProgress,
  shiftDate,
  weekEndFor,
  weekRangeLabel,
  weekStartFor,
} from '@/lib/habit-frequency';

describe('week boundaries (Mon → Sun)', () => {
  it('maps every day of a week to its Monday', () => {
    // 2026-08-17 is a Monday
    for (let i = 0; i < 7; i++) {
      expect(weekStartFor(shiftDate('2026-08-17', i))).toBe('2026-08-17');
    }
  });

  it('Sunday belongs to the week that started 6 days earlier', () => {
    expect(weekStartFor('2026-08-23')).toBe('2026-08-17');
    expect(weekEndFor('2026-08-17')).toBe('2026-08-23');
  });

  it('Monday starts a fresh week — the reset boundary', () => {
    expect(weekStartFor('2026-08-24')).toBe('2026-08-24');
  });

  it('crosses month boundaries correctly', () => {
    // 2026-09-01 is a Tuesday → its week starts Mon 2026-08-31
    expect(weekStartFor('2026-09-01')).toBe('2026-08-31');
  });

  it('labels the range', () => {
    expect(weekRangeLabel('2026-08-17')).toBe('Aug 17 – Aug 23, 2026');
  });
});

describe('frequency goals', () => {
  it('daily needs all 7 days', () => {
    expect(frequencyGoal('daily')).toBe(7);
  });

  it('weekly and monthly need one completion', () => {
    expect(frequencyGoal('weekly')).toBe(1);
    expect(frequencyGoal('monthly')).toBe(1);
  });

  it('NxWeek maps to N', () => {
    expect(frequencyGoal('2x')).toBe(2);
    expect(frequencyGoal('3x')).toBe(3);
    expect(frequencyGoal('5x')).toBe(5);
    expect(frequencyGoal('weekdays')).toBe(5);
  });

  it('legacy/unknown values fall back to daily', () => {
    expect(normalizeFrequency(undefined)).toBe('daily');
    expect(normalizeFrequency('sometimes')).toBe('daily');
    expect(frequencyGoal(undefined)).toBe(7);
  });

  it('only monthly is counted over the month', () => {
    expect(frequencyPeriod('monthly')).toBe('month');
    expect(frequencyPeriod('weekly')).toBe('week');
    expect(frequencyPeriod('daily')).toBe('week');
  });
});

describe('periodProgress — the stays-checked rule', () => {
  it('a weekly habit checked once stays fulfilled for the rest of the week', () => {
    // Volunteer (weekly) done Tuesday; viewed Friday
    const p = periodProgress('weekly', '2026-08-21', ['2026-08-18']);
    expect(p.fulfilled).toBe(true);
    expect(p.periodCompletions).toBe(1);
  });

  it('resets when the next week starts', () => {
    // Same completion, viewed the following Monday
    const p = periodProgress('weekly', '2026-08-24', ['2026-08-18']);
    expect(p.fulfilled).toBe(false);
    expect(p.periodCompletions).toBe(0);
    expect(p.periodStart).toBe('2026-08-24');
  });

  it('a 5x habit locks in after the 5th completion', () => {
    const days = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
    const partial = periodProgress('5x', '2026-08-21', days.slice(0, 4));
    expect(partial.fulfilled).toBe(false);
    const done = periodProgress('5x', '2026-08-22', days);
    expect(done.fulfilled).toBe(true);
  });

  it('daily needs all 7 days to fulfil', () => {
    const week = datesBetween('2026-08-17', '2026-08-23');
    expect(periodProgress('daily', '2026-08-23', week.slice(0, 6)).fulfilled).toBe(false);
    expect(periodProgress('daily', '2026-08-23', week).fulfilled).toBe(true);
  });

  it('ignores completions outside the current period', () => {
    const p = periodProgress('3x', '2026-08-19', [
      '2026-08-14', // previous week
      '2026-08-17',
      '2026-08-18',
    ]);
    expect(p.periodCompletions).toBe(2);
    expect(p.fulfilled).toBe(false);
  });

  it('monthly habits count over the calendar month', () => {
    const p = periodProgress('monthly', '2026-08-25', ['2026-08-03']);
    expect(p.periodType).toBe('month');
    expect(p.periodStart).toBe('2026-08-01');
    expect(p.fulfilled).toBe(true);
    // …and reset on the 1st
    const next = periodProgress('monthly', '2026-09-01', ['2026-08-03']);
    expect(next.fulfilled).toBe(false);
  });
});

describe('lookbackDays', () => {
  it('covers the week for weekly habits', () => {
    // Sunday: week started 6 days ago
    expect(lookbackDays(['daily', '5x'], '2026-08-23')).toBe(6);
  });

  it('stretches to the 1st when a monthly habit is present', () => {
    expect(lookbackDays(['daily', 'monthly'], '2026-08-25')).toBe(24);
  });
});
