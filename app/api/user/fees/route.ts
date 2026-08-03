import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getCombinedDailyFees } from '@/lib/db/fees';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  // Statement-upload fees merged with the broker-derived series (broker wins
  // per date) — same dual-source model as daily balances, including the
  // per-account split.
  const { fees, byAccount } = await getCombinedDailyFees(userId);
  return NextResponse.json({ success: true, fees, byAccount });
}
