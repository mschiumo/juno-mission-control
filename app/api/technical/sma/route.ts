/**
 * Technical Indicators API
 * 
 * GET /api/technical/sma?symbol={ticker}&period={20|200}
 * Returns simple moving average for given period
 */

import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

interface SMAData {
  symbol: string;
  period: number;
  sma: number;
  currentPrice: number;
  status: 'above' | 'below' | 'at';
  timestamp: string;
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const period = parseInt(searchParams.get('period') || '20', 10);

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }

    if (![20, 50, 200].includes(period)) {
      return NextResponse.json(
        { success: false, error: 'Period must be 20, 50, or 200' },
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
    const now = Math.floor(Date.now() / 1000);
    const from = now - (period + 10) * 24 * 60 * 60; // Get extra days for SMA calculation

    // Fetch candle data from Finnhub
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.s === 'no_data') {
      return NextResponse.json(
        { success: false, error: `No data available for ${ticker}` },
        { status: 404 }
      );
    }

    // Extract closing prices
    const closes = data.c || [];
    if (closes.length < period) {
      return NextResponse.json(
        { success: false, error: `Not enough data for ${period}-day SMA` },
        { status: 400 }
      );
    }

    const sma = calculateSMA(closes, period);
    const currentPrice = closes[closes.length - 1];
    
    let status: 'above' | 'below' | 'at';
    if (currentPrice > sma * 1.01) status = 'above';
    else if (currentPrice < sma * 0.99) status = 'below';
    else status = 'at';

    const result: SMAData = {
      symbol: ticker,
      period,
      sma: Number(sma.toFixed(2)),
      currentPrice: Number(currentPrice.toFixed(2)),
      status,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Error calculating SMA:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to calculate SMA'
      },
      { status: 500 }
    );
  }
}
