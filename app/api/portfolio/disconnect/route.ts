/**
 * DELETE /api/portfolio/disconnect — Platinum feature (owner always included).
 *
 * Tears down the portfolio connection end to end: deregisters the dedicated
 * portfolio SnapTrade user (queued for the nightly orphan retry if the call
 * fails — SnapTrade bills per connected user), clears the portfolio data
 * stores, and deletes the connection record. Touches nothing in the trading
 * namespace.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { isSnapTradeConfigured, deleteUser } from '@/lib/snaptrade';
import { recordOrphan } from '@/lib/brokerage-access';
import {
  getPortfolioConnection,
  deletePortfolioConnection,
  clearPortfolioData,
} from '@/lib/db/portfolio-connection';

export async function DELETE(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  const connection = await getPortfolioConnection(userId);
  if (!connection) {
    return NextResponse.json({ success: true, data: { disconnected: true, hadConnection: false } });
  }

  let deregistered = false;
  let orphaned = false;
  if (isSnapTradeConfigured()) {
    try {
      await deleteUser(connection.snaptradeUserId);
      deregistered = true;
    } catch (error) {
      console.error('Portfolio deleteUser failed; queueing for retry:', error);
      await recordOrphan(connection.snaptradeUserId);
      orphaned = true;
    }
  }

  await clearPortfolioData(userId);
  await deletePortfolioConnection(userId);

  return NextResponse.json({
    success: true,
    data: { disconnected: true, hadConnection: true, deregistered, orphaned },
  });
}
