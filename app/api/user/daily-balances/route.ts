import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getDailyBalances, clearDailyBalances } from '@/lib/db/balances';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const balances = await getDailyBalances(userId);
  return NextResponse.json({ success: true, balances });
}

export async function DELETE() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  await clearDailyBalances(userId);
  return NextResponse.json({ success: true });
}
