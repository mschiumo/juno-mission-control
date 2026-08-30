/**
 * GET /api/portfolio/activities — Platinum feature (owner always included).
 *
 * The stored activity ledger (newest first), optionally filtered by type
 * group and capped. Used by the Portfolio tab's Transactions section.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { getPortfolioActivities } from '@/lib/db/portfolio-connection';

/** UI filter groups → the SnapTrade activity types they cover. */
const TYPE_GROUPS: Record<string, string[]> = {
  deposits: ['CONTRIBUTION'],
  withdrawals: ['WITHDRAWAL'],
  dividends: ['DIVIDEND', 'STOCK_DIVIDEND', 'REI'],
  interest: ['INTEREST'],
  trades: ['BUY', 'SELL'],
  fees: ['FEE', 'TAX'],
  transfers: ['TRANSFER'],
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  const group = req.nextUrl.searchParams.get('type') ?? '';
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 200;

  let activities = await getPortfolioActivities(userId);
  if (group && TYPE_GROUPS[group]) {
    const types = new Set(TYPE_GROUPS[group]);
    activities = activities.filter(a => types.has(a.type));
  } else if (group === 'other') {
    const known = new Set(Object.values(TYPE_GROUPS).flat());
    activities = activities.filter(a => !known.has(a.type));
  }

  return NextResponse.json({
    success: true,
    data: { activities: activities.slice(0, limit), total: activities.length },
  });
}
