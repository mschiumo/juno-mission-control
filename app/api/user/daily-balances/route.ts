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

  // Statement-upload balances merged with the broker-derived series (broker
  // wins per date) — the equity curve works off both sources transparently.
  // `byAccount` carries each linked account's own broker-derived series so the
  // per-account Performance views get real NLV instead of a cumulative-P&L
  // fallback.
  const { balances, byAccount } = await getCombinedDailyBalances(userId);
  return NextResponse.json({ success: true, balances, byAccount });
}

export async function DELETE() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  await clearDailyBalances(userId);
  await clearBrokerDailyBalances(userId);
  return NextResponse.json({ success: true });
}
