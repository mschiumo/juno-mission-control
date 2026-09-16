import { describe, it, expect } from 'vitest';
import {
  classifyPendingSync,
  getEtClock,
  pendingSyncDeadline,
  type EtClock,
} from '@/lib/trading/pending-sync';

// 2026-09-16 is a Wednesday; 2026-09-14 the Monday before.
const base = {
  lastCompleteTradeDay: '2026-09-14',
  noTradeDays: new Set<string>(),
  hasTrades: false,
};
const at = (ymd: string, hh: number, mm = 0): EtClock => ({ ymd, minutes: hh * 60 + mm });

describe('classifyPendingSync', () => {
  it('flags nothing when no brokerage is linked', () => {
    expect(
      classifyPendingSync({ ...base, lastCompleteTradeDay: null, date: '2026-09-15', now: at('2026-09-16', 10) })
    ).toBe('none');
  });

  it('never flags complete or future days', () => {
    const now = at('2026-09-16', 10);
    expect(classifyPendingSync({ ...base, date: '2026-09-14', now })).toBe('none');
    expect(classifyPendingSync({ ...base, date: '2026-09-11', hasTrades: true, now })).toBe('none');
    expect(classifyPendingSync({ ...base, date: '2026-09-17', now })).toBe('none');
  });

  it('shows today as in-progress until the 4pm ET close, then syncing', () => {
    expect(classifyPendingSync({ ...base, date: '2026-09-16', now: at('2026-09-16', 7) })).toBe('in-progress');
    expect(classifyPendingSync({ ...base, date: '2026-09-16', now: at('2026-09-16', 15, 59) })).toBe('in-progress');
    expect(classifyPendingSync({ ...base, date: '2026-09-16', hasTrades: true, now: at('2026-09-16', 11) })).toBe('in-progress');
    expect(classifyPendingSync({ ...base, date: '2026-09-16', now: at('2026-09-16', 16) })).toBe('syncing');
    expect(classifyPendingSync({ ...base, date: '2026-09-16', hasTrades: true, now: at('2026-09-16', 16) })).toBe('syncing');
  });

  it('flags yesterday as syncing while inside the grace period', () => {
    expect(classifyPendingSync({ ...base, date: '2026-09-15', now: at('2026-09-16', 10) })).toBe('syncing');
    expect(classifyPendingSync({ ...base, date: '2026-09-15', hasTrades: true, now: at('2026-09-16', 10) })).toBe('syncing');
  });

  it('returns an empty day to grey 36h after its close, but keeps partial days flagged', () => {
    // Mon 2026-09-14 closed 16:00 → deadline Wed 2026-09-16 04:00 ET.
    const input = { ...base, lastCompleteTradeDay: '2026-09-11', date: '2026-09-14' };
    expect(classifyPendingSync({ ...input, now: at('2026-09-16', 3, 59) })).toBe('syncing');
    expect(classifyPendingSync({ ...input, now: at('2026-09-16', 4) })).toBe('none');
    expect(classifyPendingSync({ ...input, now: at('2026-09-20', 12) })).toBe('none');
    expect(classifyPendingSync({ ...input, hasTrades: true, now: at('2026-09-20', 12) })).toBe('syncing');
  });

  it('leaves user-declared no-trade days grey unless fills arrived anyway', () => {
    const noTradeDays = new Set(['2026-09-15', '2026-09-16']);
    expect(classifyPendingSync({ ...base, noTradeDays, date: '2026-09-15', now: at('2026-09-16', 10) })).toBe('none');
    expect(classifyPendingSync({ ...base, noTradeDays, date: '2026-09-16', now: at('2026-09-16', 10) })).toBe('none');
    expect(classifyPendingSync({ ...base, noTradeDays, date: '2026-09-15', hasTrades: true, now: at('2026-09-16', 10) })).toBe('syncing');
    expect(classifyPendingSync({ ...base, noTradeDays, date: '2026-09-16', hasTrades: true, now: at('2026-09-16', 10) })).toBe('in-progress');
  });

  it('ignores weekends and holidays unless fills landed on them', () => {
    const now = at('2026-09-13', 12); // Sunday
    expect(classifyPendingSync({ ...base, lastCompleteTradeDay: '2026-09-11', date: '2026-09-12', now })).toBe('none');
    expect(classifyPendingSync({ ...base, lastCompleteTradeDay: '2026-09-11', date: '2026-09-12', hasTrades: true, now })).toBe('syncing');
    // Labor Day 2026-09-07, viewed the next morning.
    expect(classifyPendingSync({ ...base, lastCompleteTradeDay: '2026-09-04', date: '2026-09-07', now: at('2026-09-08', 9) })).toBe('none');
  });
});

describe('pendingSyncDeadline', () => {
  it('is 04:00 ET two calendar days after the trading day', () => {
    expect(pendingSyncDeadline('2026-09-15')).toEqual({ ymd: '2026-09-17', minutes: 240 });
    expect(pendingSyncDeadline('2026-09-30')).toEqual({ ymd: '2026-10-02', minutes: 240 });
  });
});

describe('getEtClock', () => {
  it('reports the ET calendar day and minutes regardless of host timezone', () => {
    // 2026-09-16T02:30Z is 22:30 ET on the 15th (EDT, UTC-4).
    expect(getEtClock(new Date('2026-09-16T02:30:00Z'))).toEqual({ ymd: '2026-09-15', minutes: 22 * 60 + 30 });
    // Midnight ET must come back as 0, not 24.
    expect(getEtClock(new Date('2026-09-16T04:00:00Z'))).toEqual({ ymd: '2026-09-16', minutes: 0 });
  });
});
