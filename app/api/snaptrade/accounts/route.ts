/**
 * GET /api/snaptrade/accounts
 *
 * Returns the user's brokerage connection status and linked accounts. When
 * SnapTrade is reachable it refreshes the account list from the API and caches
 * it; on transient errors it falls back to the last cached list.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured, listAccounts } from '@/lib/snaptrade';
import {
  getBrokerConnection,
  setBrokerAccounts,
  type BrokerAccount,
} from '@/lib/db/broker-connections';

// Minimal shape of a SnapTrade Account we depend on (see SDK `Account`).
interface SnapTradeAccount {
  id: string;
  brokerage_authorization: string;
  name: string | null;
  number: string;
  institution_name: string;
}

function mapAccount(a: SnapTradeAccount): BrokerAccount {
  return {
    id: a.id,
    brokerage: a.institution_name,
    name: a.name || a.institution_name,
    number: a.number,
    authorizationId: a.brokerage_authorization,
  };
}

export async function GET(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  const connection = await getBrokerConnection(userId);
  if (!connection) {
    return NextResponse.json({
      success: true,
      data: { connected: false, accounts: [], lastSyncedAt: null },
    });
  }

  // Have a stored connection but creds are absent — serve cached accounts.
  if (!isSnapTradeConfigured()) {
    return NextResponse.json({
      success: true,
      data: {
        connected: true,
        accounts: connection.accounts,
        lastSyncedAt: connection.lastSyncedAt ?? null,
      },
    });
  }

  try {
    const raw = (await listAccounts({
      snaptradeUserId: connection.snaptradeUserId,
      userSecret: connection.userSecret,
    })) as SnapTradeAccount[];
    const accounts = (raw ?? []).map(mapAccount);
    await setBrokerAccounts(userId, accounts);
    return NextResponse.json({
      success: true,
      data: {
        connected: accounts.length > 0,
        accounts,
        lastSyncedAt: connection.lastSyncedAt ?? null,
      },
    });
  } catch (error) {
    console.error('SnapTrade accounts error:', error);
    // Transient SnapTrade error — return the cached list, flagged stale.
    return NextResponse.json({
      success: true,
      data: {
        connected: true,
        accounts: connection.accounts,
        lastSyncedAt: connection.lastSyncedAt ?? null,
        stale: true,
      },
    });
  }
}
