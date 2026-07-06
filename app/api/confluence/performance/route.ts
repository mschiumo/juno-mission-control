/**
 * ConfluenceTrading performance API (owner-only).
 *
 * GET /api/confluence/performance
 *   → { stats, positions, history } for the Agents → Performance panel.
 *     Computes positions/P&L from the order log, marks to market (best-effort),
 *     records today's equity point, and returns the equity curve.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { computePerformance } from '@/lib/confluence/performance';
import { getBalanceHistory } from '@/lib/db/confluence/balance-history';
import type { PerformanceResponse } from '@/types/confluence';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const { stats, positions } = await computePerformance(userId);
    const history = await getBalanceHistory(userId);
    const body: PerformanceResponse = { stats, positions, history };
    return NextResponse.json({ success: true, ...body });
  } catch (e) {
    console.error('Error computing ConfluenceTrading performance:', e);
    return NextResponse.json({ success: false, error: 'Failed to compute performance' }, { status: 500 });
  }
}
