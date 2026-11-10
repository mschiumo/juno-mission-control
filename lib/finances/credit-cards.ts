// Credit Card Balance tracker — shared types, seed data, and payoff math.
//
// Namespaced under lib/finances (plural) and Redis keys finances:{userId}:* so it
// cannot collide with the older unmerged feat/finance-tracker branch (PR #431),
// which owns lib/finance/* and finance:{userId}:* keys.
//
// Accounts are entered and maintained by hand. A bank-sync integration (Plaid)
// once lived here; it was removed from production and is preserved on the
// `archive/finances-plaid-sync` branch should it ever be revisited.

export interface CreditAccount {
  id: string;
  name: string;
  balance: number; // current balance, dollars
  apr: number; // annual percentage rate, e.g. 18.49
  monthlyPayment: number; // user's PLANNED monthly payment
  /**
   * Day of the month (1–31) the payment is due. Days past the end of a short
   * month land on that month's last day.
   */
  dueDay?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManualEdit {
  name: string;
  balance: number;
  apr: number;
  monthlyPayment: number;
  /** A day sets it, `null` clears it, and leaving it out keeps what's stored. */
  dueDay?: number | null;
}

/** Apply an edit from the form to a stored account. */
export function applyManualEdit(existing: CreditAccount, edit: ManualEdit, now: string): CreditAccount {
  const next: CreditAccount = {
    ...existing,
    name: edit.name,
    balance: edit.balance,
    apr: edit.apr,
    monthlyPayment: edit.monthlyPayment,
    updatedAt: now,
  };

  if (edit.dueDay === null) delete next.dueDay;
  else if (typeof edit.dueDay === 'number') next.dueDay = edit.dueDay;

  return next;
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

/* ------------------------------ payment due dates ----------------------------- */

/** Local calendar date as YYYY-MM-DD — the viewer's "today", not UTC's. */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The account's next payment due date (YYYY-MM-DD): the first occurrence of
 * its due day on or after `today`, clamped to short months. Null when no
 * valid due day is set.
 */
export function nextPaymentDue(account: Pick<CreditAccount, 'dueDay'>, today: string): string | null {
  const dueDay = account.dueDay;
  if (!Number.isInteger(dueDay) || dueDay! < 1 || dueDay! > 31) return null;

  const [y, m, d] = today.split('-').map(Number);
  const thisMonthDay = Math.min(dueDay!, daysInMonth(y, m - 1));
  if (thisMonthDay >= d) return dateKey(y, m, thisMonthDay);

  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return dateKey(ny, nm, Math.min(dueDay!, daysInMonth(ny, nm - 1)));
}

/** Whole days from `today` to `date` (both YYYY-MM-DD); negative if past. */
export function daysUntil(date: string, today: string): number {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = date.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export interface NextPaymentSummary {
  date: string; // YYYY-MM-DD
  amount: number; // sum of planned payments across accounts due that day
  accounts: Array<Pick<CreditAccount, 'id' | 'name'>>;
}

/**
 * The soonest upcoming due date across accounts still carrying a balance, with
 * every account due that day folded together. Null when no account has a
 * due day.
 */
export function nextPaymentSummary(accounts: CreditAccount[], today: string): NextPaymentSummary | null {
  const dated = accounts
    .filter((a) => a.balance > 0)
    .map((a) => ({ a, date: nextPaymentDue(a, today) }))
    .filter((x): x is { a: CreditAccount; date: string } => x.date !== null);
  if (dated.length === 0) return null;

  const date = dated.map((x) => x.date).sort()[0];
  const due = dated.filter((x) => x.date === date).map((x) => x.a);
  return {
    date,
    amount: due.reduce((s, a) => s + a.monthlyPayment, 0),
    accounts: due.map((a) => ({ id: a.id, name: a.name })),
  };
}

/** Balance-weighted average APR across accounts (0 if no debt). */
export function weightedAvgApr(accounts: Array<Pick<CreditAccount, 'balance' | 'apr'>>): number {
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  if (total <= 0) return 0;
  return accounts.reduce((s, a) => s + a.apr * a.balance, 0) / total;
}
