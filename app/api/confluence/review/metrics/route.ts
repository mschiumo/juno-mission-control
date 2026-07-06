/**
 * Performance Review — computed scorecards (owner-only).
 *
 * GET /api/confluence/review/metrics?sessions=N
 *   All numbers computed server-side by the pure metrics engine. Returns the
 *   manual / agentic / combined scorecards (for the dashboard + comparison
 *   view), the paired round trips, open positions, and the imported YTD
 *   symbol P/L summary context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { computeMetrics, filterTrades } from '@/lib/confluence/review/metrics';
import { pairExecutions } from '@/lib/confluence/review/pairing';
import {
  getExecutions,
  getRiskConfig,
  getRoundTrips,
  getSymbolPlSummaries,
} from '@/lib/db/confluence/review';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const sessionsRaw = request.nextUrl.searchParams.get('sessions');
  const trailingSessions = sessionsRaw ? Math.max(0, parseInt(sessionsRaw, 10) || 0) : undefined;

  const [config, trades, executions, symbolPl] = await Promise.all([
    getRiskConfig(userId),
    getRoundTrips(userId),
    getExecutions(userId),
    getSymbolPlSummaries(userId),
  ]);

  const scope = (source: 'manual_tos' | 'agentic_rh' | 'all') =>
    computeMetrics(filterTrades(trades, { source, trailingSessions }), config, source);

  const { openPositions } = pairExecutions(executions);
  const latestAsOf = symbolPl.map((r) => r.asOfDate).sort().pop();

  return NextResponse.json({
    success: true,
    config,
    metrics: { all: scope('all'), manual: scope('manual_tos'), agentic: scope('agentic_rh') },
    trades: [...trades].sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 200),
    openPositions,
    symbolPl: {
      asOfDate: latestAsOf,
      rows: latestAsOf
        ? symbolPl.filter((r) => r.asOfDate === latestAsOf).sort((a, b) => a.plYtd - b.plYtd)
        : [],
    },
  });
}
