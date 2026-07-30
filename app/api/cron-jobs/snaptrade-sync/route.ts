/**
 * Scheduled SnapTrade sync (Vercel cron)
 *
 * Re-syncs every user who has linked a brokerage. Gated by CRON_SECRET in
 * middleware.ts (Authorization: Bearer <CRON_SECRET>), same as the other
 * /api/cron-jobs/* routes. No-ops cleanly when SnapTrade isn't configured.
 */

import { NextResponse } from 'next/server';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import { getAllBrokerConnections } from '@/lib/db/broker-connections';
import { syncUserTrades } from '@/lib/snaptrade-sync';

export async function POST() {
  const startTime = Date.now();

  if (!isSnapTradeConfigured()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'SnapTrade not configured' });
  }

  const connections = await getAllBrokerConnections();
  const results: Array<Record<string, unknown>> = [];
  let ok = 0;
  let failed = 0;

  for (const conn of connections) {
    try {
      const r = await syncUserTrades(conn);
      results.push({ userId: conn.userId, accounts: r.accounts, tradesWritten: r.tradesWritten });
      ok += 1;
    } catch (error) {
      console.error(`[SnapTradeSync] failed for user ${conn.userId}:`, error);
      results.push({ userId: conn.userId, error: error instanceof Error ? error.message : String(error) });
      failed += 1;
    }
  }

  return NextResponse.json({
    success: true,
    data: { users: connections.length, ok, failed, results, durationMs: Date.now() - startTime },
  });
}

export async function GET() {
  return POST();
}
