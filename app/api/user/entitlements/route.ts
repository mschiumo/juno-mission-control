/**
 * GET /api/user/entitlements
 *
 * The signed-in user's own plan and capabilities. Drives client-side gating so
 * components don't have to guess from the session email. Cheap and safe to
 * call on any authenticated page.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { auth } from '@/auth';
import { getEntitlements } from '@/lib/db/entitlements';

export async function GET(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const session = await auth();
  const entitlements = await getEntitlements(authResult.userId, session?.user?.email);
  return NextResponse.json({ success: true, entitlements });
}
