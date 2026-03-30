/**
 * Daily Average Volume Cron
 *
 * Runs once per trading day after market close.
 * Fetches the day's grouped bars (1 API call), stores it,
 * prunes the oldest day beyond 90, and recomputes the average map.
 */

import { NextResponse } from 'next/server';
import { isMarketOpenToday, logToActivityLog } from '@/lib/cron-helpers';
import {
  getTradingDays,
  fetchGroupedDaily,
  storeDayVolume,
  pruneOldDates,
  recomputeAverages,
  getStoredDates,
} from '@/lib/avg-volume';

export async function GET() {
  const startTime = Date.now();

  try {
    if (!isMarketOpenToday()) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Market closed today' });
    }

    // Most recent trading day (today, since this runs after close)
    const [today] = getTradingDays(new Date(), 1).slice(-1);
    const storedBefore = await getStoredDates();

    if (storedBefore.includes(today)) {
      return NextResponse.json({ success: true, skipped: true, reason: `${today} already stored` });
    }

    console.log(`[AvgVolumeDaily] Fetching grouped bars for ${today}...`);
    const volumes = await fetchGroupedDaily(today);
    await storeDayVolume(today, volumes);

    const pruned = await pruneOldDates(90);
    const { tickerCount } = await recomputeAverages();

    const duration = Date.now() - startTime;
    console.log(`[AvgVolumeDaily] Done in ${duration}ms: ${Object.keys(volumes).length} tickers stored, ${pruned.length} old dates pruned, ${tickerCount} averages computed`);

    await logToActivityLog(
      'Avg Volume',
      `Updated ${today}: ${tickerCount} ticker averages computed`,
      'cron',
    );

    return NextResponse.json({
      success: true,
      date: today,
      tickersStored: Object.keys(volumes).length,
      datesPruned: pruned.length,
      tickerAverages: tickerCount,
      durationMs: duration,
    });
  } catch (error) {
    console.error('[AvgVolumeDaily] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    await logToActivityLog('Avg Volume Failed', msg, 'cron');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
