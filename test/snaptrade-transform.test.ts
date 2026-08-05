/**
 * buildTradesFromActivities — day-granularity (same-stamp) reconstruction.
 *
 * Regression for the 2026-08-05 SHOP day: 73 shares bought across 9 fills,
 * 48 sold, 25 held overnight. The buys-first ordering merged the whole day
 * into one never-flat OPEN trade at the blended average, silently dropping
 * ~-$148 of realized P&L from the day. FIFO quantity matching must emit the
 * realized round trip as a CLOSED trade and leave only the 25-share tail open.
 */
import { describe, it, expect } from 'vitest';
import { buildTradesFromActivities, SnapTradeActivity } from '@/lib/snaptrade-transform';
import { TradeSide, TradeStatus } from '@/types/trading';

const DAY = '2026-08-05T00:00:00Z'; // Schwab-style day-granularity stamp
const PREV = '2026-08-04T00:00:00Z';
const CTX = { userId: 'u1', accountId: 'acct1', brokerage: 'Schwab', now: '2026-08-06T00:00:00Z' };

function fill(
  symbol: string,
  type: 'BUY' | 'SELL',
  units: number,
  price: number,
  fee = 0,
  trade_date = DAY,
  description = ''
): SnapTradeActivity {
  return { type, units, price, fee, trade_date, symbol: { symbol }, description };
}

