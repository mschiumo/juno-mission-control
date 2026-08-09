/**
 * POST /api/user/plan/referral  { code: string }
 *
 * Redeem a referral code (e.g. EmmanuelTrades → one month of Gold free).
 * One redemption per user; validation lives in redeemReferralCode().
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { redeemReferralCode } from '@/lib/db/entitlements';

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  let code = '';
  try {
    const body = await request.json();
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    // fall through to the empty-code rejection
  }
  if (!code.trim()) {
    return NextResponse.json({ success: false, error: 'Enter a referral code.' }, { status: 400 });
  }

  const result = await redeemReferralCode(authResult.userId, code);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.reason }, { status: 409 });
  }
  return NextResponse.json({ success: true, record: result.record });
}
