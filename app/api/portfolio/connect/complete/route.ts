/**
 * POST /api/portfolio/connect/complete — Platinum feature (owner always included).
 *
 * Finishes the portfolio connection flow after the user returns from
 * SnapTrade's Connection Portal: confirms an account was actually linked (via
 * a live listAccounts, never a cache), stores the account list, and runs the
 * first sync so the tab has data immediately.
 *
 * Unlike the trading flow this touches nothing else — no trade wipe, no
 * Journal handoff. Idempotent: re-running re-lists and re-syncs.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { isSnapTradeConfigured, listAccounts } from '@/lib/snaptrade';
import {
  getPortfolioConnection,
  setPortfolioAccounts,
} from '@/lib/db/portfolio-connection';
import type { BrokerAccount } from '@/lib/db/broker-connections';
import { syncPortfolio } from '@/lib/portfolio-sync';

interface SnapTradeAccountRaw {
  id: string;
  brokerage_authorization: string;
  name: string | null;
  number: string;
  institution_name: string;
}

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Brokerage connections are not configured yet.' },
      { status: 503 }
    );
  }

  const connection = await getPortfolioConnection(userId);
  if (!connection) {
    return NextResponse.json({ success: true, data: { connected: false } });
  }

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
    console.error('Portfolio connect/complete: listAccounts failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not confirm the brokerage connection. Please try again.' },
      { status: 502 }
    );
  }

  if (accounts.length === 0) {
    // Portal closed without linking anything.
    return NextResponse.json({ success: true, data: { connected: false } });
  }
  await setPortfolioAccounts(userId, accounts);

  try {
    const sync = await syncPortfolio({ ...connection, accounts });
    return NextResponse.json({
      success: true,
      data: {
        connected: true,
        accounts: accounts.length,
        brokerage: accounts[0].brokerage,
        positions: sync.positions,
        activities: sync.activities,
      },
    });
  } catch (error) {
    console.error('Portfolio connect/complete: initial sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Connected, but the first sync failed. Try "Sync now" from the Portfolio tab.',
      },
      { status: 502 }
    );
  }
}
