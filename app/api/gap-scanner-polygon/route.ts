/**
 * Gap Scanner using Polygon.io API
 *
 * GET /api/gap-scanner-polygon
 * Fetches all stocks in a single API call and calculates gaps
 * Much faster than Finnhub (1 call vs 5000 calls)
 */

import { NextResponse } from 'next/server';
import { getCachedGapScanResults } from '@/lib/cron-helpers';
import {
  getMarketSession,
  fetchAllSnapshots,
  processGaps,
  type PolygonScanResult,
} from '@/lib/gap-scanner-polygon';

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
    // Before hitting Polygon, check for fresh cron-cached results (pre-market)
    if (marketInfo.session === 'pre-market' || marketInfo.session === 'closed') {
      const cached = await getCachedGapScanResults() as PolygonScanResult | null;
      if (cached?.success && cached?.data) {
        console.log('[GapScanner-Polygon] Serving cached cron results');
        return NextResponse.json({
          ...cached,
          source: 'polygon-cached',
          durationMs: Date.now() - startTime,
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

    // Fetch all snapshots in ONE API call
    const snapshots = await fetchAllSnapshots(marketInfo.session);

    // Process gaps
    const { gainers, losers, skipped } = processGaps(snapshots, {
      minGapPercent,
      minVolume,
      minPrice,
      maxPrice,
      isPreMarket: marketInfo.isPreMarket,
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
