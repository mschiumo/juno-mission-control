/**
 * DELETE /api/snaptrade/disconnect
 *
 * Removes the user's brokerage connection: deregisters them with SnapTrade
 * (which disables all their brokerage authorizations) and deletes our stored
 * connection record. Imported trades already in trades-v2 are left intact.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured, deleteUser } from '@/lib/snaptrade';
import { getBrokerConnection, deleteBrokerConnection } from '@/lib/db/broker-connections';

export async function DELETE(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  const connection = await getBrokerConnection(userId);
  if (!connection) {
    return NextResponse.json({ success: true, data: { disconnected: true } });
  }

  // Best-effort deregister on SnapTrade's side; proceed to clear our record
  // regardless so a SnapTrade outage can't leave the user unable to disconnect.
  if (isSnapTradeConfigured()) {
    try {
      await deleteUser(connection.snaptradeUserId);
    } catch (error) {
      console.error('SnapTrade deleteUser error (continuing to clear local record):', error);
    }
  }

  try {
    await deleteBrokerConnection(userId);
    return NextResponse.json({ success: true, data: { disconnected: true } });
  } catch (error) {
    console.error('SnapTrade disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect brokerage' },
      { status: 500 }
    );
  }
}
