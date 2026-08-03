/**
 * Derive daily balances + daily fees from SnapTrade data
 *
 * The Performance equity curve is fed by DailyBalance[] — historically only
 * available from imported ThinkOrSwim Account Statements. This module derives
 * the same series from data the broker sync already pulls, so a connected
 * brokerage keeps the curve alive without statement uploads.
 *
 * Method: SnapTrade has no reliable balance-history endpoint (the one that
 * exists is experimental, disabled by default, and capped at a 1-year
 * lookback), but it does give us today's total account value and the complete
 * activity ledger. So we anchor at today and walk the ledger backwards:
 *
 *   EOD(day-1) = EOD(day) − (NLV-changing events on `day`)
 *
 * NLV-changing events, marking open positions at cost:
 *   - realized P&L of round-trip trades, on their exit date (netPnL already
 *     includes trade commissions, so BUY/SELL activity fees are NOT counted
 *     again here)
 *   - cash events from the ledger: DIVIDEND / INTEREST / CONTRIBUTION add,
 *     WITHDRAWAL / FEE / TAX subtract, TRANSFER is applied with its own sign
 *   - everything else (BUY, SELL, REI, STOCK_DIVIDEND, SPLIT, OPTION*) moves
 *     value between cash and positions-at-cost, so it's NLV-neutral
 *
 * The anchor itself is the broker's marked-to-market total value minus the sum
 * of open positions' unrealized P&L — i.e. today's NLV at cost — so an open
 * position's paper gain can't leak into every historical day. For a flat
 * account the reconstruction is exact; while positions are held it drifts by
 * the unrealized amount until they close, same as marking at cost anywhere.
 *
 * Fees: FEE/TAX ledger entries plus BUY/SELL commissions, bucketed per ET day,
 * matching the shape statements produce (commissions vs. other debits).
 */

import type { Trade } from '@/types/trading';
import type { DailyBalance, DailyFee } from '@/lib/parsers/tos-parser';
import type { SnapTradeActivity } from '@/lib/snaptrade-transform';
import { getESTDateFromTimestamp, getTodayInEST } from '@/lib/date-utils';

export interface AccountLedger {
  accountId: string;
  /** All raw activities for the account (every type, not just BUY/SELL). */
  activities: SnapTradeActivity[];
  /** Round-trip trades built from those activities (for realized P&L by exit date). */
  trades: Trade[];
  /**
   * Today's total account value per the broker (cash + positions, marked to
   * market), or null when unavailable — the account is then skipped.
   */
  totalValue: number | null;
  /** Sum of open positions' unrealized P&L; subtracted from the anchor. */
  openPnl: number;
}

/** Cash-event signs by SnapTrade activity type. TRANSFER is handled separately. */
const CASH_IN = new Set(['DIVIDEND', 'INTEREST', 'CONTRIBUTION']);
const CASH_OUT = new Set(['WITHDRAWAL', 'FEE', 'TAX']);

const round2 = (n: number) => Number(n.toFixed(2));

function addTo(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) || 0) + value);
}

/** Per-account EOD series (ascending) + the balance before its first event. */
interface AccountSeries {
  dates: string[];
  values: number[];
  preFirst: number;
}

function buildAccountSeries(ledger: AccountLedger, today: string): AccountSeries | null {
  if (ledger.totalValue == null) return null;
  const anchor = ledger.totalValue - ledger.openPnl;

  const deltas = new Map<string, number>();

  // Realized P&L lands on the trade's exit date.
  for (const t of ledger.trades) {
    if (t.status !== 'CLOSED' || t.netPnL == null || !t.exitDate) continue;
    addTo(deltas, getESTDateFromTimestamp(t.exitDate), t.netPnL);
  }

  for (const a of ledger.activities) {
    const type = (a.type || '').toUpperCase();
    const date = a.trade_date ? getESTDateFromTimestamp(a.trade_date) : '';
    if (!date || date > today) continue;
    const amount = a.amount ?? 0;
    if (CASH_IN.has(type)) addTo(deltas, date, Math.abs(amount));
    else if (CASH_OUT.has(type)) addTo(deltas, date, -Math.abs(amount));
    // Transfers arrive signed (in positive, out negative) — trust the sign.
    else if (type === 'TRANSFER' && amount !== 0) addTo(deltas, date, amount);
  }

  const dates = [...deltas.keys()].sort();

  // Walk backwards from today's anchor: the latest delta-day's EOD is the
  // anchor itself (nothing NLV-changing happened after it), and each earlier
  // day's EOD is the later one minus that later day's delta.
  const values = new Array<number>(dates.length);
  let bal = anchor;
  for (let i = dates.length - 1; i >= 0; i--) {
    values[i] = bal;
    bal -= deltas.get(dates[i])!;
  }

  // Extend the series to today so the curve always reaches the present.
  if (dates.length === 0 || dates[dates.length - 1] < today) {
    dates.push(today);
    values.push(anchor);
  }

  return { dates, values, preFirst: bal };
}

