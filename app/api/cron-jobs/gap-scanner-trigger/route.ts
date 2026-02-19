/**
 * Gap Scanner Trigger API Endpoint
 * 
 * POST: Trigger gap scanner
 * - Call existing /api/gap-scanner endpoint
 * - Handle results
 * - POST to /api/cron-results
 */

import { NextResponse } from 'next/server';
import { 
  postToCronResults, 
  sendTelegramIfNeeded, 
  logToActivityLog,
  formatDate,
  isMarketOpenToday
} from '@/lib/cron-helpers';

interface GapStock {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  gapPercent: number;
  volume: number;
  marketCap: number;
  status: 'gainer' | 'loser';
}

interface GapScannerResponse {
  success: boolean;
  data?: {
    gainers: GapStock[];
    losers: GapStock[];
  };
  scanned?: number;
  found?: number;
  error?: string;
  marketSession?: string;
  isPreMarket?: boolean;
}

async function triggerGapScanner(): Promise<GapScannerResponse> {
  try {
    // Call the existing gap scanner API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(
      `${baseUrl}/api/gap-scanner?cache=false&minGap=5`,
      { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // Longer timeout since gap scanner takes time
        signal: AbortSignal.timeout(300000) // 5 minutes
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gap scanner API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as GapScannerResponse;
  } catch (error) {
    console.error('[GapScannerTrigger] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  }
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
}

function formatMarketCap(cap: number): string {
  if (cap >= 1000000000000) {
    return `$${(cap / 1000000000000).toFixed(1)}T`;
  }
  if (cap >= 1000000000) {
    return `$${(cap / 1000000000).toFixed(1)}B`;
  }
  if (cap >= 1000000) {
    return `$${(cap / 1000000).toFixed(1)}M`;
  }
  return `$${cap}`;
}

export async function POST() {
  const startTime = Date.now();
  
  try {
    console.log('[GapScannerTrigger] Triggering gap scanner...');
    
    // Check if market is open today
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
    
    // Log start
    await logToActivityLog('Gap Scanner', 'Starting pre-market gap scan...', 'cron');
    
    // Trigger the scanner
    const result = await triggerGapScanner();
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Gap scanner failed');
    }
    
    const { gainers, losers } = result.data;
    
    // Format the report
    const reportLines = [
      `📊 **Gap Scanner Pre-Market** — ${formatDate()}`,
      ''
    ];
    
    // Add session info
    if (result.marketSession) {
      reportLines.push(`Market Session: ${result.marketSession}`);
      reportLines.push('');
    }
    
    // Top gainers
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
    
    // Top losers
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
    
    // Summary
    reportLines.push(
      `**Summary**: ${gainers.length} gainers, ${losers.length} losers ` +
      `from ${result.scanned || '?'} stocks scanned`
    );
    
    const reportContent = reportLines.join('\n');
    
    // Post to cron results
    await postToCronResults('Gap Scanner', reportContent, 'market');
    
    // Log completion
    await logToActivityLog(
      'Gap Scanner',
      `Completed: ${gainers.length} gainers, ${losers.length} losers`,
      'cron'
    );
    
    // Send Telegram notification
    await sendTelegramIfNeeded(reportContent);
    
    const duration = Date.now() - startTime;
    console.log(`[GapScannerTrigger] Completed in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        gainers: gainers.length,
        losers: losers.length,
        scanned: result.scanned,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[GapScannerTrigger] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log error
    await logToActivityLog('Gap Scanner Failed', errorMessage, 'cron');
    
    // Post error to cron results
    await postToCronResults(
      'Gap Scanner',
      `❌ Gap Scanner Failed\n\nError: ${errorMessage}`,
      'error'
    );
    
    return NextResponse.json({
      success: false,
      error: 'Gap scanner trigger failed',
      message: errorMessage
    }, { status: 500 });
  }
}

// Also support GET for simpler triggering
export async function GET() {
  return POST();
}
