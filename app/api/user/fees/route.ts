import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getDailyFees } from '@/lib/db/fees';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const fees = await getDailyFees(userId);
  return NextResponse.json({ success: true, fees });
}
