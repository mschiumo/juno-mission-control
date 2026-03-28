import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 2-second in-memory cache — deduplicates burst REST polling from multiple users
const priceCache = new Map<string, { price: number; expiresAt: number }>();
const CACHE_TTL_MS = 2000;

async function fetchPolygonPrice(symbol: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/last/trade/${encodeURIComponent(symbol)}?apiKey=${apiKey}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.p ? Number(data.results.p.toFixed(4)) : null;
  } catch {
    return null;
  }
}

async function fetchFinnhubPrice(symbol: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.c > 0 ? Number(data.c.toFixed(4)) : null;
  } catch {
    return null;
  }
}

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? Number(price.toFixed(4)) : null;
  } catch {
    return null;
  }
}

// Polygon → Finnhub → Yahoo fallback chain
async function fetchPrice(symbol: string): Promise<number | null> {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (polygonKey) {
    const price = await fetchPolygonPrice(symbol, polygonKey);
    if (price !== null) return price;
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    const price = await fetchFinnhubPrice(symbol, finnhubKey);
    if (price !== null) return price;
  }

  return fetchYahooPrice(symbol);
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ prices: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const cached = priceCache.get(symbol);
      if (cached && cached.expiresAt > Date.now()) {
        return [symbol, cached.price] as const;
      }
      const price = await fetchPrice(symbol);
      if (price !== null) {
        priceCache.set(symbol, { price, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return [symbol, price] as const;
    })
  );

  const prices = Object.fromEntries(
    entries.filter(([, price]) => price !== null)
  ) as Record<string, number>;

  return NextResponse.json({ prices }, { headers: { 'Cache-Control': 'no-store' } });
}
