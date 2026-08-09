/**
 * GET /api/user/entitlements
 *
 * The signed-in user's own plan status: resolved capabilities plus whether
 * the free trial and referral redemption are still available. This is what
 * the client's useEntitlements()/usePlanStatus() hooks read.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireUserId } from '@/lib/auth-session';
import { getUserById, isEmailVerified } from '@/lib/db/users';
import { isOwnerEmail } from '@/lib/owner';
import {
  getEntitlements,
  getEntitlementRecord,
  hasUsedTrial,
  hasRedeemedReferral,
} from '@/lib/db/entitlements';
import { isRecordActive } from '@/lib/entitlements';

export async function GET(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const session = await auth();
  const email = session?.user?.email;

  const [user, entitlements, record, trialUsed, referralUsed] = await Promise.all([
    getUserById(userId),
    getEntitlements(userId, email),
    getEntitlementRecord(userId),
    hasUsedTrial(userId),
    hasRedeemedReferral(userId),
  ]);

  const owner = isOwnerEmail(email);
  const active = isRecordActive(record);
  return NextResponse.json({
    success: true,
    status: {
      entitlements,
      trialAvailable: !owner && !trialUsed,
      referralAvailable: !owner && !referralUsed,
      expiresAt: owner ? null : (active && record?.expiresAt ? record.expiresAt : null),
      source: owner ? 'owner' : (active ? record?.source ?? null : null),
      emailVerified: isEmailVerified(user),
    },
  });
}
