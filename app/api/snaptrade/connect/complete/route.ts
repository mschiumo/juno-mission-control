/**
 * POST /api/snaptrade/connect/complete
 *
 * Finishes the brokerage connection flow after the user returns from SnapTrade's
 * Connection Portal. The portal redirects straight back to the app, so nothing
 * server-side knows the link succeeded until we ask — this route is what the
 * client calls on return.
 *
 * On a genuinely linked connection it:
 *   1. pulls the live trade history (syncUserTrades), then
 *   2. clears the user's pre-broker hand-imported trades.
 *
 * The broker becomes the single source of truth for the Journal, which is what
 * the connect disclaimer warns about. The wipe is deliberately ordered *after*
 * the sync so a SnapTrade failure can never destroy the user's history without
 * putting the broker's history in its place, and the pre-clear list is backed up
 * either way (restoreTradesBackup).
 *
 * Idempotent: re-running it re-syncs and re-clears, and does nothing at all when
 * no accounts are linked (i.e. the user abandoned the portal).
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { isSnapTradeConfigured, listAccounts } from '@/lib/snaptrade';
import {
  getBrokerConnection,
  setBrokerAccounts,
  setManualTradesClearedAt,
  type BrokerAccount,
} from '@/lib/db/broker-connections';
import { clearManualTrades } from '@/lib/db/trades-v2';
import { syncUserTrades } from '@/lib/snaptrade-sync';

interface SnapTradeAccountRaw {
  id: string;
  brokerage_authorization: string;
  name: string | null;
  number: string;
  institution_name: string;
}

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Brokerage connections are not configured yet.' },
      { status: 503 }
    );
  }

  const connection = await getBrokerConnection(userId);
  if (!connection) {
    return NextResponse.json({ success: true, data: { connected: false, cleared: 0 } });
  }

  // Authoritative check that the portal actually produced a link. Never wipe on
  // a cached/stale account list — a failed or abandoned connection must leave
  // the user's imported trades exactly as they were.
  let accounts: BrokerAccount[];
  try {
    const raw = (await listAccounts({
      snaptradeUserId: connection.snaptradeUserId,
      userSecret: connection.userSecret,
    })) as SnapTradeAccountRaw[];
    accounts = (raw ?? []).map(a => ({
      id: a.id,
      brokerage: a.institution_name,
      name: a.name || a.institution_name,
      number: a.number,
      authorizationId: a.brokerage_authorization,
    }));
  } catch (error) {
    console.error('SnapTrade connect/complete: listAccounts failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not confirm the brokerage connection. Please try again.' },
      { status: 502 }
    );
  }

  if (accounts.length === 0) {
    return NextResponse.json({ success: true, data: { connected: false, cleared: 0 } });
  }
  await setBrokerAccounts(userId, accounts);

  // Pull the live history first — the wipe below is only safe once this lands.
  let tradesWritten = 0;
  try {
    const sync = await syncUserTrades({ ...connection, accounts });
    tradesWritten = sync.tradesWritten;
  } catch (error) {
    console.error('SnapTrade connect/complete: initial sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          'Connected, but the first trade sync failed. Your existing trades were left untouched — try "Refresh data".',
      },
      { status: 502 }
    );
  }

  const { removed } = await clearManualTrades(userId);
  await setManualTradesClearedAt(userId, new Date().toISOString());

  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      accounts: accounts.length,
      brokerage: accounts[0].brokerage,
      tradesWritten,
      cleared: removed,
    },
  });
}
