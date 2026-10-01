/**
 * Pure analysis helpers for the long-term Portfolio tab.
 *
 * Everything here is deterministic math over the stored portfolio snapshot and
 * activity ledger — no I/O — so it is shared by the summary API route, the
 * weekly review generator, and unit tests.
 */

import type {
  PortfolioActivity,
  PortfolioPosition,
} from '@/lib/db/portfolio-connection';

/** A detected recurring cash flow (e.g. an automatic monthly deposit). */
export interface RecurringFlow {
  /** CONTRIBUTION or WITHDRAWAL. */
  type: string;
  /** The repeated absolute amount. */
  amount: number;
  /** 'weekly' | 'biweekly' | 'monthly'. */
  cadence: 'weekly' | 'biweekly' | 'monthly';
  /** Number of occurrences observed. */
  occurrences: number;
  /** Date of the most recent occurrence (YYYY-MM-DD). */
  lastDate: string;
  /** Approximate monthly total this flow contributes. */
  monthlyAmount: number;
}

export interface IncomeSummary {
  /** Dividends received in the trailing ~30 days. */
  dividends30d: number;
  /** Dividends received in the trailing ~365 days. */
  dividends12m: number;
  /** Interest received in the trailing ~365 days. */
  interest12m: number;
}

export interface CashFlowSummary {
  /** Net deposits − withdrawals over the trailing ~365 days. */
  netContributions12m: number;
  deposits12m: number;
  withdrawals12m: number;
}

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

/**
 * Detect recurring deposits/withdrawals: at least three occurrences of the
 * same (type, amount) pair whose median spacing matches a weekly, biweekly,
 * or monthly cadence. Amounts are bucketed to the cent.
 */
export function detectRecurringFlows(activities: PortfolioActivity[]): RecurringFlow[] {
  const groups = new Map<string, PortfolioActivity[]>();
  for (const a of activities) {
    if (a.type !== 'CONTRIBUTION' && a.type !== 'WITHDRAWAL') continue;
    const amount = Math.abs(a.amount ?? 0);
    if (amount <= 0) continue;
    const key = `${a.type}:${amount.toFixed(2)}`;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }

  const flows: RecurringFlow[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const dates = [...new Set(list.map(a => a.date))].sort();
    if (dates.length < 3) continue;

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push(daysBetween(dates[i - 1], dates[i]));
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];

    let cadence: RecurringFlow['cadence'] | null = null;
    if (median >= 5 && median <= 9) cadence = 'weekly';
    else if (median >= 12 && median <= 17) cadence = 'biweekly';
    else if (median >= 26 && median <= 36) cadence = 'monthly';
    if (!cadence) continue;

    const [type, amountStr] = key.split(':');
    const amount = Number(amountStr);
    const perMonth = cadence === 'weekly' ? 4.33 : cadence === 'biweekly' ? 2.17 : 1;
    flows.push({
      type,
      amount,
      cadence,
      occurrences: dates.length,
      lastDate: dates[dates.length - 1],
      monthlyAmount: Number((amount * perMonth).toFixed(2)),
    });
  }

  return flows.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

/** Sum income events (dividends/interest) over trailing windows ending `today`. */
export function summarizeIncome(
  activities: PortfolioActivity[],
  today: string
): IncomeSummary {
  let dividends30d = 0;
  let dividends12m = 0;
  let interest12m = 0;
  for (const a of activities) {
    const age = daysBetween(a.date, today);
    if (age < 0 || age > 365) continue;
    const amount = Math.abs(a.amount ?? 0);
    if (a.type === 'DIVIDEND') {
      dividends12m += amount;
      if (age <= 30) dividends30d += amount;
    } else if (a.type === 'INTEREST') {
      interest12m += amount;
    }
  }
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    dividends30d: r2(dividends30d),
    dividends12m: r2(dividends12m),
    interest12m: r2(interest12m),
  };
}

/** Sum deposits/withdrawals over the trailing ~365 days ending `today`. */
export function summarizeCashFlows(
  activities: PortfolioActivity[],
  today: string
): CashFlowSummary {
  let deposits = 0;
  let withdrawals = 0;
  for (const a of activities) {
    const age = daysBetween(a.date, today);
    if (age < 0 || age > 365) continue;
    const amount = Math.abs(a.amount ?? 0);
    if (a.type === 'CONTRIBUTION') deposits += amount;
    else if (a.type === 'WITHDRAWAL') withdrawals += amount;
  }
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    deposits12m: r2(deposits),
    withdrawals12m: r2(withdrawals),
    netContributions12m: r2(deposits - withdrawals),
  };
}

