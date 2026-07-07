/**
 * Weekly rebuild of the Massive-backed screening universe (Sunday, pre-week).
 *
 * Rebuilds the cached large-cap liquid universe the nightly agent screens.
 * WATCHLIST MAINTENANCE ONLY — creates no proposals and places no orders.
 * No-ops (successfully) when the universe source is the env list.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts.
 */

import { NextResponse } from 'next/server';
import { refreshMassiveUniverse } from '@/lib/confluence/universe';
import { postToCronResults } from '@/lib/cron-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const source = (process.env.CONFLUENCE_UNIVERSE_SOURCE || 'env').toLowerCase();
  if (source !== 'massive') {
    return NextResponse.json({ success: true, skipped: true, reason: `universe source is '${source}'` });
  }

  try {
    const cache = await refreshMassiveUniverse();
    await postToCronResults(
      'confluence-universe-refresh',
      `Universe rebuilt: ${cache.stats.final} symbols (${cache.stats.liquidityPass} liquid → cap-filtered; ${cache.stats.detailsFailed} lookups failed)`,
    );
    return NextResponse.json({ success: true, stats: cache.stats, builtAt: cache.builtAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Universe refresh failed';
    await postToCronResults('confluence-universe-refresh', `Universe refresh FAILED: ${message}`, 'error');
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
