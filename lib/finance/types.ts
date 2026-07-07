/**
 * Finance tracker types — owner-only Dashboard feature.
 *
 * Data sources today: manual entry, Google Sheet sync (lib/finance/sheet-sync.ts
 * — edit numbers in a link-shared sheet, sync into the dashboard), and
 * statement CSV import (lib/finance/apple-card-csv.ts — Apple Card has no
 * aggregator support; FinanceKit is iOS-native only). The `source`/`externalId`
 * fields are the integration seam for live aggregator data.
 *
 * LIVE DATA STATUS (per institution):
 * - Robinhood → LIVE via the existing ConfluenceTrading OAuth connection
 *   (lib/finance/investing-sync.ts). No new credentials needed.
 * - Chase, Capital One (and most major US banks) → LIVE via Teller
 *   (lib/finance/teller.ts) once TELLER_* env vars are set — free signup,
 *   setup steps in that file's header.
 * - Apple Card → statement CSV import (no aggregator supports it;
 *   FinanceKit is iOS-native only).
 * - Affirm, Synchrony → NOT on Teller; wait for the Plaid integration
 *   (below) or track via sheet/manual meanwhile.
 * - Everything refreshes nightly via app/api/cron-jobs/finance-refresh.
 *
 * NEXT STEPS:
 *
 * 1. Plaid (https://plaid.com/docs) — adds Affirm + Synchrony coverage and
 *    the Liabilities product, which returns APR, minimum payment, and due
 *    date for credit cards (replacing manual entry of card terms — Teller
 *    doesn't expose them). Production access is sales-led and bills
 *    per-item monthly; keep it owner-gated. Reuse lib/finance/crypto.ts for
 *    token storage.
 *
 * 2. SimpleFIN Bridge (https://beta-bridge.simplefin.org) — $15/yr,
 *    read-only. User pays directly and pastes a setup token; fallback for
 *    institutions Teller/Plaid miss.
 *
 * 3. Sheet sync: private-sheet access via the lib/google-calendar.ts
 *    service-account JWT flow (share the sheet with
 *    GOOGLE_SERVICE_ACCOUNT_EMAIL, scope spreadsheets.readonly) so the link
 *    needn't be viewable by anyone with the URL.
 *
 * 4. Expense tracking depth — category budgets and month-over-month trends
 *    on top of imported/synced transactions (Teller /transactions is
 *    available once enrolled), and feed actual spending into the payoff
 *    planner's monthlyBudget.
 *
 * 5. True investment returns — needs contribution history to separate
 *    deposits from market growth; Teller/brokerage transactions unlock a
 *    time-weighted return calc for the Investing section.
 */

export type DebtType =
  | 'credit-card'
  | 'auto-loan'
  | 'student-loan'
  | 'personal-loan'
  | 'mortgage'
  | 'other';

export type AccountSource = 'manual' | 'gsheet' | 'teller' | 'plaid' | 'simplefin' | 'brokerage';

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
  externalId?: string; // aggregator/brokerage account id once connected
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
