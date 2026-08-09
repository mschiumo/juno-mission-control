/**
 * Admin plan management (owner-only).
 *
 * GET   — list every stored plan record (including lapsed ones).
 * PATCH — grant or revoke a tier by email:
 *           { email, tier: 'silver'|'gold'|'platinum', expiresAt?, note? }
 *           { email, tier: null }  → revoke entirely
 *
 * Revoking or downgrading below Gold tears down the SnapTrade connection —
 * a downgrade must stop the spend, not just hide the UI.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getUserByEmail } from '@/lib/db/users';
import {
  getEntitlementRecord,
  setEntitlement,
  clearEntitlement,
  clearPlanIndex,
  listPlanUserIds,
} from '@/lib/db/entitlements';
import { disconnectBrokerage } from '@/lib/brokerage-access';
import { tierAtLeast } from '@/lib/entitlements';

export async function GET(): Promise<NextResponse> {
  const ownerCheck = await requireOwner();
  if ('error' in ownerCheck) return ownerCheck.error;

  const ids = await listPlanUserIds();
  const records = await Promise.all(
    ids.map(async (userId) => ({ userId, record: await getEntitlementRecord(userId) })),
  );
  return NextResponse.json({ success: true, records });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const ownerCheck = await requireOwner();
  if ('error' in ownerCheck) return ownerCheck.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
  }
  const tier = body.tier;
  if (tier !== null && tier !== 'silver' && tier !== 'gold' && tier !== 'platinum') {
    return NextResponse.json(
      { success: false, error: "tier must be 'silver', 'gold', 'platinum', or null to revoke" },
      { status: 400 },
    );
  }
  if (body.expiresAt !== undefined && !Number.isFinite(Date.parse(String(body.expiresAt)))) {
    return NextResponse.json({ success: false, error: 'expiresAt must be a valid date' }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user?.id) {
    return NextResponse.json({ success: false, error: 'No user with that email' }, { status: 404 });
  }

  let record = null;
  if (tier === null) {
    await clearEntitlement(user.id);
  } else {
    record = await setEntitlement(user.id, {
      tier,
      source: 'admin',
      expiresAt: body.expiresAt ? String(body.expiresAt) : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
  }

  // Losing Gold means losing live brokerage sync; stop paying SnapTrade for it.
  let teardown = null;
  if (tier === null || !tierAtLeast(tier, 'gold')) {
    teardown = await disconnectBrokerage(user.id);
    if (tier === null) await clearPlanIndex(user.id);
  }

  return NextResponse.json({ success: true, record, teardown });
}
