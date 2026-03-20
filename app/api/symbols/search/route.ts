/**
 * Symbol Search API
 * 
 * GET /api/symbols/search?q={query}
 * Returns matching stock symbols from Finnhub
 */

import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

interface FinnhubSearchResult {
  count: number;
  result: Array<{
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }>;
}

async function searchCrypto(query: string) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 300 } }
  );
  if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`);
  const data = await response.json();
  return (data.coins as Array<{ id: string; symbol: string; name: string }> || [])
    .slice(0, 10)
    .map(coin => ({
      symbol: `${coin.symbol.toUpperCase()}-USD`,
      displaySymbol: coin.symbol.toUpperCase(),
      name: coin.name,
      type: 'Crypto',
    }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const type = searchParams.get('type');

    if (!query || query.length < 1) {
      return NextResponse.json({ success: true, data: [], count: 0 });
    }

    // Crypto search — use CoinGecko (no API key needed)
    if (type === 'crypto') {
      const data = await searchCrypto(query);
      return NextResponse.json({ success: true, data, count: data.length });
    }

    if (!FINNHUB_API_KEY) {
      return NextResponse.json({ success: true, data: [], count: 0, error: 'FINNHUB_API_KEY not configured' });
    }

    // Stock/ETF search — use Finnhub
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 300 } }
    );
    if (!response.ok) throw new Error(`Finnhub API error: ${response.status}`);

    const data: FinnhubSearchResult = await response.json();
    const formatted = data.result
      ?.filter(item => {
        const isStockOrETF = item.type === 'Common Stock' || item.type === 'ETP' || item.type === 'ETF';
        const isNotOTC = !item.symbol.includes('.') && !item.symbol.includes(':');
        return isStockOrETF && isNotOTC;
      })
      .slice(0, 10)
      .map(item => ({
        symbol: item.symbol,
        displaySymbol: item.displaySymbol,
        name: item.description,
        type: item.type,
      }));

    return NextResponse.json({ success: true, data: formatted || [], count: formatted?.length || 0 });

  } catch (error) {
    console.error('Error searching symbols:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to search symbols', data: [], count: 0 },
      { status: 500 }
    );
  }
}
