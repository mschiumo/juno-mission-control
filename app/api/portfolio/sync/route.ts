/**
 * POST /api/portfolio/sync — Platinum feature (owner always included).
 *
 * Manual "Sync now" for the Portfolio tab. Note SnapTrade relays brokerage
 * data roughly once a day, so this re-reads SnapTrade's cache rather than
 * forcing a fresh brokerage pull (same limitation as the trading sync).
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import { getPortfolioConnection } from '@/lib/db/portfolio-connection';
import { syncPortfolio } from '@/lib/portfolio-sync';

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
  if (!connection || connection.accounts.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No portfolio brokerage is connected.' },
      { status: 409 }
    );
  }

  try {
    const result = await syncPortfolio(connection);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Portfolio sync failed:', error);
    return NextResponse.json(
      { success: false, error: 'Sync failed. Please try again.' },
      { status: 502 }
    );
  }
}
