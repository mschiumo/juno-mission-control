import { NextRequest, NextResponse } from 'next/server';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

async function fetchYahooQuote(symbol: string): Promise<MarketItem | null> {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result?.meta) return null;
    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    if (price <= 0) return null;
    return {
      symbol: meta.symbol || symbol,
      name: meta.longName || meta.shortName || symbol,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      status: change >= 0 ? 'up' : 'down',
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const symbol = new URL(request.url).searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ success: false, error: 'Missing symbol' }, { status: 400 });
  }
  const item = await fetchYahooQuote(symbol.toUpperCase());
  if (!item) {
    return NextResponse.json({ success: false, error: `No data found for "${symbol}"` }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: item });
}
