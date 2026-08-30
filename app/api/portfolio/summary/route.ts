/**
 * GET /api/portfolio/summary — owner-only.
 *
 * Everything the Portfolio tab needs in one call: connection status, the
 * stored snapshot (accounts, positions, derived value series), and analysis
 * derived from the activity ledger (recurring flows, income, cash flows).
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import {
  getPortfolioConnection,
  getPortfolioSnapshot,
  getPortfolioActivities,
} from '@/lib/db/portfolio-connection';
import {
  detectRecurringFlows,
  summarizeIncome,
  summarizeCashFlows,
  positionWeights,
} from '@/lib/portfolio-insights';
import { getTodayInEST } from '@/lib/date-utils';

export async function GET(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  const connection = await getPortfolioConnection(userId);
  if (!connection || connection.accounts.length === 0) {
    return NextResponse.json({
      success: true,
      data: { connected: false, configured: isSnapTradeConfigured() },
    });
  }

  const [snapshot, activities] = await Promise.all([
    getPortfolioSnapshot(userId),
    getPortfolioActivities(userId),
  ]);

  const today = getTodayInEST();
  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      configured: isSnapTradeConfigured(),
      accounts: connection.accounts,
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt ?? null,
      snapshot,
      weights: snapshot ? positionWeights(snapshot.positions) : [],
      recurring: detectRecurringFlows(activities),
      income: summarizeIncome(activities, today),
      cashFlows: summarizeCashFlows(activities, today),
      activitiesCount: activities.length,
    },
  });
}
