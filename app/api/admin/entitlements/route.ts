/**
 * Owner-only entitlement administration.
 *
 *   GET   /api/admin/entitlements            → every paid record (incl. lapsed)
 *   PATCH /api/admin/entitlements            → grant or revoke a user's plan
 *         body: { email, plan: 'free'|'pro', expiresAt?, note? }
 *
 * This is the manual stand-in until a billing provider is wired up: a payment
 * webhook will eventually write the same records via setEntitlement. Keeping
 * the write path identical means the gates never need to change again.
 *
 * Revoking to 'free' tears the brokerage connection down rather than merely
 * hiding it — SnapTrade bills per connected user, so leaving the authorization
 * live would keep charging us for someone who no longer pays.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getUserByEmail } from '@/lib/db/users';
import {
  getEntitlementRecord,
  setEntitlement,
  listPaidUserIds,
  clearPaidIndex,
} from '@/lib/db/entitlements';
import { disconnectBrokerage } from '@/lib/brokerage-access';
import type { Plan } from '@/lib/entitlements';

export async function GET(): Promise<NextResponse> {
  const authResult = await requireOwner();
  if (authResult.error) return authResult.error;

  const ids = await listPaidUserIds();
  const records = await Promise.all(
    ids.map(async (userId) => ({ userId, record: await getEntitlementRecord(userId) })),
  );
  return NextResponse.json({ success: true, records });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const authResult = await requireOwner();
  if (authResult.error) return authResult.error;

  let body: { email?: string; plan?: Plan; expiresAt?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const plan = body.plan;
  if (!email) {
    return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
  }
  if (plan !== 'free' && plan !== 'pro') {
    return NextResponse.json({ success: false, error: "plan must be 'free' or 'pro'" }, { status: 400 });
  }
  if (body.expiresAt && !Number.isFinite(Date.parse(body.expiresAt))) {
    return NextResponse.json({ success: false, error: 'expiresAt must be an ISO date' }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user?.id) {
    return NextResponse.json({ success: false, error: 'No user with that email' }, { status: 404 });
  }

  const record = await setEntitlement(user.id, {
    plan,
    source: 'admin',
    expiresAt: body.expiresAt,
    note: body.note,
  });

  // Downgrades must stop the spend, not just hide the UI.
  let teardown = null;
  if (plan === 'free') {
    teardown = await disconnectBrokerage(user.id);
    await clearPaidIndex(user.id);
  }

  return NextResponse.json({ success: true, userId: user.id, record, teardown });
}
