/**
 * SMA Tracking API – Manage tracked tickers
 *
 * GET  ?userId=default          → list tracked tickers
 * POST { ticker, userId? }      → add ticker to tracking
 * DELETE ?ticker=X&userId=default → remove ticker from tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTrackedTickers, addTrackedTicker, removeTrackedTicker } from '@/lib/db/sma-tracking';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') ?? 'default';
  const tickers = await getTrackedTickers(userId);
  return NextResponse.json({ success: true, data: tickers });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = body.ticker as string | undefined;
    const userId = (body.userId as string) ?? 'default';

    if (!ticker) {
      return NextResponse.json({ success: false, error: 'ticker is required' }, { status: 400 });
    }

    const updated = await addTrackedTicker(ticker, userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error adding tracked ticker:', error);
    return NextResponse.json({ success: false, error: 'Failed to add ticker' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  const userId = req.nextUrl.searchParams.get('userId') ?? 'default';

  if (!ticker) {
    return NextResponse.json({ success: false, error: 'ticker is required' }, { status: 400 });
  }

  try {
    const updated = await removeTrackedTicker(ticker, userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error removing tracked ticker:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove ticker' }, { status: 500 });
  }
}
