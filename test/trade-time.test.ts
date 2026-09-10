import { describe, it, expect } from 'vitest';
import { tradeTimeLabel, hasTradeTime } from '@/lib/trading/trade-time';

describe('tradeTimeLabel', () => {
  it('returns the HH:MM of a real execution time', () => {
    expect(tradeTimeLabel('2026-07-01T11:40:54-04:00')).toBe('11:40');
    expect(tradeTimeLabel('2026-03-26T05:39:00-05:00')).toBe('05:39');
    expect(tradeTimeLabel('2026-07-01T09:30:00Z')).toBe('09:30');
  });

  it('omits SnapTrade day-granularity padding (noon on every fill)', () => {
    expect(tradeTimeLabel('2026-09-09T12:00:00-05:00')).toBeNull();
    expect(tradeTimeLabel('2026-05-11T12:00:00-05:00')).toBeNull();
    expect(tradeTimeLabel('2026-05-11T12:00:00.000Z')).toBeNull();
  });

  it('omits midnight padding and date-only strings', () => {
    expect(tradeTimeLabel('2026-09-09T00:00:00-05:00')).toBeNull();
    expect(tradeTimeLabel('2026-09-09')).toBeNull();
  });

  it('keeps a genuine fill that lands within the padded minute', () => {
    expect(tradeTimeLabel('2026-09-09T12:00:37-04:00')).toBe('12:00');
    expect(tradeTimeLabel('2026-09-09T12:01:00-04:00')).toBe('12:01');
  });

  it('handles missing and malformed input', () => {
    expect(tradeTimeLabel(undefined)).toBeNull();
    expect(tradeTimeLabel('')).toBeNull();
    expect(tradeTimeLabel('not-a-date')).toBeNull();
    expect(tradeTimeLabel('2026-09-09Tnope')).toBeNull();
  });

  it('hasTradeTime mirrors the label', () => {
    expect(hasTradeTime('2026-07-01T11:40:54-04:00')).toBe(true);
    expect(hasTradeTime('2026-09-09T12:00:00-05:00')).toBe(false);
  });
});
