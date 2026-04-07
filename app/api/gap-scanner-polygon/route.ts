/**
 * Gap Scanner using Polygon.io API
 *
 * GET /api/gap-scanner-polygon
 * Fetches all stocks in a single API call and calculates gaps
 * Much faster than Finnhub (1 call vs 5000 calls)
 */

import { NextResponse } from 'next/server';
import { getCachedGapScanResults, cacheGapScanResults } from '@/lib/cron-helpers';
import {
  getMarketSession,
  fetchAllSnapshots,
  processGaps,
  type PolygonScanResult,
} from '@/lib/gap-scanner-polygon';
import { getAvgVolumeMap } from '@/lib/avg-volume';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  // Parse filters from query params
  const minGapPercent = parseFloat(searchParams.get('minGap') || '2');
  const minVolume = parseInt(searchParams.get('minVolume') || '1000000', 10);
  const minPrice = parseFloat(searchParams.get('minPrice') || '1');
  const maxPrice = parseFloat(searchParams.get('maxPrice') || '1000');

  const marketInfo = getMarketSession();

  try {
    // When market is closed or pre-market, serve cached results from last cron run
    if (marketInfo.session === 'pre-market' || marketInfo.session === 'closed') {
      const cached = await getCachedGapScanResults() as PolygonScanResult | null;
      if (cached?.success && cached?.data) {
        console.log('[GapScanner-Polygon] Serving cached cron results');
        return NextResponse.json({
          ...cached,
          source: 'polygon-cached',
          marketSession: marketInfo.session,
          marketStatus: marketInfo.marketStatus,
          durationMs: Date.now() - startTime,
        });
      }
      // If market is closed and no cache, return empty with a clear message
      // (live Polygon data has 0 volume on weekends, so scanning would return nothing)
      if (marketInfo.session === 'closed') {
        return NextResponse.json({
          success: true,
          data: { gainers: [], losers: [] },
          timestamp: new Date().toISOString(),
          source: 'none',
          scanned: 0,
          found: 0,
          durationMs: Date.now() - startTime,
          isWeekend: marketInfo.isWeekend,
          tradingDate: marketInfo.tradingDate,
          previousDate: marketInfo.previousDate,
          marketSession: 'closed',
          marketStatus: 'closed',
          isPreMarket: false,
          message: 'Market is closed. Results will appear after the next trading session.',
        });
      }
    }

    // Check API key
    if (!POLYGON_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured. Please add it to your .env.local file.',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        ...marketInfo,
        marketSession: marketInfo.session,
      }, { status: 500 });
    }

    console.log(`[GapScanner-Polygon] Starting scan at ${new Date().toISOString()}`);
    console.log(`[GapScanner-Polygon] Filters: minGap=${minGapPercent}%, minVolume=${minVolume}, minPrice=${minPrice}, maxPrice=${maxPrice}`);

    // Fetch snapshots and avg volume map in parallel
    const [snapshots, avgVolumeMap] = await Promise.all([
      fetchAllSnapshots(marketInfo.session),
      getAvgVolumeMap().catch(() => null),
    ]);

    // Process gaps
    const { gainers, losers, skipped } = processGaps(snapshots, {
      minGapPercent,
      minVolume,
      minPrice,
      maxPrice,
      isPreMarket: marketInfo.isPreMarket,
      avgVolumeMap: avgVolumeMap ?? undefined,
    });

    const durationMs = Date.now() - startTime;

    const result: PolygonScanResult = {
      success: true,
      data: { gainers, losers },
      timestamp: new Date().toISOString(),
      source: 'polygon',
      scanned: snapshots.length,
      found: gainers.length + losers.length,
      durationMs,
      isWeekend: marketInfo.isWeekend,
      tradingDate: marketInfo.tradingDate,
      previousDate: marketInfo.previousDate,
      marketSession: marketInfo.session,
      marketStatus: marketInfo.marketStatus,
      isPreMarket: marketInfo.isPreMarket,
      debug: {
        apiKeyPresent: true,
        skippedByGap: skipped.gap,
        skippedByVolume: skipped.volume,
        skippedByPrice: skipped.price,
        skippedNoPremarketTrade: skipped.noPremarketTrade,
      },
      filters: {
        minGapPercent,
        minVolume,
        minPrice,
        maxPrice,
      },
    };

    console.log(`[GapScanner-Polygon] Completed in ${durationMs}ms`);
    console.log(`[GapScanner-Polygon] Results: ${gainers.length} gainers, ${losers.length} losers from ${snapshots.length} stocks`);

    // Cache results so they're available when market is closed
    if (result.data.gainers.length > 0 || result.data.losers.length > 0) {
      await cacheGapScanResults(result).catch(() => {});
    }

    return NextResponse.json(result);

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('[GapScanner-Polygon] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch gap data',
      timestamp: new Date().toISOString(),
      durationMs,
      isWeekend: marketInfo.isWeekend,
      tradingDate: marketInfo.tradingDate,
      previousDate: marketInfo.previousDate,
      marketSession: marketInfo.session,
      marketStatus: marketInfo.marketStatus,
      isPreMarket: marketInfo.isPreMarket,
    }, { status: 500 });
  }
}
