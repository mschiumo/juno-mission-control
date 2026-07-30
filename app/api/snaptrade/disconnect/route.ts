/**
 * DELETE /api/snaptrade/disconnect
 *
 * Removes the user's brokerage connection: deregisters them with SnapTrade
 * (which disables all their brokerage authorizations and stops the per-user
 * charge) and deletes our stored connection record. Imported trades already in
 * trades-v2 are left intact.
 *
 * The teardown lives in lib/brokerage-access.ts because losing the paid
 * entitlement has to do exactly the same thing — and because a failed
 * deregistration needs to be queued for retry rather than silently dropped.
 */

import { NextResponse } from 'next/server';
import { requireBrokerageAccess } from '@/lib/auth-session';
import { disconnectBrokerage } from '@/lib/brokerage-access';

export async function DELETE(): Promise<NextResponse> {
  const { userId, error: authError } = await requireBrokerageAccess();
  if (authError) return authError;

  try {
    const result = await disconnectBrokerage(userId);
    return NextResponse.json({ success: true, data: { disconnected: true, ...result } });
  } catch (error) {
    console.error('SnapTrade disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect brokerage' },
      { status: 500 }
    );
  }
}
