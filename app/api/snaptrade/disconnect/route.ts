/**
 * DELETE /api/snaptrade/disconnect
 *
 * Removes the user's brokerage connection: deregisters them with SnapTrade
 * (which disables all their brokerage authorizations), resets the trade
 * history the broker owned, and deletes our stored connection record.
 *
 * The broker is the sole source of the Journal while linked (connect wiped any
 * hand-imported trades into a one-time backup), so disconnecting undoes that
 * takeover: the pre-broker backup is restored — an empty list for users who
 * started on the broker — and the broker-synced trades are gone. Local clears
 * run before the connection record is deleted so a mid-flight failure leaves
 * the record in place and a retry re-runs the whole cleanup.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { isSnapTradeConfigured, deleteUser } from '@/lib/snaptrade';
import { getBrokerConnection, deleteBrokerConnection } from '@/lib/db/broker-connections';
import { clearBrokerDailyBalances } from '@/lib/db/balances';
import { clearBrokerDailyFees } from '@/lib/db/fees';
import { restoreTradesBackup, clearAllTrades, clearTradesBackup } from '@/lib/db/trades-v2';

export async function DELETE(): Promise<NextResponse> {
  const { userId, error: authError } = await requireUserId();
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
    // Reset the trade list the broker owned: back to the pre-broker snapshot
    // when one exists, otherwise empty.
    const restored = await restoreTradesBackup(userId);
    if (restored === null) {
      await clearAllTrades(userId);
    }

    // The broker-derived balance/fee series only feed the equity curve while a
    // brokerage is linked (single-source). Clear them so the curve falls back
    // to statement uploads instead of a stale broker series.
    await clearBrokerDailyBalances(userId);
    await clearBrokerDailyFees(userId);

    await deleteBrokerConnection(userId);

    // Only after the disconnect is fully committed: drop the consumed backup so
    // a future reconnect snapshots the then-current list fresh. (Kept last so a
    // retried partial failure above can still restore it.)
    await clearTradesBackup(userId);

    return NextResponse.json({
      success: true,
      data: { disconnected: true, tradesRestored: restored ?? 0 },
    });
  } catch (error) {
    console.error('SnapTrade disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect brokerage' },
      { status: 500 }
    );
  }
}
