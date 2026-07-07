/**
 * Debt payoff planner — pure simulation, no I/O.
 *
 * Given a set of debt accounts, a total monthly budget, and a strategy, this
 * produces a month-by-month payment schedule with exact amounts and due
 * dates: every account gets its minimum, and the remaining budget goes to a
 * single target account (avalanche = highest APR first, snowball = smallest
 * balance first). When an account is paid off, its freed-up minimum
 * automatically rolls into the extra pool because the budget stays fixed.
 *
 * Model notes (deliberate simplifications):
 * - Interest compounds monthly at apr/12 on the running balance. Real credit
 *   cards accrue daily on average daily balance, so real interest will differ
 *   slightly; monthly compounding is the standard planning approximation.
 * - Minimum payments are treated as fixed dollar amounts. Card minimums
 *   actually shrink as the balance drops, which stretches payoff further —
 *   so the "minimum only" baseline here is, if anything, optimistic, and the
 *   interest-saved numbers are conservative.
 * - New charges are assumed to be zero. Once transaction sync exists (see
 *   lib/finance/types.ts next steps), average monthly spend per card could be
 *   added to the simulation.
 */

import {
  DebtAccount,
  PayoffPlan,
  PayoffStrategy,
  PayoffComparison,
  MonthPlan,
  ScheduledPayment,
  AccountPayoffSummary,
} from './types';

/** Hard stop so pathological inputs (interest > payments) can't loop forever. */
const MAX_MONTHS = 600; // 50 years

const round2 = (n: number) => Math.round(n * 100) / 100;

interface SimAccount {
  account: DebtAccount;
  balance: number;
  totalInterest: number;
  totalPaid: number;
  payoffDate: string | null;
}

