import { describe, it, expect } from 'vitest';
import {
  addDays,
  buildMarketEvents,
  CENTRAL_BANK_DATES,
  dayLabelFor,
  daysBetween,
  FOMC_DATES,
  nextSessionDay,
} from '@/lib/market-events';

describe('date helpers', () => {
  it('addDays / daysBetween are DST- and timezone-neutral', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08'); // US spring-forward weekend
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-15', '2026-09-18')).toBe(3);
  });

  it('nextSessionDay skips weekends', () => {
    expect(nextSessionDay('2026-09-15')).toBe('2026-09-16'); // Tue -> Wed
    expect(nextSessionDay('2026-09-18')).toBe('2026-09-21'); // Fri -> Mon
    expect(nextSessionDay('2026-09-19')).toBe('2026-09-21'); // Sat -> Mon
    expect(nextSessionDay('2026-09-20')).toBe('2026-09-21'); // Sun -> Mon
  });

  it('dayLabelFor names today, tomorrow, or the weekday', () => {
    expect(dayLabelFor('2026-09-15', '2026-09-15')).toBe('Today');
    expect(dayLabelFor('2026-09-15', '2026-09-16')).toBe('Tomorrow');
    expect(dayLabelFor('2026-09-18', '2026-09-21')).toBe('Mon');
  });
});

describe('schedules', () => {
  it('contain only valid, unique-per-bank YYYY-MM-DD weekdays', () => {
    const seen = new Set<string>();
    for (const e of [...FOMC_DATES.map((f) => ({ ...f, bank: 'Fed' })), ...CENTRAL_BANK_DATES]) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const dow = new Date(`${e.date}T12:00:00Z`).getUTCDay();
      expect(dow, `${e.bank} ${e.date} falls on a weekend`).not.toBe(0);
      expect(dow, `${e.bank} ${e.date} falls on a weekend`).not.toBe(6);
      const key = `${e.bank}-${e.date}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('buildMarketEvents', () => {
  const earnings = [
    { symbol: 'NVDA', date: '2026-09-16', hour: 'amc', quarter: 3, year: 2026 },
    { symbol: 'ZZZZ', date: '2026-09-16', hour: 'bmo', quarter: 3, year: 2026 }, // not notable
    { symbol: 'AAPL', date: '2026-09-17', hour: 'amc', quarter: 3, year: 2026 }, // outside window
  ];

  it('includes today and tomorrow, ordered today-first then by priority', () => {
    // Tue 2026-09-15: nothing scheduled today; FOMC + NVDA tomorrow
    const events = buildMarketEvents({ today: '2026-09-15', nextDay: '2026-09-16', earnings });
    expect(events.map((e) => [e.id, e.dayLabel])).toEqual([
      ['fomc-2026-09-16', 'Tomorrow'],
      ['earnings-NVDA-2026-09-16', 'Tomorrow'],
    ]);
    expect(events[0].daysUntil).toBe(1);
    expect(events[0].time).toBe('2:00 PM ET');
  });

  it('surfaces foreign central-bank decisions', () => {
    // Thu 2026-09-17: BoE today, BoJ tomorrow (Fri)
    const events = buildMarketEvents({ today: '2026-09-17', nextDay: '2026-09-18', earnings: [] });
    expect(events.map((e) => [e.id, e.dayLabel])).toEqual([
      ['cb-boe-2026-09-17', 'Today'],
      ['cb-boj-2026-09-18', 'Tomorrow'],
    ]);
    expect(events[0].type).toBe('centralbank');
    expect(events[0].label).toBe('BoE Rate Decision');
    expect(events[0].sublabel).toBe('7:00 AM ET');
    expect(events[1].time).toContain('Bank of Japan');
  });

  it('puts FOMC ahead of foreign banks and gov ahead of earnings on the same day', () => {
    const events = buildMarketEvents({
      today: '2026-03-18',
      nextDay: '2026-03-19',
      earnings: [{ symbol: 'MSFT', date: '2026-03-18', hour: 'bmo', quarter: 1, year: 2026 }],
    });
    expect(events.map((e) => e.id)).toEqual([
      'fomc-2026-03-18',
      'cb-boc-2026-03-18',
      'earnings-MSFT-2026-03-18',
      'cb-boj-2026-03-19',
      'cb-ecb-2026-03-19',
      'cb-boe-2026-03-19',
      'cb-snb-2026-03-19',
    ]);
  });

  it('labels a Friday view of Monday events by weekday', () => {
    const events = buildMarketEvents({
      today: '2026-09-25',
      nextDay: nextSessionDay('2026-09-25'),
      earnings: [{ symbol: 'COST', date: '2026-09-28', hour: 'amc', quarter: 4, year: 2026 }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].dayLabel).toBe('Mon');
    expect(events[0].daysUntil).toBe(3);
  });
});
