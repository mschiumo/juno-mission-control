/**
 * Finance tracker types — owner-only Dashboard feature.
 *
 * Data sources today: manual entry, Google Sheet sync (lib/finance/sheet-sync.ts
 * — edit numbers in a link-shared sheet, sync into the dashboard), and
 * statement CSV import (lib/finance/apple-card-csv.ts — Apple Card has no
 * aggregator support; FinanceKit is iOS-native only). The `source`/`externalId`
 * fields are the integration seam for live aggregator data.
 *
 * NEXT STEPS — connecting live account data (in rough priority order):
 *
 * 1. Teller (https://teller.io) — recommended first integration.
 *    - Free developer tier (100 live enrollments), no sales process.
 *    - Flow mirrors the existing SnapTrade integration (app/api/snaptrade/*):
 *      a. New routes: app/api/finance/teller/connect, /accounts, /sync, /disconnect
 *      b. Client opens Teller Connect (https://teller.io/docs/guides/connect),
 *         which returns an accessToken on enrollment.
 *      c. Store the token per-user in Redis (`finance:{userId}:teller`) —
 *         ENCRYPT AT REST (aggregator tokens are bank credentials; see
 *         lib/crypto pattern or add AES-GCM with a KMS-style env secret).
 *      d. Sync pulls GET /accounts, /accounts/{id}/balances,
 *         /accounts/{id}/transactions and upserts DebtAccount records with
 *         source: 'teller' + externalId. Manual fields (apr, minPayment,
 *         dueDay) stay user-editable — Teller doesn't expose card APRs.
 *      e. Nightly refresh via the existing cron infra (app/api/run-cron).
 *
 * 2. Plaid (https://plaid.com/docs) — broader coverage, adds the Liabilities
 *    product which DOES return APR, minimum payment, and due date for credit
 *    cards (so steps here replace the manual apr/minPayment/dueDay entry).
 *    Production access is sales-led and Transactions/Liabilities bill
 *    per-item monthly — fine for a single owner, but gate connect behind
 *    requireOwner() exactly like SnapTrade billing protection.
 *
 * 3. SimpleFIN Bridge (https://beta-bridge.simplefin.org) — $15/yr, read-only,
 *    daily refresh. User pays directly and pastes a setup token, so there is
 *    zero billing exposure in the app. Good fallback for institutions Teller
 *    misses.
 *
 * 4. Sheet sync upgrades — nightly cron refresh (run-cron pattern) and
 *    private-sheet access via the lib/google-calendar.ts service-account JWT
 *    flow (share the sheet with GOOGLE_SERVICE_ACCOUNT_EMAIL, scope
 *    spreadsheets.readonly) so the link needn't be viewable by anyone.
 *
 * 5. Expense tracking depth — category budgets and month-over-month trends
 *    on top of imported/synced transactions, and feed actual spending into
 *    the payoff planner's monthlyBudget.
 */

export type DebtType =
  | 'credit-card'
  | 'auto-loan'
  | 'student-loan'
  | 'personal-loan'
  | 'mortgage'
  | 'other';

export type AccountSource = 'manual' | 'gsheet' | 'teller' | 'plaid' | 'simplefin';

export interface DebtAccount {
  id: string;
  name: string; // e.g. "Chase Sapphire"
  type: DebtType;
  balance: number; // current balance in dollars
  apr: number; // annual percentage rate, e.g. 24.99
  minPayment: number; // minimum monthly payment in dollars
  dueDay: number; // day of month payment is due (1–28)
  source: AccountSource;
  externalId?: string; // aggregator account id once connected
  createdAt: string;
  updatedAt: string;
}

/**
 * A single imported card/loan transaction (currently from Apple Card
 * statement CSV exports; later from aggregator sync).
 * Sign convention: positive = charge/purchase, negative = payment/credit.
 */
export interface FinanceTransaction {
  id: string; // dedupe key derived from date+description+amount
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  amount: number;
  type: string; // raw Type column from the statement (Purchase/Payment/…)
  importedAt: string;
}

/** Per-month spending rollup for the UI. */
export interface MonthlySpendSummary {
  month: string; // YYYY-MM
  charges: number; // sum of positive amounts
  payments: number; // abs sum of negative amounts
  byCategory: Record<string, number>; // charges only
  count: number;
}

/** Saved Google Sheet link for account sync. */
export interface SheetLink {
  url: string; // as pasted by the user
  lastSyncedAt: string | null;
  lastResult: string | null; // human-readable outcome of the last sync
}

/** Asset-side accounts: investments and cash (savings/checking). */
export type BalanceKind = 'investment' | 'savings' | 'checking' | 'other';

export interface BalanceAccount {
  id: string;
  name: string; // e.g. "Fidelity 401(k)", "Ally HYSA"
  kind: BalanceKind;
  balance: number;
  institution?: string;
  source: AccountSource;
  createdAt: string;
  updatedAt: string;
}

/** One point in a balance-over-time series (per-day totals). */
export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * The three tracked series for the Finances charts. Snapshots are appended
 * server-side on every mutation (see lib/finance/history.ts), so progress
 * accrues automatically as balances get updated/synced over time.
 */
export interface FinanceHistory {
  debt: HistoryPoint[];
  investment: HistoryPoint[];
  savings: HistoryPoint[]; // savings + checking + other combined
}

export type PayoffStrategy = 'avalanche' | 'snowball' | 'minimum-only';

export interface FinanceSettings {
  monthlyBudget: number; // total dollars/month toward all debt
  strategy: PayoffStrategy;
  updatedAt: string;
}

/** One concrete payment instruction: pay $X on account Y by date Z. */
export interface ScheduledPayment {
  accountId: string;
  accountName: string;
  date: string; // YYYY-MM-DD — the account's due date that month
  amount: number;
  interest: number; // portion of the payment covering accrued interest
  principal: number; // portion reducing the balance
  balanceAfter: number;
  isExtra: boolean; // payment above the minimum (the strategy's target)
  isPayoff: boolean; // final payment that closes the account
}

export interface MonthPlan {
  month: string; // YYYY-MM
  payments: ScheduledPayment[];
  totalPaid: number;
  totalInterest: number;
  balanceRemaining: number; // across all accounts at month end
}

export interface AccountPayoffSummary {
  accountId: string;
  accountName: string;
  payoffDate: string | null; // null if not paid off within the horizon
  totalInterest: number;
  totalPaid: number;
}

export interface PayoffPlan {
  strategy: PayoffStrategy;
  monthlyBudget: number;
  startDate: string; // YYYY-MM-DD the simulation starts from
  months: MonthPlan[];
  perAccount: AccountPayoffSummary[];
  debtFreeDate: string | null; // date of the final payment, null if horizon exceeded
  monthsToDebtFree: number | null;
  totalInterestPaid: number;
  totalPaid: number;
  warnings: string[];
}

/** Side-by-side result for the strategy comparison UI. */
export interface PayoffComparison {
  avalanche: PayoffPlan;
  snowball: PayoffPlan;
  minimumOnly: PayoffPlan;
}
