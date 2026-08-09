/**
 * POST /api/user/plan/trial
 *
 * Start the one free week of Gold. Idempotence and eligibility live in
 * startTrial(); this route is just auth + transport.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { startTrial } from '@/lib/db/entitlements';

export async function POST(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const result = await startTrial(authResult.userId);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.reason }, { status: 409 });
  }
  return NextResponse.json({ success: true, record: result.record });
}