/** Due date for an account in a given year/month, clamped to day 28. */
function dueDateFor(year: number, monthIndex0: number, dueDay: number): string {
  const day = Math.min(Math.max(Math.round(dueDay) || 1, 1), 28);
  const mm = String(monthIndex0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Pick the account that gets the extra budget this month. */
function pickTarget(open: SimAccount[], strategy: PayoffStrategy): SimAccount | null {
  if (strategy === 'minimum-only' || open.length === 0) return null;
  const sorted = [...open].sort((a, b) => {
    if (strategy === 'avalanche') {
      // Highest APR first; tie-break on smaller balance for a quicker win.
      return b.account.apr - a.account.apr || a.balance - b.balance;
    }
    // Snowball: smallest balance first; tie-break on higher APR.
    return a.balance - b.balance || b.account.apr - a.account.apr;
  });
  return sorted[0];
}

export function buildPayoffPlan(
  accounts: DebtAccount[],
  opts: { strategy: PayoffStrategy; monthlyBudget: number; startDate: string },
): PayoffPlan {
  const { strategy, startDate } = opts;
  const warnings: string[] = [];

  const active = accounts.filter((a) => a.balance > 0);
  const sims: SimAccount[] = active.map((a) => ({
    account: a,
    balance: round2(a.balance),
    totalInterest: 0,
    totalPaid: 0,
    payoffDate: null,
  }));

  const totalMin = round2(active.reduce((s, a) => s + a.minPayment, 0));
  let budget = round2(opts.monthlyBudget);
  if (strategy !== 'minimum-only' && budget < totalMin) {
    warnings.push(
      `Monthly budget ($${budget.toFixed(2)}) is below total minimum payments ($${totalMin.toFixed(2)}). ` +
        `Schedule falls back to minimums only — raise the budget to make progress beyond the minimums.`,
    );
    budget = totalMin;
  }

  // Flag accounts where the minimum doesn't even cover monthly interest.
  for (const s of sims) {
    const monthlyInterest = s.balance * (s.account.apr / 100 / 12);
    if (s.account.minPayment <= monthlyInterest) {
      warnings.push(
        `${s.account.name}: minimum payment ($${s.account.minPayment.toFixed(2)}) does not cover monthly ` +
          `interest (~$${monthlyInterest.toFixed(2)}) — the balance grows unless it receives extra payments.`,
      );
    }
  }

  const start = new Date(`${startDate}T12:00:00`);
  const startDayOfMonth = start.getDate();
  let year = start.getFullYear();
  let monthIndex0 = start.getMonth();

  const months: MonthPlan[] = [];
  let monthCount = 0;

  while (sims.some((s) => s.balance > 0) && monthCount < MAX_MONTHS) {
    const isFirstMonth = monthCount === 0;
    // In the current calendar month, only accounts whose due day hasn't
    // already passed get a payment; the rest start next month.
    const paying = sims.filter(
      (s) => s.balance > 0 && (!isFirstMonth || Math.min(s.account.dueDay, 28) >= startDayOfMonth),
    );
    const accruing = sims.filter((s) => s.balance > 0);

    // 1) Accrue this month's interest on every open account.
    for (const s of accruing) {
      const interest = round2(s.balance * (s.account.apr / 100 / 12));
      s.balance = round2(s.balance + interest);
      s.totalInterest = round2(s.totalInterest + interest);
      (s as SimAccount & { monthInterest?: number }).monthInterest = interest;
    }

    const payments: ScheduledPayment[] = [];

    if (paying.length > 0) {
      // 2) Everyone paying this month gets their minimum (capped at balance).
      const planned = new Map<string, number>();
      for (const s of paying) {
        planned.set(s.account.id, Math.min(s.account.minPayment, s.balance));
      }

      // 3) Remaining budget goes to the strategy's target account. If the
      //    target gets fully paid off, cascade the leftover to the next one.
      //    In the first (partial) month, minimums for accounts whose due day
      //    already passed are excluded from the pool — assume they were paid.
      const skippedMin = isFirstMonth
        ? accruing.filter((s) => !paying.includes(s)).reduce((sum, s) => sum + s.account.minPayment, 0)
        : 0;
      let extra = round2(
        budget - skippedMin - [...planned.values()].reduce((a, b) => a + b, 0),
      );
      if (strategy !== 'minimum-only') {
        let candidates = paying.filter((s) => s.balance > (planned.get(s.account.id) ?? 0));
        while (extra > 0.005 && candidates.length > 0) {
          const target = pickTarget(candidates, strategy);
          if (!target) break;
          const owed = round2(target.balance - (planned.get(target.account.id) ?? 0));
          const add = Math.min(extra, owed);
          planned.set(target.account.id, round2((planned.get(target.account.id) ?? 0) + add));
          extra = round2(extra - add);
          candidates = candidates.filter(
            (s) => s !== target && s.balance > (planned.get(s.account.id) ?? 0),
          );
        }
      }

      // 4) Apply payments and record the schedule entries.
      for (const s of paying) {
        const amount = round2(planned.get(s.account.id) ?? 0);
        if (amount <= 0) continue;
        const monthInterest = (s as SimAccount & { monthInterest?: number }).monthInterest ?? 0;
        const interestPortion = round2(Math.min(amount, monthInterest));
        s.balance = round2(s.balance - amount);
        s.totalPaid = round2(s.totalPaid + amount);
        const date = dueDateFor(year, monthIndex0, s.account.dueDay);
        const isPayoff = s.balance <= 0.005;
        if (isPayoff) {
          s.balance = 0;
          s.payoffDate = date;
        }
        payments.push({
          accountId: s.account.id,
          accountName: s.account.name,
          date,
          amount,
          interest: interestPortion,
          principal: round2(amount - interestPortion),
          balanceAfter: s.balance,
          isExtra: amount > s.account.minPayment + 0.005,
          isPayoff,
        });
      }
    }

    payments.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
    const mm = String(monthIndex0 + 1).padStart(2, '0');
    months.push({
      month: `${year}-${mm}`,
      payments,
      totalPaid: round2(payments.reduce((s, p) => s + p.amount, 0)),
      totalInterest: round2(payments.reduce((s, p) => s + p.interest, 0)),
      balanceRemaining: round2(sims.reduce((s, a) => s + a.balance, 0)),
    });

    monthIndex0 += 1;
    if (monthIndex0 > 11) {
      monthIndex0 = 0;
      year += 1;
    }
    monthCount += 1;
  }

  const finished = sims.every((s) => s.balance <= 0);
  if (!finished) {
    warnings.push(
      `Not debt-free within ${MAX_MONTHS / 12} years under this plan — increase the monthly budget.`,
    );
  }

  const perAccount: AccountPayoffSummary[] = sims.map((s) => ({
    accountId: s.account.id,
    accountName: s.account.name,
    payoffDate: s.payoffDate,
    totalInterest: s.totalInterest,
    totalPaid: s.totalPaid,
  }));

  const lastPayment = months
    .flatMap((m) => m.payments)
    .reduce<string | null>((latest, p) => (!latest || p.date > latest ? p.date : latest), null);

  return {
    strategy,
    monthlyBudget: round2(opts.monthlyBudget),
    startDate,
    months,
    perAccount,
    debtFreeDate: finished ? lastPayment : null,
    monthsToDebtFree: finished ? monthCount : null,
    totalInterestPaid: round2(sims.reduce((s, a) => s + a.totalInterest, 0)),
    totalPaid: round2(sims.reduce((s, a) => s + a.totalPaid, 0)),
    warnings,
  };
}

/** Run all three strategies for the side-by-side comparison UI. */
export function comparePayoffPlans(
  accounts: DebtAccount[],
  monthlyBudget: number,
  startDate: string,
): PayoffComparison {
  return {
    avalanche: buildPayoffPlan(accounts, { strategy: 'avalanche', monthlyBudget, startDate }),
    snowball: buildPayoffPlan(accounts, { strategy: 'snowball', monthlyBudget, startDate }),
    minimumOnly: buildPayoffPlan(accounts, { strategy: 'minimum-only', monthlyBudget, startDate }),
  };
}
