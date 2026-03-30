/**
 * Average Volume Backfill
 *
 * Manually triggered to populate the initial 90-day window.
 * Fetches up to 4 dates per invocation (kept small to avoid browser/function timeouts).
 * Call repeatedly until response shows complete: true.
 */

import { NextResponse } from 'next/server';
import { logToActivityLog } from '@/lib/cron-helpers';
import {
  getTradingDays,
  getStoredDates,
  fetchBatch,
  pruneOldDates,
  recomputeAverages,
} from '@/lib/avg-volume';

const BATCH_SIZE = 4;

export async function GET() {
  const startTime = Date.now();

  try {
    const targetDates = getTradingDays(new Date(), 90);
    const stored = new Set(await getStoredDates());
    const missing = targetDates.filter((d) => !stored.has(d));

    if (missing.length === 0) {
      const { tickerCount } = await recomputeAverages();
      return NextResponse.json({
        success: true,
        complete: true,
        storedDays: stored.size,
        tickerAverages: tickerCount,
        durationMs: Date.now() - startTime,
      });
    }

    const batch = missing.slice(0, BATCH_SIZE);
    console.log(`[AvgVolumeBackfill] Fetching ${batch.length} of ${missing.length} missing dates...`);

    const { fetched, errors } = await fetchBatch(batch);

    const remaining = missing.length - fetched;
    const complete = remaining <= 0;

    let tickerCount = 0;
    if (complete) {
      await pruneOldDates(90);
      const result = await recomputeAverages();
      tickerCount = result.tickerCount;
    }

    const duration = Date.now() - startTime;
    console.log(`[AvgVolumeBackfill] Batch done in ${duration}ms: ${fetched} fetched, ${remaining} remaining`);

    await logToActivityLog(
      'Avg Volume Backfill',
      `Fetched ${fetched}/${batch.length} dates, ${remaining} remaining`,
      'cron',
    );

    return NextResponse.json({
      success: true,
      complete,
      fetched,
      remaining,
      errors: errors.length > 0 ? errors : undefined,
      tickerAverages: complete ? tickerCount : undefined,
      durationMs: duration,
    });
  } catch (error) {
    console.error('[AvgVolumeBackfill] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    await logToActivityLog('Avg Volume Backfill Failed', msg, 'cron');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
