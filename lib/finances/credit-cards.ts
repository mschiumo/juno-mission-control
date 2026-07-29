// Credit Card Balance tracker — shared types, seed data, and payoff math.
//
// Namespaced under lib/finances (plural) and Redis keys finances:{userId}:* so it
// cannot collide with the older unmerged feat/finance-tracker branch (PR #431),
// which owns lib/finance/* and finance:{userId}:* keys.

export interface CreditAccount {
  id: string;
  name: string;
  balance: number; // current balance, dollars
  apr: number; // annual percentage rate, e.g. 18.49
  monthlyPayment: number; // planned monthly payment, dollars (0 = not set)
  createdAt: string;
  updatedAt: string;
}

// One snapshot per EST day — recorded on every mutation so the history chart
// builds itself over time.
export interface BalanceSnapshot {
  date: string; // YYYY-MM-DD (EST)
  total: number;
  balances: Record<string, number>; // account id -> balance
}

export const CREDIT_ACCOUNTS_KEY = (userId: string) => `finances:${userId}:credit-cards`;
export const CREDIT_HISTORY_KEY = (userId: string) => `finances:${userId}:credit-history`;

// First-run seed — the owner's real accounts (from their spreadsheet, 2026-07-30).
// Monthly payments start at 0 until filled in via the UI.
export const SEED_ACCOUNTS: Array<Pick<CreditAccount, 'name' | 'balance' | 'apr'>> = [
  { name: 'CapitalOne QS', balance: 3491, apr: 18.49 },
  { name: 'CapitalOne Venture', balance: 6218, apr: 25.5 },
  { name: 'Affirm', balance: 2314, apr: 0 },
  { name: 'Chase Business', balance: 4206, apr: 23 },
  { name: 'Venmo', balance: 4202, apr: 28 },
  { name: 'Amazon (Synchrony)', balance: 5139, apr: 30 },
  { name: 'Apple', balance: 16243, apr: 19.5 },
];

/** Interest accrued in one month at the account's APR (monthly compounding). */
export function monthlyInterest(balance: number, apr: number): number {
  return balance * (apr / 100 / 12);
}

export type PayoffProjection =
  | { status: 'ok'; months: number; totalInterest: number }
  | { status: 'no-payment' }
  | { status: 'payment-too-low' }; // payment doesn't cover monthly interest — balance grows forever

/**
 * Simulate fixed monthly payments with monthly compounding until the balance
 * hits zero. Exact month-by-month loop (capped at 100 years) rather than the
 * closed-form log formula so totalInterest accounts for the smaller final payment.
 */
export function projectPayoff(balance: number, apr: number, payment: number): PayoffProjection {
  if (payment <= 0) return { status: 'no-payment' };
  if (balance <= 0) return { status: 'ok', months: 0, totalInterest: 0 };
  const r = apr / 100 / 12;
  if (r > 0 && payment <= balance * r) return { status: 'payment-too-low' };

  let remaining = balance;
  let totalInterest = 0;
  let months = 0;
  while (remaining > 0 && months < 1200) {
    const interest = remaining * r;
    totalInterest += interest;
    remaining = remaining + interest - payment;
    months++;
  }
  if (remaining > 0) return { status: 'payment-too-low' };
  return { status: 'ok', months, totalInterest };
}

/** Balance-weighted average APR across accounts (0 if no debt). */
export function weightedAvgApr(accounts: Array<Pick<CreditAccount, 'balance' | 'apr'>>): number {
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  if (total <= 0) return 0;
  return accounts.reduce((s, a) => s + a.apr * a.balance, 0) / total;
}
