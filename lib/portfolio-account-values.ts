/**
 * Robinhood crypto de-duplication for the Portfolio total.
 *
 * Robinhood exposes crypto as its own SnapTrade account ("Robinhood Crypto"),
 * but the linked brokerage account's reported `balance.total` already folds
 * that crypto in — Robinhood's own account value is equities + crypto + cash.
 * Summing every account's total therefore counts the crypto twice.
 *
 * Fix: find the parent account whose reported total carries the crypto and
 * subtract the crypto account's value from it, so every account's total stands
 * alone and the totals sum correctly. The parent is identified by its "excess"
 * — reported total minus (its own positions + cash) — rather than by name, so
 * an account that doesn't fold crypto in (e.g. a second cash account) is never
 * touched, and if SnapTrade ever stops folding crypto nothing is subtracted.
 */

export interface AccountValueInput {
  id: string;
  brokerage: string;
  name: string;
  authorizationId: string;
  /** SnapTrade's reported balance.total for the account. */
  totalValue: number | null;
  /** Σ position market values + cash, at the same sync. */
  holdingsValue: number;
}

/** An excess must cover at least this share of the crypto value to count. */
const MIN_EXCESS_SHARE = 0.5;

const r2 = (n: number) => Number(n.toFixed(2));

export function isRobinhoodCryptoAccount(a: Pick<AccountValueInput, 'brokerage' | 'name'>): boolean {
  return /robinhood/i.test(a.brokerage) && /crypto/i.test(a.name);
}

/**
 * Returns each account's de-duplicated total, keyed by account id. Accounts
 * that need no adjustment keep their reported total.
 */
export function dedupeFoldedCryptoTotals(accounts: AccountValueInput[]): Map<string, number | null> {
  const totals = new Map<string, number | null>(accounts.map(a => [a.id, a.totalValue]));

  for (const crypto of accounts) {
    if (!isRobinhoodCryptoAccount(crypto)) continue;
    const cryptoValue = crypto.totalValue;
    if (cryptoValue == null || cryptoValue <= 0) continue;

    let parent: AccountValueInput | null = null;
    let parentExcess = 0;
    for (const a of accounts) {
      if (a.id === crypto.id || isRobinhoodCryptoAccount(a)) continue;
      if (a.authorizationId !== crypto.authorizationId) continue;
      const current = totals.get(a.id);
      if (current == null) continue;
      const excess = current - a.holdingsValue;
      if (excess > parentExcess) {
        parent = a;
        parentExcess = excess;
      }
    }

    if (parent && parentExcess >= cryptoValue * MIN_EXCESS_SHARE) {
      totals.set(parent.id, r2((totals.get(parent.id) as number) - cryptoValue));
    }
  }

  return totals;
}
