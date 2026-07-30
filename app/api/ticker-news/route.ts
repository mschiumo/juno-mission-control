/**
 * GET /api/ticker-news?symbol=AAPL
 *
 * Thin wrapper around Finnhub's company-news endpoint (reuses FINNHUB_API_KEY,
 * already used by the market-news screener). Returns recent headlines for a
 * single ticker for the long-term Performance view. Degrades gracefully to an
 * empty list when no key is configured or the upstream call fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

interface TickerNewsItem {
  headline: string;
  url: string;
  source: string;
  datetime: number; // unix seconds
  summary: string;
}

interface FinnhubNewsItem {
  headline?: string;
  url?: string;
  source?: string;
  datetime?: number;
  summary?: string;
}

// 5-minute in-memory cache keyed by symbol — company news changes slowly and
// the free Finnhub tier is rate-limited (60/min).
const newsCache = new Map<string, { items: TickerNewsItem[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ITEMS = 20;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol || !/^[A-Z.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 });
  }

  const cached = newsCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, items: cached.items });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: true, items: [] });
  }

  const to = new Date();
  const from = new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${ymd(from)}&to=${ymd(to)}&token=${apiKey}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      return NextResponse.json({ success: true, items: [] });
    }
    const raw = (await res.json()) as FinnhubNewsItem[];
    const items: TickerNewsItem[] = (Array.isArray(raw) ? raw : [])
      .filter((n) => n.headline && n.url)
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
      .slice(0, MAX_ITEMS)
      .map((n) => ({
        headline: n.headline!,
        url: n.url!,
        source: n.source ?? '',
        datetime: n.datetime ?? 0,
        summary: n.summary ?? '',
      }));

    newsCache.set(symbol, { items, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('Ticker news error:', error);
    return NextResponse.json({ success: true, items: [] });
  }
}
