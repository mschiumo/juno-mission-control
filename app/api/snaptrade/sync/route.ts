/**
 * POST /api/snaptrade/sync
 *
 * Manually sync the authenticated user's brokerage trades: pull activities,
 * transform to round-trip Trades, and write them as the trade list (broker =
 * source of truth; the prior list is backed up once and restorable).
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import { getBrokerConnection } from '@/lib/db/broker-connections';
import { syncUserTrades } from '@/lib/snaptrade-sync';

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Brokerage connections are not configured yet.' },
      { status: 503 }
    );
  }

  const connection = await getBrokerConnection(userId);
  if (!connection) {
    return NextResponse.json(
      { success: false, error: 'No brokerage connected.' },
      { status: 400 }
    );
  }

  try {
    const result = await syncUserTrades(connection);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('SnapTrade sync error:', error);
    return NextResponse.json({ success: false, error: 'Failed to sync trades' }, { status: 500 });
  }
}
