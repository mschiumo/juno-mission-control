/**
 * Premarket Data API for Individual Stocks
 * 
 * GET /api/premarket?symbol={ticker}
 * Returns premarket price, change, and percent change
 */

import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

interface PremarketData {
  symbol: string;
  name: string;
  premarketPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  status: 'up' | 'down' | 'unchanged';
  marketSession: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  timestamp: string;
}

// Stock name mappings (extend as needed)
const stockNames: Record<string, string> = {
  'SPY': 'S&P 500 ETF',
  'QQQ': 'NASDAQ ETF',
  'TSLA': 'Tesla Inc.',
  'META': 'Meta Platforms',
  'NVDA': 'NVIDIA',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com',
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft',
  'PLTR': 'Palantir',
  'AMD': 'AMD',
  'INTC': 'Intel',
  'NFLX': 'Netflix',
  'CRM': 'Salesforce',
  'BA': 'Boeing',
  'DIS': 'Disney',
  'JPM': 'JPMorgan Chase',
  'V': 'Visa',
  'MA': 'Mastercard',
};

function getMarketSession(): 'pre-market' | 'market-open' | 'post-market' | 'closed' {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = estTime.getHours();
  const minute = estTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Pre-market: 4:00 AM (240 min) to 9:30 AM (570 min)
  if (timeInMinutes >= 240 && timeInMinutes < 570) {
    return 'pre-market';
  }
  
  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
  if (timeInMinutes >= 570 && timeInMinutes < 960) {
    return 'market-open';
  }
  
  // Post-market: 4:00 PM (960 min) to 8:00 PM (1200 min)
  if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    return 'post-market';
  }
  
  return 'closed';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }

    if (!FINNHUB_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'FINNHUB_API_KEY not configured' },
        { status: 500 }
      );
    }

    const ticker = symbol.toUpperCase();
    const marketSession = getMarketSession();

    // Fetch quote from Finnhub
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 60 } } // Cache for 1 minute
    );

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Finnhub returns: c (current), d (change), dp (change percent), pc (previous close), v (volume)
    const currentPrice = data.c || 0;
    const previousClose = data.pc || 0;
    const change = data.d || 0;
    const changePercent = data.dp || 0;
    const volume = data.v || 0;

    if (currentPrice === 0) {
      return NextResponse.json(
        { success: false, error: `No data available for ${ticker}` },
        { status: 404 }
      );
    }

    const result: PremarketData = {
      symbol: ticker,
      name: stockNames[ticker] || ticker,
      premarketPrice: Number(currentPrice.toFixed(2)),
      previousClose: Number(previousClose.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      volume: volume,
      status: change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged',
      marketSession,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Error fetching premarket data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch premarket data'
      },
      { status: 500 }
    );
  }
}
