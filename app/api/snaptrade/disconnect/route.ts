/**
 * DELETE /api/snaptrade/disconnect
 *
 * Removes the user's brokerage connection via the shared teardown in
 * lib/brokerage-access (also used by plan cancellation, account deletion,
 * the Stripe webhook, and the nightly sweep): deregisters with SnapTrade
 * (queueing a retry on failure), resets the trade history the broker owned
 * back to the pre-broker backup, clears broker-derived balance/fee series,
 * and deletes the stored connection record.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { disconnectBrokerage } from '@/lib/brokerage-access';

export async function DELETE(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('brokerageSync');
  if (authError) return authError;

  try {
    const result = await disconnectBrokerage(userId);
    return NextResponse.json({
      success: true,
      data: { disconnected: result.disconnected, tradesRestored: result.tradesRestored },
    });
  } catch (error) {
    console.error('SnapTrade disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect brokerage' },
      { status: 500 }
    );
  }
}
