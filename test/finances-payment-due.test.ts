import { describe, it, expect } from 'vitest';
import {
  applyManualEdit,
  daysUntil,
  expectedPayment,
  nextPaymentDue,
  nextPaymentSummary,
  toLocalDateKey,
  type CreditAccount,
} from '../lib/finances/credit-cards';

const NOW = '2026-11-09T12:00:00.000Z';

function account(overrides: Partial<CreditAccount> = {}): CreditAccount {
  return {
    id: 'acct-1',
    name: 'CapitalOne QS',
    balance: 3491,
    apr: 18.49,
    monthlyPayment: 250,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('nextPaymentDue', () => {
  it('returns null when neither the bank nor the user has given a date', () => {
    expect(nextPaymentDue(account(), '2026-11-09')).toBeNull();
  });

  it('uses the user due day later this month', () => {
    expect(nextPaymentDue(account({ dueDay: 15 }), '2026-11-09')).toBe('2026-11-15');
  });

  it('treats the due day itself as still upcoming', () => {
    expect(nextPaymentDue(account({ dueDay: 9 }), '2026-11-09')).toBe('2026-11-09');
  });

  it('rolls a passed due day into next month', () => {
    expect(nextPaymentDue(account({ dueDay: 3 }), '2026-11-09')).toBe('2026-12-03');
  });

  it('rolls December into January of the next year', () => {
    expect(nextPaymentDue(account({ dueDay: 5 }), '2026-12-20')).toBe('2027-01-05');
  });

  it('clamps a 31st to the last day of a short month', () => {
    expect(nextPaymentDue(account({ dueDay: 31 }), '2026-11-09')).toBe('2026-11-30');
    expect(nextPaymentDue(account({ dueDay: 30 }), '2026-02-10')).toBe('2026-02-28');
  });

  it('prefers a fresh bank-reported date over the user due day', () => {
    expect(nextPaymentDue(account({ dueDay: 15, nextDueDate: '2026-11-12' }), '2026-11-09')).toBe(
      '2026-11-12',
    );
  });

  it('falls back to the user due day once the bank date is stale', () => {
    expect(nextPaymentDue(account({ dueDay: 15, nextDueDate: '2026-11-02' }), '2026-11-09')).toBe(
      '2026-11-15',
    );
  });

  it('rolls a stale bank date forward by its day-of-month when no due day is set', () => {
    expect(nextPaymentDue(account({ nextDueDate: '2026-10-21' }), '2026-11-09')).toBe('2026-11-21');
  });

  it('ignores a malformed due day', () => {
    expect(nextPaymentDue(account({ dueDay: 0 }), '2026-11-09')).toBeNull();
    expect(nextPaymentDue(account({ dueDay: 32 }), '2026-11-09')).toBeNull();
    expect(nextPaymentDue(account({ dueDay: 15.5 }), '2026-11-09')).toBeNull();
  });
});

describe('daysUntil / toLocalDateKey', () => {
  it('counts whole days', () => {
    expect(daysUntil('2026-11-15', '2026-11-09')).toBe(6);
    expect(daysUntil('2026-11-09', '2026-11-09')).toBe(0);
    expect(daysUntil('2026-12-01', '2026-11-30')).toBe(1);
    expect(daysUntil('2026-11-01', '2026-11-09')).toBe(-8);
  });

  it('formats the local calendar date, zero-padded', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('expectedPayment', () => {
  it('prefers the planned payment, then the bank minimum, then zero', () => {
    expect(expectedPayment({ monthlyPayment: 250, minPayment: 45 })).toBe(250);
    expect(expectedPayment({ monthlyPayment: 0, minPayment: 45 })).toBe(45);
    expect(expectedPayment({ monthlyPayment: 0 })).toBe(0);
  });
});

describe('nextPaymentSummary', () => {
  it('is null with no dated accounts', () => {
    expect(nextPaymentSummary([account(), account({ id: 'b' })], '2026-11-09')).toBeNull();
  });

  it('picks the soonest due date', () => {
    const summary = nextPaymentSummary(
      [
        account({ id: 'a', name: 'A', dueDay: 20, monthlyPayment: 100 }),
        account({ id: 'b', name: 'B', dueDay: 12, monthlyPayment: 300 }),
        account({ id: 'c', name: 'C', dueDay: 3, monthlyPayment: 50 }), // rolls to Dec 3
      ],
      '2026-11-09',
    );
    expect(summary).toEqual({ date: '2026-11-12', amount: 300, accounts: [{ id: 'b', name: 'B' }] });
  });

  it('folds together every account due on that day', () => {
    const summary = nextPaymentSummary(
      [
        account({ id: 'a', name: 'A', dueDay: 15, monthlyPayment: 100 }),
        account({ id: 'b', name: 'B', dueDay: 15, monthlyPayment: 0, minPayment: 40 }),
        account({ id: 'c', name: 'C', dueDay: 16, monthlyPayment: 999 }),
      ],
      '2026-11-09',
    );
    expect(summary?.date).toBe('2026-11-15');
    expect(summary?.amount).toBe(140);
    expect(summary?.accounts.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('skips paid-off accounts', () => {
    const summary = nextPaymentSummary(
      [account({ id: 'a', dueDay: 10, balance: 0 }), account({ id: 'b', name: 'B', dueDay: 20 })],
      '2026-11-09',
    );
    expect(summary?.date).toBe('2026-11-20');
    expect(summary?.accounts).toEqual([{ id: 'b', name: 'B' }]);
  });
});

describe('applyManualEdit dueDay', () => {
  const base = { name: 'X', balance: 100, apr: 10, monthlyPayment: 50 };

  it('sets a due day', () => {
    const next = applyManualEdit(account(), { ...base, dueDay: 15 }, undefined, NOW);
    expect(next.dueDay).toBe(15);
  });

  it('clears it on null', () => {
    const next = applyManualEdit(account({ dueDay: 15 }), { ...base, dueDay: null }, undefined, NOW);
    expect(next.dueDay).toBeUndefined();
    expect('dueDay' in next).toBe(false);
  });

  it('leaves it alone when omitted', () => {
    const next = applyManualEdit(account({ dueDay: 15 }), base, undefined, NOW);
    expect(next.dueDay).toBe(15);
  });
});
