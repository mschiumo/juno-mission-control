import { describe, it, expect } from 'vitest';
import { computeWeeklyPnl } from '../lib/trading/weekly-pnl';
import type { Trade } from '../types/trading';
import { TradeSide, TradeStatus, Strategy } from '../types/trading';
import type { DailyFee } from '../lib/parsers/tos-parser';

const WEEK_START = '2026-07-27';
const TODAY = '2026-08-02';

function closed(exitDate: string, netPnL: number, extra: Partial<Trade> = {}): Trade {
  return {
    id: `${exitDate}-${netPnL}`,
    userId: 'u',
    symbol: 'ABC',
    side: TradeSide.LONG,
    status: TradeStatus.CLOSED,
    strategy: Strategy.DAY_TRADE,
    entryDate: exitDate,
    entryPrice: 1,
    shares: 1,
    exitDate,
    exitPrice: 2,
    netPnL,
    createdAt: exitDate,
    updatedAt: exitDate,
    ...extra,
  };
}

const fee = (date: string, amount: number): DailyFee => ({ date, amount });

describe('computeWeeklyPnl', () => {
  it('takes the week\'s broker charges off statement-imported P&L', () => {
    // A statement round trip records the raw price difference, so the week's
    // commissions and borrow fees still have to come off.
    expect(computeWeeklyPnl(
      [closed('2026-07-28T10:00:00-04:00', 500), closed('2026-07-30T14:00:00-04:00', 254.06)],
      [fee('2026-07-28', 120.5), fee('2026-07-30', 333.56)],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: 300, gross: 754.06, fees: 454.06, trades: 2 });
  });

  it('leaves broker-synced trades alone — their fees are already netted out', () => {
    expect(computeWeeklyPnl(
      [closed('2026-07-28T10:00:00-04:00', 500, { source: 'broker', brokerAccountId: 'acct-1' })],
      [fee('2026-07-28', 120.5)],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: 500, gross: 500, fees: 0, trades: 1 });
  });

  it('charges a day once when it holds both statement and broker trades', () => {
    expect(computeWeeklyPnl(
      [closed('2026-07-28T10:00:00-04:00', 100), closed('2026-07-28T11:00:00-04:00', 100, { source: 'broker' })],
      [fee('2026-07-28', 40)],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: 160, gross: 200, fees: 40, trades: 2 });
  });

  it('ignores fees for days outside the counted week', () => {
    expect(computeWeeklyPnl(
      [closed('2026-07-28T10:00:00-04:00', 500)],
      [fee('2026-07-24', 90), fee('2026-08-05', 90), fee('2026-07-28', 10)],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: 490, gross: 500, fees: 10, trades: 1 });
  });

  it('counts Monday through today in ET and nothing either side', () => {
    expect(computeWeeklyPnl(
      [
        closed('2026-07-26T15:00:00-04:00', 1000), // previous Sunday
        closed('2026-07-27T09:31:00-04:00', 25),
        closed('2026-08-02T12:00:00-04:00', 25),
        closed('2026-08-03T09:31:00-04:00', 1000), // next Monday
      ],
      [],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: 50, gross: 50, fees: 0, trades: 2 });
  });

  it('excludes open positions', () => {
    expect(computeWeeklyPnl(
      [
        closed('2026-07-28T10:00:00-04:00', 100),
        { ...closed('2026-07-29T10:00:00-04:00', 9999), status: TradeStatus.OPEN, exitDate: undefined },
      ],
      [],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: 100, gross: 100, fees: 0, trades: 1 });
  });

  it('makes a losing week worse, not better', () => {
    expect(computeWeeklyPnl(
      [closed('2026-07-28T10:00:00-04:00', -200)],
      [fee('2026-07-28', 50)],
      WEEK_START,
      TODAY,
    )).toEqual({ pnl: -250, gross: -200, fees: 50, trades: 1 });
  });
});