describe('same-stamp FIFO quantity matching', () => {
  it('emits realized round trips on a day with more buys than sells (SHOP 2026-08-05)', () => {
    // Feed order = chronological order from the TOS account statement.
    const activities: SnapTradeActivity[] = [
      fill('SHOP', 'BUY', 12, 150.925),
      fill('SHOP', 'SELL', 12, 146.98, 0.04),
      fill('SHOP', 'BUY', 13, 145.655),
      fill('SHOP', 'BUY', 3, 147.58),
      fill('SHOP', 'BUY', 5, 145.05),
      fill('SHOP', 'BUY', 2, 145.79),
      fill('SHOP', 'BUY', 3, 145.79),
      fill('SHOP', 'BUY', 5, 145.745),
      fill('SHOP', 'BUY', 5, 145.745),
      fill('SHOP', 'SELL', 6, 142.99, 0.02),
      fill('SHOP', 'SELL', 6, 142.99, 0.02),
      fill('SHOP', 'SELL', 24, 142.99, 0.08),
      fill('SHOP', 'BUY', 25, 146.879),
    ];

    const trades = buildTradesFromActivities(activities, CTX);
    expect(trades).toHaveLength(2);

    const closed = trades.find(t => t.status === TradeStatus.CLOSED)!;
    expect(closed).toBeDefined();
    expect(closed.shares).toBe(48);
    // First 48 shares bought cost $7,059.005; 48 sold for $6,911.40; fees $0.16.
    expect(closed.netPnL).toBeCloseTo(-147.77, 1);

    const open = trades.find(t => t.status === TradeStatus.OPEN)!;
    expect(open).toBeDefined();
    expect(open.shares).toBe(25);
    expect(open.entryPrice).toBeCloseTo(146.88, 2);
  });

  it("reconstructs the full 2026-08-05 session's realized P&L (~-$257)", () => {
    const activities: SnapTradeActivity[] = [
      // RUN: feed lists the sell before the buys (true intraday short; the
      // long default keeps the same P&L with entry/exit read as buy/sell).
      fill('RUN', 'SELL', 312, 10.52, 0.13),
      fill('RUN', 'BUY', 156, 10.68),
      fill('RUN', 'BUY', 156, 10.68),
      fill('NOW', 'BUY', 45, 118.78),
      fill('NOW', 'SELL', 45, 117.49, 0.12),
      fill('KTOS', 'BUY', 62, 56.735),
      fill('KTOS', 'SELL', 62, 55.89, 0.08),
      fill('BLMN', 'BUY', 111, 11.98),
      fill('BLMN', 'SELL', 111, 12.44, 0.05),
      fill('CVS', 'BUY', 15, 99.6),
      fill('CVS', 'BUY', 106, 99.63),
      // SHOP as above.
      fill('SHOP', 'BUY', 12, 150.925),
      fill('SHOP', 'SELL', 12, 146.98, 0.04),
      fill('SHOP', 'BUY', 13, 145.655),
      fill('SHOP', 'BUY', 3, 147.58),
      fill('SHOP', 'BUY', 5, 145.05),
      fill('SHOP', 'BUY', 2, 145.79),
      fill('SHOP', 'BUY', 3, 145.79),
      fill('SHOP', 'BUY', 5, 145.745),
      fill('SHOP', 'BUY', 5, 145.745),
      fill('SHOP', 'SELL', 6, 142.99, 0.02),
      fill('SHOP', 'SELL', 6, 142.99, 0.02),
      fill('SHOP', 'SELL', 24, 142.99, 0.08),
      fill('SHOP', 'BUY', 25, 146.879),
    ];

    const trades = buildTradesFromActivities(activities, CTX);
    const closed = trades.filter(t => t.status === TradeStatus.CLOSED);
    const open = trades.filter(t => t.status === TradeStatus.OPEN);

    // RUN -50.05, NOW -58.17, KTOS -52.47, BLMN +51.01, SHOP ~-147.77.
    const realized = closed.reduce((s, t) => s + (t.netPnL ?? 0), 0);
    expect(realized).toBeCloseTo(-257.45, 0);

    // Only SHOP 25 @ ~146.88 and CVS 121 @ ~99.63 remain open.
    expect(open.map(t => `${t.symbol}:${t.shares}`).sort()).toEqual(['CVS:121', 'SHOP:25']);
    const cvs = open.find(t => t.symbol === 'CVS')!;
    expect(cvs.entryPrice).toBeCloseTo(99.63, 2);
  });

  it('splits a boundary fill with prorated fees', () => {
    const activities = [
      fill('XYZ', 'BUY', 10, 100),
      fill('XYZ', 'BUY', 10, 102),
      fill('XYZ', 'SELL', 15, 105, 0.3),
    ];
    const trades = buildTradesFromActivities(activities, CTX);
    expect(trades).toHaveLength(2);

    const closed = trades.find(t => t.status === TradeStatus.CLOSED)!;
    expect(closed.shares).toBe(15);
    expect(closed.entryPrice).toBeCloseTo(100.67, 2); // (10×100 + 5×102) / 15
    expect(closed.netPnL).toBeCloseTo(64.7, 2); // 15×105 − 1510 − 0.30

    const open = trades.find(t => t.status === TradeStatus.OPEN)!;
    expect(open.shares).toBe(5);
    expect(open.entryPrice).toBeCloseTo(102, 2);
  });

  it('closes an overnight carry FIFO before pairing the new day', () => {
    const activities = [
      fill('ABC', 'BUY', 100, 10, 0, PREV),
      fill('ABC', 'BUY', 50, 11),
      fill('ABC', 'SELL', 120, 12),
    ];
    const trades = buildTradesFromActivities(activities, CTX);
    expect(trades).toHaveLength(3);

    const closed = trades.filter(t => t.status === TradeStatus.CLOSED);
    const carry = closed.find(t => t.shares === 100)!;
    expect(carry.entryPrice).toBe(10);
    expect(carry.exitPrice).toBe(12);
    expect(carry.netPnL).toBeCloseTo(200, 2);

    const sameDay = closed.find(t => t.shares === 20)!;
    expect(sameDay.entryPrice).toBe(11);
    expect(sameDay.netPnL).toBeCloseTo(20, 2);

    const open = trades.find(t => t.status === TradeStatus.OPEN)!;
    expect(open.shares).toBe(30);
    expect(open.entryPrice).toBe(11);
  });

  it('keeps an explicit short sale SHORT', () => {
    const activities = [
      fill('SHRT', 'SELL', 100, 50, 0, DAY, 'Sell Short 100 SHRT'),
      fill('SHRT', 'BUY', 100, 48),
    ];
    const trades = buildTradesFromActivities(activities, CTX);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe(TradeSide.SHORT);
    expect(trades[0].entryPrice).toBe(50);
    expect(trades[0].exitPrice).toBe(48);
    expect(trades[0].netPnL).toBeCloseTo(200, 2);
  });

  it('labels a sell-listed-first same-stamp round trip LONG (PUSA regression)', () => {
    const activities = [
      fill('PUSA', 'SELL', 500, 2.93, 0.13),
      fill('PUSA', 'BUY', 250, 3.2685),
      fill('PUSA', 'BUY', 250, 3.198),
    ];
    const trades = buildTradesFromActivities(activities, CTX);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe(TradeSide.LONG);
    expect(trades[0].entryPrice).toBeCloseTo(3.23, 2);
    expect(trades[0].exitPrice).toBeCloseTo(2.93, 2);
  });

  it('leaves time-granular fills untouched (genuine short reconstructs)', () => {
    const activities = [
      fill('TG', 'SELL', 100, 50, 0, '2026-08-05T15:00:00Z'),
      fill('TG', 'BUY', 100, 48, 0, '2026-08-05T15:05:00Z'),
    ];
    const trades = buildTradesFromActivities(activities, CTX);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe(TradeSide.SHORT);
    expect(trades[0].netPnL).toBeCloseTo(200, 2);
  });
});
