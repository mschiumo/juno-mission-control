/**
 * SMA Tracking Data API
 *
 * GET ?tickers=AAPL,TSLA  → fetch SMA data + signals for the given tickers
 *
 * Computes 20 & 200 period SMAs on 1min, 5min, 15min timeframes using
 * Polygon aggregate candle data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeTickerSmaData } from '@/lib/sma-calculator';
import type { TickerSmaData } from '@/types/sma-tracking';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ success: true, data: {} });
  }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'POLYGON_API_KEY not configured' },
      { status: 500 },
    );
  }

  try {
    const results = await Promise.all(
      tickers.map(ticker => computeTickerSmaData(ticker, apiKey)),
    );

    const data: Record<string, TickerSmaData> = {};
    for (const r of results) {
      data[r.ticker] = r;
    }

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error computing SMA data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compute SMA data' },
      { status: 500 },
    );
  }
}
