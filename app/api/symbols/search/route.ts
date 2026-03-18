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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 1) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    if (!FINNHUB_API_KEY) {
      // Fallback: return empty array if no API key
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
        error: 'FINNHUB_API_KEY not configured',
      });
    }

    // Call Finnhub symbol search API
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data: FinnhubSearchResult = await response.json();

    // Filter and format results
    const formatted = data.result
      ?.filter(item => {
        // Only include stocks and ETFs, exclude OTC/pink sheets
        const isStockOrETF = item.type === 'Common Stock' || item.type === 'ETP' || item.type === 'ETF';
        const isNotOTC = !item.symbol.includes('.') && !item.symbol.includes(':');
        return isStockOrETF && isNotOTC;
      })
      .slice(0, 10) // Limit to 10 results
      .map(item => ({
        symbol: item.symbol,
        displaySymbol: item.displaySymbol,
        name: item.description,
        type: item.type,
      }));

    return NextResponse.json({
      success: true,
      data: formatted || [],
      count: formatted?.length || 0,
    });

  } catch (error) {
    console.error('Error searching symbols:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to search symbols',
        data: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