/** Position weights (share of summed market value), heaviest first. */
export function positionWeights(
  positions: PortfolioPosition[]
): { symbol: string; weight: number; marketValue: number }[] {
  const total = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  if (total <= 0) return [];
  return positions
    .filter(p => (p.marketValue ?? 0) > 0)
    .map(p => ({
      symbol: p.symbol,
      marketValue: p.marketValue ?? 0,
      weight: Number((((p.marketValue ?? 0) / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** A projected upcoming dividend for a currently-held position. */
export interface UpcomingDividend {
  symbol: string;
  /** Projected pay date (YYYY-MM-DD), rolled forward to on/after today. */
  date: string;
  /** Estimated cash amount: last per-share payout × shares held now. */
  amount: number;
  cadence: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  /** Per-share payout inferred from the most recent payment. */
  perShare: number;
  /** Date of the most recent observed payment. */
  lastPaidDate: string;
}

const CADENCE_MONTHS: Record<UpcomingDividend['cadence'], number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Ex-dividend typically lands a few days before the pay date. */
const EX_DATE_LEAD_DAYS = 3;

/** Add calendar months to a YYYY-MM-DD, clamping to month end; weekends roll to Monday. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  const dow = out.getUTCDay();
  if (dow === 6) out.setUTCDate(out.getUTCDate() + 2);
  else if (dow === 0) out.setUTCDate(out.getUTCDate() + 1);
  return out.toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Project the next dividend for each currently-held position from its payment
 * history. Cadence comes from the median gap between past payments (needs at
 * least two); the amount re-prices the last payment per share — shares held
 * around its ex-date are reconstructed by backing trades out of today's
 * position — so buys/sells since then are reflected. Payers that have gone
 * quiet for more than two cycles are dropped. Sorted soonest first.
 */
export function projectUpcomingDividends(
  activities: PortfolioActivity[],
  positions: PortfolioPosition[],
  today: string
): UpcomingDividend[] {
  const held = new Map<string, number>();
  for (const p of positions) {
    if (p.units > 0) held.set(p.symbol, (held.get(p.symbol) ?? 0) + p.units);
  }

  // symbol → date → summed payout (multiple accounts can pay the same day).
  const paid = new Map<string, Map<string, number>>();
  for (const a of activities) {
    if (a.type !== 'DIVIDEND' || !a.symbol || !held.has(a.symbol)) continue;
    const amount = Math.abs(a.amount ?? 0);
    if (amount <= 0) continue;
    const byDate = paid.get(a.symbol) ?? new Map<string, number>();
    byDate.set(a.date, (byDate.get(a.date) ?? 0) + amount);
    paid.set(a.symbol, byDate);
  }

  const out: UpcomingDividend[] = [];
  for (const [symbol, byDate] of paid) {
    const dates = [...byDate.keys()].sort();
    if (dates.length < 2) continue;

    const recent = dates.slice(-7);
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) gaps.push(daysBetween(recent[i - 1], recent[i]));
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];

    let cadence: UpcomingDividend['cadence'] | null = null;
    if (median >= 20 && median <= 45) cadence = 'monthly';
    else if (median >= 70 && median <= 110) cadence = 'quarterly';
    else if (median >= 160 && median <= 200) cadence = 'semiannual';
    else if (median >= 330 && median <= 400) cadence = 'annual';
    if (!cadence) continue;

    const lastPaidDate = dates[dates.length - 1];
    const step = CADENCE_MONTHS[cadence];
    if (daysBetween(lastPaidDate, today) > step * 2 * 31) continue;

    // Shares on the approximate ex-date = today's units minus trades after it.
    const currentUnits = held.get(symbol)!;
    const exCutoff = shiftDays(lastPaidDate, -EX_DATE_LEAD_DAYS);
    let unitsAtEx = currentUnits;
    for (const a of activities) {
      if (a.symbol === symbol && a.units && a.date > exCutoff) unitsAtEx -= a.units;
    }
    const lastAmount = byDate.get(lastPaidDate)!;
    // A ledger gap (e.g. transferred-in shares) can make the reconstruction
    // nonsensical — fall back to the last payout unscaled.
    const perShare = unitsAtEx > 0.0001 ? lastAmount / unitsAtEx : lastAmount / currentUnits;
    const amount = perShare * currentUnits;

    let next = addMonths(lastPaidDate, step);
    for (let n = 2; next < today; n++) next = addMonths(lastPaidDate, step * n);

    out.push({
      symbol,
      date: next,
      amount: Number(amount.toFixed(2)),
      cadence,
      perShare: Number(perShare.toFixed(4)),
      lastPaidDate,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}
