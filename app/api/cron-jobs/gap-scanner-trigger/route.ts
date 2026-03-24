/**
 * Gap Scanner Trigger API Endpoint
 *
 * Calls gap scanner logic directly (no self-referencing HTTP fetch).
 */

import { NextResponse } from 'next/server';
import {
  postToCronResults,
  sendTelegramIfNeeded,
  logToActivityLog,
  formatDate,
  isMarketOpenToday
} from '@/lib/cron-helpers';
import { runGapScan } from '@/lib/gap-scanner-core';

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

    const result = await runGapScan({ useCache: false, minGapPercent: 5 });

    if (!result.success || !result.data) {
      throw new Error('Gap scanner returned no data');
    }

    const { gainers, losers } = result.data;

    const reportLines = [`📊 **Gap Scanner Pre-Market** — ${formatDate()}`, ''];

    if (result.marketSession) {
      reportLines.push(`Market Session: ${result.marketSession}`, '');
    }

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
      `from ${result.scanned || '?'} stocks scanned`
    );

    const reportContent = reportLines.join('\n');

    await postToCronResults('Gap Scanner', reportContent, 'market');
    await logToActivityLog('Gap Scanner', `Completed: ${gainers.length} gainers, ${losers.length} losers`, 'cron');
    await sendTelegramIfNeeded(reportContent);

    const duration = Date.now() - startTime;
    console.log(`[GapScannerTrigger] Completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      data: { gainers: gainers.length, losers: losers.length, scanned: result.scanned, durationMs: duration }
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
