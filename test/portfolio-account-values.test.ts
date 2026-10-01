import { describe, it, expect } from 'vitest';
import { dedupeFoldedCryptoTotals, type AccountValueInput } from '@/lib/portfolio-account-values';

function acct(overrides: Partial<AccountValueInput>): AccountValueInput {
  return {
    id: 'a',
    brokerage: 'Robinhood',
    name: 'Robinhood Individual',
    authorizationId: 'auth-1',
    totalValue: 0,
    holdingsValue: 0,
    ...overrides,
  };
}

describe('dedupeFoldedCryptoTotals', () => {
  // Shape of MJ's real Robinhood link (2026-10-01): the main account's total
  // folds in the crypto account's value; the agentic cash account does not.
  const main = acct({ id: 'main', totalValue: 103607.65, holdingsValue: 102725.78 });
  const agentic = acct({ id: 'agentic', totalValue: 327.64, holdingsValue: 326.75 });
  const crypto = acct({ id: 'crypto', name: 'Robinhood Crypto', totalValue: 648.9, holdingsValue: 638.04 });

  it('subtracts the crypto value from the account that folds it in', () => {
    const totals = dedupeFoldedCryptoTotals([agentic, crypto, main]);
    expect(totals.get('main')).toBe(102958.75);
    expect(totals.get('agentic')).toBe(327.64);
    expect(totals.get('crypto')).toBe(648.9);
    const sum = [...totals.values()].reduce((s: number, v) => s + (v ?? 0), 0);
    expect(Number(sum.toFixed(2))).toBe(103935.29);
  });

  it('leaves totals alone when no account carries the crypto', () => {
    const unfolded = acct({ id: 'main', totalValue: 102725.78, holdingsValue: 102725.78 });
    const totals = dedupeFoldedCryptoTotals([unfolded, crypto]);
    expect(totals.get('main')).toBe(102725.78);
  });

  it('ignores accounts under a different authorization and non-Robinhood brokers', () => {
    const other = { ...main, id: 'other', authorizationId: 'auth-2' };
    const schwab = acct({ id: 'schwab', brokerage: 'Schwab', name: 'Crypto Fund', totalValue: 500, holdingsValue: 500 });
    const totals = dedupeFoldedCryptoTotals([other, crypto, schwab]);
    expect(totals.get('other')).toBe(103607.65);
    expect(totals.get('schwab')).toBe(500);
  });

  it('skips a crypto account with no reported value', () => {
    const totals = dedupeFoldedCryptoTotals([main, { ...crypto, totalValue: null }]);
    expect(totals.get('main')).toBe(103607.65);
  });
});