/** Step-function lookup: the account's EOD value as of `date`. */
function valueAt(series: AccountSeries, date: string): number {
  // Series are small (one point per active day); linear scan from the end
  // would be fine, but binary search keeps the aggregate pass O(D log D).
  let lo = 0;
  let hi = series.dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.dates[mid] <= date) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans === -1 ? series.preFirst : series.values[ans];
}

/**
 * Derive the daily balance series — per account AND aggregated across them.
 * The per-account series feed each account's own Performance view (the account
 * selector); the aggregate feeds "All Accounts". Accounts without a usable
 * anchor are skipped (logged by the caller via the returned `skipped` list)
 * rather than dragging the whole series to garbage.
 */
export function deriveDailyBalances(
  ledgers: AccountLedger[],
  today = getTodayInEST()
): {
  balances: DailyBalance[];
  byAccount: Record<string, DailyBalance[]>;
  skipped: string[];
} {
  const series: AccountSeries[] = [];
  const byAccount: Record<string, DailyBalance[]> = {};
  const skipped: string[] = [];

  for (const ledger of ledgers) {
    const s = buildAccountSeries(ledger, today);
    if (s) {
      series.push(s);
      byAccount[ledger.accountId] = s.dates.map((date, i) => ({
        date,
        balance: round2(s.values[i]),
      }));
    } else {
      skipped.push(ledger.accountId);
    }
  }
  if (series.length === 0) return { balances: [], byAccount, skipped };

  const allDates = [...new Set(series.flatMap(s => s.dates))].sort();
  const balances = allDates.map(date => ({
    date,
    balance: round2(series.reduce((sum, s) => sum + valueAt(s, date), 0)),
  }));
  return { balances, byAccount, skipped };
}

/**
 * Derive the daily fee series — per account and aggregated — from BUY/SELL
 * commissions plus FEE/TAX ledger debits, in the same total/breakdown shape
 * statement imports produce.
 */
export function deriveDailyFees(
  ledgers: AccountLedger[],
  today = getTodayInEST()
): { fees: DailyFee[]; byAccount: Record<string, DailyFee[]> } {
  const byAccount: Record<string, DailyFee[]> = {};
  // Aggregate accumulators across all accounts.
  const commissions = new Map<string, number>();
  const other = new Map<string, number>();

  for (const ledger of ledgers) {
    const acctCommissions = new Map<string, number>();
    const acctOther = new Map<string, number>();
    for (const a of ledger.activities) {
      const type = (a.type || '').toUpperCase();
      const date = a.trade_date ? getESTDateFromTimestamp(a.trade_date) : '';
      if (!date || date > today) continue;
      if (type === 'BUY' || type === 'SELL') {
        const fee = Math.abs(a.fee ?? 0);
        if (fee > 0) {
          addTo(commissions, date, fee);
          addTo(acctCommissions, date, fee);
        }
      } else if (type === 'FEE' || type === 'TAX') {
        const amt = Math.abs(a.amount ?? 0);
        if (amt > 0) {
          addTo(other, date, amt);
          addTo(acctOther, date, amt);
        }
      }
    }
    const acctFees = toFeeSeries(acctCommissions, acctOther);
    if (acctFees.length > 0) byAccount[ledger.accountId] = acctFees;
  }

  return { fees: toFeeSeries(commissions, other), byAccount };
}

function toFeeSeries(
  commissions: Map<string, number>,
  other: Map<string, number>
): DailyFee[] {
  const allDates = [...new Set([...commissions.keys(), ...other.keys()])].sort();
  return allDates.map(date => {
    const c = commissions.get(date) || 0;
    const o = other.get(date) || 0;
    return { date, amount: round2(c + o), commissions: round2(c), borrow: round2(o) };
  });
}
