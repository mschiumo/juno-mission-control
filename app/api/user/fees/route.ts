import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getCombinedDailyFees } from '@/lib/db/fees';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  // Single-source, matching daily balances: broker-derived fees when a
  // brokerage feeds this user, statement uploads otherwise — including the
  // per-account split.
  const { fees, byAccount } = await getCombinedDailyFees(userId);
  return NextResponse.json({ success: true, fees, byAccount });
}
