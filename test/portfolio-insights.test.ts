import { describe, it, expect } from 'vitest';
import {
  detectRecurringFlows,
  summarizeIncome,
  summarizeCashFlows,
  positionWeights,
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
