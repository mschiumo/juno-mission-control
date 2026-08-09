import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import {
  getCombinedDailyBalances,
  clampBalancesFromDate,
  clearDailyBalances,
  clearBrokerDailyBalances,
} from '@/lib/db/balances';
import { getBrokerConnection } from '@/lib/db/broker-connections';
import { getESTDateFromTimestamp } from '@/lib/date-utils';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  // Single-source: the broker-derived series when a brokerage feeds this user,
  // statement uploads otherwise — never blended. `source` tells the client
  // which one it got.
  const combined = await getCombinedDailyBalances(userId);
  const { source } = combined;
  let { balances, byAccount } = combined;

  // The broker-derived series is reconstructed from the full activity ledger,
  // which reaches back long before the brokerage was linked (including the
  // account's unfunded days). Performance tracking starts at connection, so
  // clamp the series there — the boundary point carries the account's value
  // as of that day, which is what the equity curve and its Total P&L anchor to.
  if (source === 'broker') {
    const connection = await getBrokerConnection(userId);
    if (connection?.connectedAt) {
      const connectedDay = getESTDateFromTimestamp(connection.connectedAt);
      balances = clampBalancesFromDate(balances, connectedDay);
      byAccount = Object.fromEntries(
        Object.entries(byAccount).map(([id, series]) => [
          id,
          clampBalancesFromDate(series, connectedDay),
        ])
      );
    }
  }

  return NextResponse.json({ success: true, balances, byAccount, source });
}

export async function DELETE() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  await clearDailyBalances(userId);
  await clearBrokerDailyBalances(userId);
  return NextResponse.json({ success: true });
}
