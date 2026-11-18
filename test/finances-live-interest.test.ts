import { describe, it, expect } from 'vitest';
import {
  monthlyInterest,
  parseDraft,
  previewEdit,
  withLiveEdit,
  weightedAvgApr,
  type AccountDraft,
  type CreditAccount,
} from '../lib/finances/credit-cards';

function account(overrides: Partial<CreditAccount> = {}): CreditAccount {
  return {
    id: 'acct-1',
    name: 'CapitalOne QS',
    balance: 3491,
    apr: 18.49,
    monthlyPayment: 250,
    dueDay: 15,
    paymentMethod: 'Chase',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function draft(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    name: 'CapitalOne QS',
    balance: '3491',
    apr: '18.49',
    monthlyPayment: '250',
    dueDay: '15',
    paymentMethod: 'Chase',
    ...overrides,
  };
}

describe('monthlyInterest tracks the balance', () => {
  it('falls as the balance is paid down at a fixed APR', () => {
    const before = monthlyInterest(3491, 18.49);
    const after = monthlyInterest(2000, 18.49);
    expect(before).toBeCloseTo(53.79, 2);
    expect(after).toBeCloseTo(30.82, 2);
    expect(after).toBeLessThan(before);
  });

  it('is zero once the line is paid off', () => {
    expect(monthlyInterest(0, 28)).toBe(0);
  });
});

describe('parseDraft', () => {
  it('reads amounts as numbers and keeps the due day / payment method', () => {
    expect(parseDraft(draft())).toEqual({
      name: 'CapitalOne QS',
      balance: 3491,
      apr: 18.49,
      monthlyPayment: 250,
      dueDay: 15,
      paymentMethod: 'Chase',
    });
  });

  it('treats blank amounts as 0 and blank optional fields as cleared', () => {
    expect(parseDraft(draft({ balance: '', apr: '', monthlyPayment: '', dueDay: '', paymentMethod: '  ' }))).toEqual({
      name: 'CapitalOne QS',
      balance: 0,
      apr: 0,
      monthlyPayment: 0,
      dueDay: null,
      paymentMethod: null,
    });
  });

  it('clears a non-numeric due day instead of storing NaN', () => {
    expect(parseDraft(draft({ dueDay: 'abc' })).dueDay).toBeNull();
  });

  it('reads a half-typed balance as the number typed so far', () => {
    expect(parseDraft(draft({ balance: '20' })).balance).toBe(20);
  });
});

describe('previewEdit', () => {
  it('reflects a lower balance in the interest before anything is saved', () => {
    const stored = account();
    const live = previewEdit(stored, draft({ balance: '2000' }));
    expect(live.balance).toBe(2000);
    expect(monthlyInterest(live.balance, live.apr)).toBeLessThan(monthlyInterest(stored.balance, stored.apr));
    // Timestamps are untouched — this is a preview, not a save.
    expect(live.updatedAt).toBe(stored.updatedAt);
    expect(live.id).toBe(stored.id);
  });

  it('matches what applyManualEdit will store for the same draft', () => {
    const live = previewEdit(account(), draft({ apr: '22', monthlyPayment: '', dueDay: '', paymentMethod: '' }));
    expect(live.apr).toBe(22);
    expect(live.monthlyPayment).toBe(0);
    expect(live.dueDay).toBeUndefined();
    expect(live.paymentMethod).toBeUndefined();
  });
});

describe('withLiveEdit', () => {
  const stored = [account(), account({ id: 'acct-2', name: 'Venmo', balance: 4202, apr: 28, monthlyPayment: 300 })];

  it('returns the same array when nothing is being edited', () => {
    expect(withLiveEdit(stored, null, draft())).toBe(stored);
  });

  it('swaps only the edited row and leaves the rest alone', () => {
    const live = withLiveEdit(stored, 'acct-2', draft({ name: 'Venmo', balance: '1000', apr: '28', monthlyPayment: '300' }));
    expect(live[0]).toBe(stored[0]);
    expect(live[1].balance).toBe(1000);
    expect(live[1].id).toBe('acct-2');
  });

  it('feeds the summary totals the unsaved balance', () => {
    const live = withLiveEdit(stored, 'acct-2', draft({ name: 'Venmo', balance: '1000', apr: '28', monthlyPayment: '300' }));
    const totalInterest = live.reduce((s, a) => s + monthlyInterest(a.balance, a.apr), 0);
    const storedInterest = stored.reduce((s, a) => s + monthlyInterest(a.balance, a.apr), 0);
    expect(totalInterest).toBeCloseTo(monthlyInterest(3491, 18.49) + monthlyInterest(1000, 28), 6);
    expect(totalInterest).toBeLessThan(storedInterest);
    expect(weightedAvgApr(live)).toBeLessThan(weightedAvgApr(stored));
  });
});
