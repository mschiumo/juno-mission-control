import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import {
  getCombinedDailyBalances,
  clearDailyBalances,
  clearBrokerDailyBalances,
} from '@/lib/db/balances';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  // Single-source: the broker-derived series when a brokerage feeds this user,
  // statement uploads otherwise — never blended. `source` tells the client
  // which one it got; `byAccount` carries each linked account's own
  // broker-derived series so the per-account Performance views get real NLV
  // instead of a cumulative-P&L fallback.
  const { balances, byAccount, source } = await getCombinedDailyBalances(userId);
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
