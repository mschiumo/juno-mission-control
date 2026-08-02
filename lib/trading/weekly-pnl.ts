/**
 * Weekly realized P&L for the Weekly Scoreboard.
 *
 * Kept pure (no Redis, no session) so the arithmetic can be exercised
 * directly — the route supplies the already-scoped trades and the daily fee
 * records, this decides what the week actually made.
 */

import type { Trade } from '@/types/trading';
import type { DailyFee } from '@/lib/parsers/tos-parser';
import { getESTDateFromTimestamp } from '@/lib/date-utils';

export interface WeeklyPnl {
  /** Realized P&L after broker charges — the headline number. */
  pnl: number;
  /** Sum of the trades' own P&L, before broker charges. */
  gross: number;
  /** Commissions, regulatory fees and stock-borrow charges for the week. */
  fees: number;
  /** Closed trades counted. */
  trades: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param trades       closed+open trades, already scoped to the accounts that
 *                     belong in the trading journal
 * @param dailyFees    per-day broker charges parsed from account statements
 * @param weekStart    Monday of the week, YYYY-MM-DD (ET)
 * @param today        last day to count, YYYY-MM-DD (ET)
 *
 * A statement/manual round trip stores the raw price difference, so its
 * `netPnL` is really gross — the broker's charges for that day live in
 * `dailyFees` and are subtracted here. Broker-synced trades (SnapTrade)
 * already have their fees netted out in the transform, so days made up
 * purely of those are left alone rather than charged twice.
 */
export function computeWeeklyPnl(
  trades: Trade[],
  dailyFees: DailyFee[],
  weekStart: string,
  today: string
): WeeklyPnl {
  let gross = 0;
  let count = 0;
  const grossDays = new Set<string>();

  for (const t of trades) {
    if (t.status !== 'CLOSED' || !t.exitDate) continue;
    const d = getESTDateFromTimestamp(t.exitDate);
    if (d < weekStart || d > today) continue;
    gross += t.netPnL || 0;
    count++;
    if (t.source !== 'broker') grossDays.add(d);
  }

  let fees = 0;
  for (const f of dailyFees) {
    if (grossDays.has(f.date)) fees += f.amount || 0;
  }

  return { pnl: round2(gross - fees), gross: round2(gross), fees: round2(fees), trades: count };
}
