/**
 * Finance tracker types — owner-only Dashboard feature.
 *
 * Accounts are entered manually for now. The `source`/`externalId` fields are
 * the integration seam for live data from a bank aggregator.
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
 * 4. Expense tracking — once transactions sync, add
 *    `finance:{userId}:transactions:{month}` storage + a category budget UI,
 *    and feed actual spending into the payoff planner's monthlyBudget.
 */

export type DebtType =
  | 'credit-card'
  | 'auto-loan'
  | 'student-loan'
  | 'personal-loan'
  | 'mortgage'
  | 'other';

export type AccountSource = 'manual' | 'teller' | 'plaid' | 'simplefin';

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
