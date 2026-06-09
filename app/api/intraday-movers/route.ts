/**
 * Intraday Movers Scanner
 *
 * GET /api/intraday-movers
 * Finds stocks that have moved more than `minMove`% over a rolling intraday
 * window (default 2h). Mid-day momentum complement to /api/gap-scanner-polygon.
 *
 * Accepts the same filter param names as the gap scanner (minGap is treated as
 * an alias of minMove) so the shared card can call it without reserializing.
 */

import { NextResponse } from 'next/server';
import { runIntradayScan } from '@/lib/intraday-movers';

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const minMovePercent = parseFloat(searchParams.get('minMove') ?? searchParams.get('minGap') ?? '5');
  const minVolume = parseInt(searchParams.get('minVolume') ?? '1000000', 10);
  const minMarketCap = parseInt(searchParams.get('minMarketCap') ?? '50000000', 10);
  const minPrice = parseFloat(searchParams.get('minPrice') ?? '1');
  const maxPrice = parseFloat(searchParams.get('maxPrice') ?? '1000');
  const windowHours = parseFloat(searchParams.get('windowHours') ?? '2');

  try {
    const result = await runIntradayScan({
      minMovePercent,
      minVolume,
      minMarketCap,
      minPrice,
      maxPrice,
      windowHours,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[IntradayMovers] Error:', error);
    return NextResponse.json(
      {
        success: false,
        data: { gainers: [], losers: [] },
        error: error instanceof Error ? error.message : 'Failed to scan intraday movers',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
