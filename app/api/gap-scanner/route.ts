import { NextResponse } from 'next/server';
import { refreshStockUniverse } from '@/lib/stock-universe';
import { runGapScan, getCachedResults, ScanResult } from '@/lib/gap-scanner-core';

// Allow up to 300s for full stock universe scan (App Router maxDuration)
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const dryRun = searchParams.get('dryRun') === 'true';
  const limit = parseInt(searchParams.get('limit') || '0', 10) || undefined;
  const forceRefresh = searchParams.get('refresh') === 'true';
  const useCache = searchParams.get('cache') !== 'false';
  const minGapPercent = parseFloat(searchParams.get('minGap') || '5');

  try {
    if (forceRefresh) {
      console.log('[GapScanner] Refreshing stock universe...');
      await refreshStockUniverse();
    }

    // Return cache immediately if available and not bypassed
    if (useCache && !forceRefresh && !dryRun) {
      const today = new Date().toISOString().split('T')[0];
      const cached = await getCachedResults(today);
      if (cached) {
        console.log('[GapScanner] Returning cached results');
        return NextResponse.json({ ...cached, source: 'cache' });
      }
    }

    const result = await runGapScan({ minGapPercent, limit, useCache: false, forceRefresh, dryRun });
    return NextResponse.json(result);

  } catch (error) {
    console.error('[GapScanner] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch gap data',
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body.action === 'refresh-universe') {
    const result = await refreshStockUniverse();
    return NextResponse.json(result);
  }
  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
