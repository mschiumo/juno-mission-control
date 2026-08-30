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
