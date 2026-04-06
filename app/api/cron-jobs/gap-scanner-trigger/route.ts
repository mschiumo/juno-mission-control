/**
 * Gap Scanner Trigger API Endpoint
 *
 * Uses Polygon.io (single API call for all stocks) instead of Finnhub
 * (one call per stock) so it completes in seconds, not minutes.
 */

import { NextResponse } from 'next/server';
import {
  postToCronResults,
  sendTelegramIfNeeded,
  logToActivityLog,
  formatDate,
  isMarketOpenToday,
  cacheGapScanResults,
} from '@/lib/cron-helpers';
import { runPolygonGapScan, getMarketSession } from '@/lib/gap-scanner-polygon';
import { runYahooGapScan } from '@/lib/gap-scanner-yahoo';
import { storeScanResults, ScanResult } from '@/lib/gap-scanner-core';

function formatVolume(volume: number): string {
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toString();
}

function formatMarketCap(cap: number): string {
  if (cap >= 1000000000000) return `$${(cap / 1000000000000).toFixed(1)}T`;
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(1)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(1)}M`;
  return `$${cap}`;
}

export async function POST() {
  const startTime = Date.now();

  try {
    console.log('[GapScannerTrigger] Triggering gap scanner...');

    if (!isMarketOpenToday()) {
      const message = '📊 Market is closed today (weekend or holiday). Skipping gap scan.';
      await postToCronResults('Gap Scanner', message, 'market');
      await logToActivityLog('Gap Scanner', 'Market closed - scan skipped', 'cron');
      return NextResponse.json({
        success: true,
        data: { marketOpen: false, message },
        durationMs: Date.now() - startTime
      });
    }

    await logToActivityLog('Gap Scanner', 'Starting pre-market gap scan...', 'cron');

    const { isPreMarket, session: marketSession } = getMarketSession();
    console.log(`[GapScannerTrigger] Market session: ${marketSession}, isPreMarket: ${isPreMarket}`);

    let gainers: { symbol: string; price: number; gapPercent: number; volume: number; marketCap: number }[];
    let losers: typeof gainers;
    let scanned: number | undefined;
    let source: string;

    try {
      const result = await runPolygonGapScan({ minGapPercent: 5 });
      if (!result.success || !result.data) throw new Error('Polygon returned no data');
      gainers = result.data.gainers;
      losers = result.data.losers;
      scanned = result.scanned;
      source = 'polygon';
      await cacheGapScanResults(result);
      const today = new Date().toISOString().split('T')[0];
      await storeScanResults({ ...result, tradingDate: today } as unknown as ScanResult);
    } catch (polygonError) {
      console.warn('[GapScannerTrigger] Polygon failed, falling back to Yahoo:', polygonError);
      await logToActivityLog('Gap Scanner', 'Polygon unavailable, using Yahoo fallback', 'cron');
      const result = await runYahooGapScan({ minGapPercent: 5, isPreMarket });
      if (!result.success || !result.data) throw new Error('Yahoo fallback also returned no data');
      gainers = result.data.gainers;
      losers = result.data.losers;
      scanned = result.scanned;
      source = 'yahoo';
      await cacheGapScanResults(result);
      const today = new Date().toISOString().split('T')[0];
      await storeScanResults({ ...result, tradingDate: today } as unknown as ScanResult);
    }

    const reportLines = [`📊 **Gap Scanner Pre-Market** — ${formatDate()}`, ''];

    reportLines.push(`Source: ${source}`, '');

    if (gainers.length > 0) {
      reportLines.push(`**🚀 Top Gainers (${gainers.length} found)**`);
      for (const stock of gainers.slice(0, 10)) {
        reportLines.push(
          `• **$${stock.symbol}**: +${stock.gapPercent}% ` +
          `($${stock.price.toFixed(2)}, Vol: ${formatVolume(stock.volume)}, Cap: ${formatMarketCap(stock.marketCap)})`
        );
      }
      reportLines.push('');
    } else {
      reportLines.push('**🚀 Top Gainers**: None found\n');
    }

    if (losers.length > 0) {
      reportLines.push(`**📉 Top Losers (${losers.length} found)**`);
      for (const stock of losers.slice(0, 10)) {
        reportLines.push(
          `• **$${stock.symbol}**: ${stock.gapPercent}% ` +
          `($${stock.price.toFixed(2)}, Vol: ${formatVolume(stock.volume)}, Cap: ${formatMarketCap(stock.marketCap)})`
        );
      }
      reportLines.push('');
    } else {
      reportLines.push('**📉 Top Losers**: None found\n');
    }

    reportLines.push(
      `**Summary**: ${gainers.length} gainers, ${losers.length} losers ` +
      `from ${scanned || '?'} stocks scanned`
    );

    const reportContent = reportLines.join('\n');

    await postToCronResults('Gap Scanner', reportContent, 'market');
    await logToActivityLog('Gap Scanner', `Completed (${source}): ${gainers.length} gainers, ${losers.length} losers`, 'cron');
    await sendTelegramIfNeeded(reportContent);

    // Email alerts are sent via the combined Morning Brief (market-briefing cron)
    // which reads cached gap data and includes it in the briefing email.

    const duration = Date.now() - startTime;
    console.log(`[GapScannerTrigger] Completed in ${duration}ms via ${source}`);

    return NextResponse.json({
      success: true,
      data: { gainers: gainers.length, losers: losers.length, scanned, source, durationMs: duration }
    });

  } catch (error) {
    console.error('[GapScannerTrigger] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToActivityLog('Gap Scanner Failed', errorMessage, 'cron');
    await postToCronResults('Gap Scanner', `❌ Gap Scanner Failed\n\nError: ${errorMessage}`, 'error');
    return NextResponse.json(
      { success: false, error: 'Gap scanner trigger failed', message: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
