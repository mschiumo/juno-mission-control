/**
 * Gap Scanner using Yahoo Finance screener
 *
 * GET /api/gap-scanner-yahoo
 * Uses Yahoo Finance's pre-computed day gainers/losers screener.
 * No API key required — works as a reliable fallback when Polygon is unavailable.
 */

import { NextResponse } from 'next/server';

interface YahooQuote {
  symbol: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap?: number;
}

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

// Market session helpers (all times in ET)
function getMarketSession(): {
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketStatus: 'open' | 'closed';
  isPreMarket: boolean;
} {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const timeInMinutes = etTime.getHours() * 60 + etTime.getMinutes();
  const isWeekend = day === 0 || day === 6;

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' });

  const prevDate = new Date(etTime);
  prevDate.setDate(prevDate.getDate() - 1);
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6) prevDate.setDate(prevDate.getDate() - 1);

  const tradingDate = new Date(etTime);
  while (tradingDate.getDay() === 0 || tradingDate.getDay() === 6) tradingDate.setDate(tradingDate.getDate() - 1);

  let session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  if (isWeekend) {
    session = 'closed';
  } else if (timeInMinutes >= 4 * 60 && timeInMinutes < 9 * 60 + 30) {
    session = 'pre-market';
  } else if (timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60) {
    session = 'market-open';
  } else if (timeInMinutes >= 16 * 60 && timeInMinutes < 20 * 60) {
    session = 'post-market';
  } else {
    session = 'closed';
  }

  return {
    session,
    isWeekend,
    tradingDate: fmt(tradingDate),
    previousDate: fmt(prevDate),
    marketStatus: session === 'market-open' ? 'open' : 'closed',
    isPreMarket: session === 'pre-market',
  };
}

async function fetchScreener(scrId: 'day_gainers' | 'day_losers', count: number): Promise<YahooQuote[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${scrId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Yahoo Finance screener error: ${res.status}`);
  const data = await res.json();
  return (data?.finance?.result?.[0]?.quotes ?? []) as YahooQuote[];
}

function toGapStock(q: YahooQuote, status: 'gainer' | 'loser'): GapStock {
  return {
    symbol: q.symbol,
    name: q.longName || q.shortName || q.symbol,
    price: q.regularMarketPrice,
    previousClose: q.regularMarketPreviousClose,
    gapPercent: Number(q.regularMarketChangePercent.toFixed(2)),
    volume: q.regularMarketVolume,
    marketCap: q.marketCap ?? 0,
    status,
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get('count') || '20', 10);
  const marketInfo = getMarketSession();

  try {
    const [gainersRaw, losersRaw] = await Promise.all([
      fetchScreener('day_gainers', count),
      fetchScreener('day_losers', count),
    ]);

    const gainers = gainersRaw.map((q) => toGapStock(q, 'gainer'));
    const losers = losersRaw.map((q) => toGapStock(q, 'loser'));

    return NextResponse.json({
      success: true,
      data: { gainers, losers },
      timestamp: new Date().toISOString(),
      source: 'yahoo',
      scanned: gainers.length + losers.length,
      found: gainers.length + losers.length,
      durationMs: Date.now() - startTime,
      isWeekend: marketInfo.isWeekend,
      tradingDate: marketInfo.tradingDate,
      previousDate: marketInfo.previousDate,
      marketSession: marketInfo.session,
      marketStatus: marketInfo.marketStatus,
      isPreMarket: marketInfo.isPreMarket,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch Yahoo Finance data',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      isWeekend: marketInfo.isWeekend,
      tradingDate: marketInfo.tradingDate,
      previousDate: marketInfo.previousDate,
      marketSession: marketInfo.session,
      marketStatus: marketInfo.marketStatus,
      isPreMarket: marketInfo.isPreMarket,
    }, { status: 500 });
  }
}
