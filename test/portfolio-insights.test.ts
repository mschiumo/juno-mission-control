import { describe, it, expect } from 'vitest';
import {
  detectRecurringFlows,
  summarizeIncome,
  summarizeCashFlows,
  positionWeights,
  projectUpcomingDividends,
} from '@/lib/portfolio-insights';
import type { PortfolioActivity, PortfolioPosition } from '@/lib/db/portfolio-connection';

function activity(overrides: Partial<PortfolioActivity>): PortfolioActivity {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-08-01',
    type: 'CONTRIBUTION',
    amount: 500,
    accountId: 'acct-1',
    ...overrides,
  };
}

describe('detectRecurringFlows', () => {
  it('detects a monthly deposit of the same amount', () => {
    const flows = detectRecurringFlows([
      activity({ date: '2026-05-15', amount: 500 }),
      activity({ date: '2026-06-15', amount: 500 }),
      activity({ date: '2026-07-15', amount: 500 }),
      activity({ date: '2026-08-14', amount: 500 }),
    ]);
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({
      type: 'CONTRIBUTION',
      amount: 500,
      cadence: 'monthly',
      occurrences: 4,
      lastDate: '2026-08-14',
      monthlyAmount: 500,
    });
  });

  it('detects a biweekly deposit and scales the monthly amount', () => {
    const flows = detectRecurringFlows([
      activity({ date: '2026-07-03', amount: 250 }),
      activity({ date: '2026-07-17', amount: 250 }),
      activity({ date: '2026-07-31', amount: 250 }),
      activity({ date: '2026-08-14', amount: 250 }),
    ]);
    expect(flows).toHaveLength(1);
    expect(flows[0].cadence).toBe('biweekly');
    expect(flows[0].monthlyAmount).toBeCloseTo(542.5, 1);
  });

  it('ignores fewer than three occurrences and irregular spacing', () => {
    expect(
      detectRecurringFlows([
        activity({ date: '2026-07-01', amount: 100 }),
        activity({ date: '2026-08-01', amount: 100 }),
      ])
    ).toHaveLength(0);
    expect(
      detectRecurringFlows([
        activity({ date: '2026-03-01', amount: 100 }),
        activity({ date: '2026-03-04', amount: 100 }),
        activity({ date: '2026-08-01', amount: 100 }),
      ])
    ).toHaveLength(0);
  });

  it('ignores non-cash-flow activity types', () => {
    expect(
      detectRecurringFlows([
        activity({ date: '2026-06-15', type: 'DIVIDEND', amount: 50 }),
        activity({ date: '2026-07-15', type: 'DIVIDEND', amount: 50 }),
        activity({ date: '2026-08-15', type: 'DIVIDEND', amount: 50 }),
      ])
    ).toHaveLength(0);
  });
});

describe('summarizeIncome', () => {
  it('buckets dividends and interest into trailing windows', () => {
    const income = summarizeIncome(
      [
        activity({ date: '2026-08-20', type: 'DIVIDEND', amount: 12.5 }),
        activity({ date: '2026-05-20', type: 'DIVIDEND', amount: 10 }),
        activity({ date: '2025-05-20', type: 'DIVIDEND', amount: 99 }), // > 12m old
        activity({ date: '2026-08-01', type: 'INTEREST', amount: 1.25 }),
      ],
      '2026-08-30'
    );
    expect(income.dividends30d).toBe(12.5);
    expect(income.dividends12m).toBe(22.5);
    expect(income.interest12m).toBe(1.25);
  });
});

describe('summarizeCashFlows', () => {
  it('nets deposits against withdrawals over 12 months', () => {
    const flows = summarizeCashFlows(
      [
        activity({ date: '2026-08-01', type: 'CONTRIBUTION', amount: 1000 }),
        activity({ date: '2026-07-01', type: 'WITHDRAWAL', amount: -300 }),
        activity({ date: '2025-01-01', type: 'CONTRIBUTION', amount: 5000 }), // too old
      ],
      '2026-08-30'
    );
    expect(flows.deposits12m).toBe(1000);
    expect(flows.withdrawals12m).toBe(300);
    expect(flows.netContributions12m).toBe(700);
  });
});

describe('positionWeights', () => {
  const position = (symbol: string, marketValue: number | null): PortfolioPosition => ({
    symbol,
    units: 1,
    price: marketValue,
    avgCost: null,
    costBasis: null,
    marketValue,
    openPnl: null,
    accountId: 'acct-1',
  });

  it('computes weights as a share of total market value, heaviest first', () => {
    const weights = positionWeights([
      position('AAA', 750),
      position('BBB', 250),
      position('NOVAL', null),
    ]);
    expect(weights).toEqual([
      { symbol: 'AAA', marketValue: 750, weight: 75 },
      { symbol: 'BBB', marketValue: 250, weight: 25 },
    ]);
  });

  it('returns empty when nothing has a market value', () => {
    expect(positionWeights([position('AAA', null)])).toEqual([]);
  });
});

describe('projectUpcomingDividends', () => {
  const pos = (symbol: string, units: number): PortfolioPosition => ({
    symbol, units, price: 50, avgCost: 50, costBasis: null, marketValue: units * 50, openPnl: null, accountId: 'acct-1',
  });
  const div = (symbol: string, date: string, amount: number) =>
    activity({ type: 'DIVIDEND', symbol, date, amount, units: 0 });

  it('projects a monthly payer one month past its last payment', () => {
    const out = projectUpcomingDividends(
      [div('JEPI', '2026-07-02', 50), div('JEPI', '2026-08-04', 50), div('JEPI', '2026-09-02', 50)],
      [pos('JEPI', 100)],
      '2026-09-20'
    );
    expect(out).toEqual([
      expect.objectContaining({ symbol: 'JEPI', date: '2026-10-02', amount: 50, cadence: 'monthly', perShare: 0.5 }),
    ]);
  });

  it('re-prices the last payout per share for shares sold since', () => {
    const out = projectUpcomingDividends(
      [
        div('JEPI', '2026-08-04', 100),
        div('JEPI', '2026-09-02', 100),
        activity({ type: 'SELL', symbol: 'JEPI', date: '2026-09-09', units: -60, amount: 3000 }),
      ],
      [pos('JEPI', 40)],
      '2026-09-20'
    );
    // 100 shares at the ex-date → $1/share × 40 held now.
    expect(out[0]).toMatchObject({ amount: 40, perShare: 1 });
  });

  it('detects quarterly cadence, rolls weekends to Monday, and sorts soonest first', () => {
    const out = projectUpcomingDividends(
      [
        div('XLE', '2026-03-24', 6), div('XLE', '2026-06-23', 6), div('XLE', '2026-09-22', 6),
        div('SPYI', '2026-08-20', 60), div('SPYI', '2026-09-17', 60),
      ],
      [pos('XLE', 10), pos('SPYI', 100)],
      '2026-10-01'
    );
    expect(out.map(u => [u.symbol, u.date, u.cadence])).toEqual([
      ['SPYI', '2026-10-19', 'monthly'], // Oct 17 is a Saturday
      ['XLE', '2026-12-22', 'quarterly'],
    ]);
  });

  it('skips unheld symbols, single payments, and payers gone quiet', () => {
    const out = projectUpcomingDividends(
      [
        div('LQDW', '2026-08-05', 50), div('LQDW', '2026-09-03', 50),
        div('SO', '2026-08-18', 1),
        div('AAPL', '2020-08-10', 1), div('AAPL', '2020-11-09', 1),
      ],
      [pos('SO', 5), pos('AAPL', 5)],
      '2026-10-01'
    );
    expect(out).toEqual([]);
  });
});
