/**
 * Live quotes for proposal review (owner-only, READ-ONLY).
 *
 * The agent screens on settled closes (by design — see the technicals
 * provider), so by review time the market may have drifted from the numbers
 * the proposal was built on. This endpoint gives the review UI the live last
 * trade so the owner can see the gap before approving.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';

export const dynamic = 'force-dynamic';

interface RhQuoteEntry {
  quote?: {
    symbol?: string;
    last_trade_price?: string;
    venue_last_trade_time?: string;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  const raw = request.nextUrl.searchParams.get('symbols') || '';
  const symbols = [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 20);
  if (symbols.length === 0) {
    return NextResponse.json({ success: true, quotes: {} });
  }
  if (!isRobinhoodConfigured()) {
    return NextResponse.json({ success: true, quotes: {}, reason: 'Robinhood is not configured on the server.' });
  }

  try {
    const res = await callRobinhoodTool<{ data?: { results?: RhQuoteEntry[] } }>(
      'get_equity_quotes',
      { symbols },
      { retries: 2 }, // read-only — retries are safe
    );
    const quotes: Record<string, { last: number; asOf?: string }> = {};
    for (const entry of res?.data?.results ?? []) {
      const symbol = entry.quote?.symbol?.toUpperCase();
      const last = Number(entry.quote?.last_trade_price);
      if (symbol && Number.isFinite(last)) {
        quotes[symbol] = { last, asOf: entry.quote?.venue_last_trade_time };
      }
    }
    return NextResponse.json({ success: true, quotes });
  } catch (err) {
    // Quotes are advisory for review — degrade to "no quote" rather than
    // breaking the proposals view.
    const message = err instanceof Error ? err.message : 'Quote lookup failed';
    return NextResponse.json({ success: true, quotes: {}, reason: message });
  }
}
