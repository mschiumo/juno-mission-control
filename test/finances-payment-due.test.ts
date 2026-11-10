import { describe, it, expect } from 'vitest';
import {
  applyManualEdit,
  daysUntil,
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
  it('returns null when no due day is set', () => {
    expect(nextPaymentDue(account(), '2026-11-09')).toBeNull();
  });

  it('uses the due day later this month', () => {
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
        account({ id: 'b', name: 'B', dueDay: 15, monthlyPayment: 40 }),
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

describe('applyManualEdit', () => {
  const base = { name: 'X', balance: 100, apr: 10, monthlyPayment: 50 };

  it('replaces the editable fields and stamps updatedAt', () => {
    const next = applyManualEdit(account(), base, NOW);
    expect(next).toMatchObject({ ...base, id: 'acct-1', updatedAt: NOW });
    expect(next.createdAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('sets a due day', () => {
    expect(applyManualEdit(account(), { ...base, dueDay: 15 }, NOW).dueDay).toBe(15);
  });

  it('clears it on null', () => {
    const next = applyManualEdit(account({ dueDay: 15 }), { ...base, dueDay: null }, NOW);
    expect('dueDay' in next).toBe(false);
  });

  it('leaves it alone when omitted', () => {
    expect(applyManualEdit(account({ dueDay: 15 }), base, NOW).dueDay).toBe(15);
  });
});
