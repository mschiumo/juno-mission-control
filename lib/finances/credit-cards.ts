// Credit Card Balance tracker — shared types, seed data, and payoff math.
//
// Namespaced under lib/finances (plural) and Redis keys finances:{userId}:* so it
// cannot collide with the older unmerged feat/finance-tracker branch (PR #431),
// which owns lib/finance/* and finance:{userId}:* keys.

/** Where an account's numbers come from. Absent = manual (pre-Plaid accounts). */
export type AccountSource = 'manual' | 'plaid';

/** Health of a Plaid-linked account's last sync attempt. */
export type SyncStatus = 'ok' | 'reauth-required' | 'error';

/**
 * Fields a user may pin by hand on a *linked* account. Sync refuses to
 * overwrite a pinned field, so a manual correction is never silently reverted
 * by the nightly cron. `name` and `monthlyPayment` are always user-owned and so
 * are deliberately not pinnable.
 */
export type OverridableField = 'balance' | 'apr';

export interface CreditAccount {
  id: string;
  name: string; // user-owned label — sync never rewrites it after creation
  balance: number; // current balance, dollars
  apr: number; // annual percentage rate, e.g. 18.49
  monthlyPayment: number; // user's PLANNED monthly payment (not Plaid's minimum)
  createdAt: string;
  updatedAt: string;

  // --- Live sync (present only once linked through Plaid) ---
  source?: AccountSource;
  plaidItemId?: string; // the Plaid Item (one institution login) this came from
  plaidAccountId?: string; // Plaid's account_id — the stable join key
  institutionName?: string;
  mask?: string; // last 4 digits, as reported by Plaid
  lastSyncedAt?: string; // ISO timestamp of the last successful sync
  syncStatus?: SyncStatus;
  syncError?: string; // human-readable reason when syncStatus !== 'ok'

  /** Fields the user pinned by hand; sync leaves these alone. */
  manualOverrides?: OverridableField[];

  /**
   * Last values Plaid reported, retained even while a field is pinned, so the UI
   * can show "Plaid says X, you set Y" and un-pinning can restore instantly.
   */
  syncedBalance?: number;
  syncedApr?: number;

  // --- Informational, always refreshed from Plaid (never user-edited) ---
  creditLimit?: number;
  minPayment?: number; // Plaid's statement minimum — distinct from monthlyPayment
  nextDueDate?: string; // YYYY-MM-DD
  lastStatementBalance?: number;
}

/** One credit account's worth of freshly-fetched Plaid data. */
export interface PlaidAccountSnapshot {
  plaidItemId: string;
  plaidAccountId: string;
  institutionName: string;
  name: string; // Plaid's account name — used only when creating a new account
  mask?: string;
  balance: number; // amount owed, positive
  apr?: number; // purchase APR, when the institution reports one
  creditLimit?: number;
  minPayment?: number;
  nextDueDate?: string;
  lastStatementBalance?: number;
}

export function isPinned(account: CreditAccount, field: OverridableField): boolean {
  return !!account.manualOverrides?.includes(field);
}

export function isLinked(account: CreditAccount): boolean {
  return account.source === 'plaid' && !!account.plaidAccountId;
}

/**
 * Fold a fresh Plaid snapshot into an existing account.
 *
 * Ownership rules — deliberately conservative, because silently reverting a
 * correction the user typed is worse than showing a slightly stale number:
 *  - `name`, `monthlyPayment`: user-owned, never touched here.
 *  - `balance`, `apr`: taken from Plaid unless pinned. `apr` additionally only
 *    updates when Plaid actually reports one (many store cards report none, and
 *    0% promotional cards like Affirm often omit it) — otherwise the existing
 *    value stands rather than being zeroed out.
 *  - informational fields: always replaced; they are pure Plaid data.
 */
export function applySnapshot(
  existing: CreditAccount,
  snap: PlaidAccountSnapshot,
  now: string,
): CreditAccount {
  const next: CreditAccount = {
    ...existing,
    source: 'plaid',
    plaidItemId: snap.plaidItemId,
    plaidAccountId: snap.plaidAccountId,
    institutionName: snap.institutionName,
    mask: snap.mask ?? existing.mask,
    lastSyncedAt: now,
    syncStatus: 'ok',
    syncError: undefined,
    syncedBalance: snap.balance,
    creditLimit: snap.creditLimit,
    minPayment: snap.minPayment,
    nextDueDate: snap.nextDueDate,
    lastStatementBalance: snap.lastStatementBalance,
    updatedAt: now,
  };

  if (!isPinned(existing, 'balance')) {
    next.balance = snap.balance;
  }

  if (typeof snap.apr === 'number' && Number.isFinite(snap.apr)) {
    next.syncedApr = snap.apr;
    if (!isPinned(existing, 'apr')) {
      next.apr = snap.apr;
    }
  }

  return next;
}

export interface ManualEdit {
  name: string;
  balance: number;
  apr: number;
  monthlyPayment: number;
}

/**
 * What the client displayed when the user opened the edit form. Sent back on
 * save so intent can be judged against what the user actually saw.
 */
export interface SeenValues {
  balance?: number;
  apr?: number;
}

/**
 * Apply a manual edit, pinning only the plaid-owned fields the user genuinely
 * changed.
 *
 * Intent is measured against `seen` — the values the edit form was populated
 * with — not against what is currently stored. Otherwise a sync landing between
 * page load and save makes the user's untouched, now-stale form value look like
 * a deliberate override, permanently pinning a balance they never edited. When
 * a field wasn't changed, the stored value is kept rather than being rewritten
 * with stale data.
 *
 * `seen` is optional: without it (an older client, or a direct API call) this
 * falls back to comparing against the stored values.
 */
export function applyManualEdit(
  existing: CreditAccount,
  edit: ManualEdit,
  seen: SeenValues | undefined,
  now: string,
): CreditAccount {
  const next: CreditAccount = {
    ...existing,
    name: edit.name,
    monthlyPayment: edit.monthlyPayment,
    updatedAt: now,
  };

  const linked = isLinked(existing);
  const pinned = new Set<OverridableField>(existing.manualOverrides ?? []);

  for (const field of ['balance', 'apr'] as const) {
    const baseline = seen?.[field] ?? existing[field];
    const changed = !nearlyEqual(edit[field], baseline);

    if (changed) {
      next[field] = edit[field];
      if (linked) pinned.add(field);
    } else if (seen?.[field] !== undefined) {
      // Untouched by the user — keep whatever is stored, which may be fresher
      // than the value their form was holding.
      next[field] = existing[field];
    } else {
      next[field] = edit[field];
    }
  }

  if (pinned.size) next.manualOverrides = [...pinned];
  return next;
}

/** Dollar/percent comparison tolerant of float round-trips through JSON. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Drop pins and restore the last Plaid-reported values, so "resume syncing"
 * takes effect immediately instead of waiting for the next refresh.
 */
export function clearOverrides(account: CreditAccount, now: string): CreditAccount {
  return {
    ...account,
    manualOverrides: [],
    balance: account.syncedBalance ?? account.balance,
    apr: account.syncedApr ?? account.apr,
    updatedAt: now,
  };
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
