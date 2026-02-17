import { NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

async function fetchPolygonData(ticker: string): Promise<MarketData | null> {
  try {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${POLYGON_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Polygon API error for ${ticker}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    const result = data.results[0];
    const prevClose = result.c; // Previous day close
    
    // For spot prices (like GLD), we need current data
    // Since /prev gives us yesterday's close, let's use the ticker details for current
    const detailsResponse = await fetch(
      `https://api.polygon.io/v3/snapshot?ticker.any_of=${ticker}&apiKey=${POLYGON_API_KEY}`
    );
    
    let currentPrice = prevClose;
    let change = 0;
    let changePercent = 0;
    
    if (detailsResponse.ok) {
      const details = await detailsResponse.json();
      if (details.results && details.results.length > 0) {
        const snapshot = details.results[0];
        currentPrice = snapshot.session?.price || prevClose;
        change = snapshot.session?.change || 0;
        changePercent = snapshot.session?.change_percent || 0;
      }
    }
    
    return {
      symbol: ticker,
      price: currentPrice,
      change,
      changePercent
    };
  } catch (error) {
    console.error(`Error fetching ${ticker}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    if (!POLYGON_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured'
      }, { status: 500 });
    }

    // Fetch key market data
    const [spy, qqq, gld, slv, btc] = await Promise.all([
      fetchPolygonData('SPY'),   // S&P 500 ETF
      fetchPolygonData('QQQ'),   // Nasdaq ETF
      fetchPolygonData('GLD'),   // Gold ETF
      fetchPolygonData('SLV'),   // Silver ETF
      fetchPolygonData('BTC'),   // Bitcoin (if available)
    ]);

    const data = {
      indices: {
        sp500: spy,
        nasdaq: qqq,
      },
      commodities: {
        gold: gld,
        silver: slv,
      },
      crypto: {
        bitcoin: btc,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Market data fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch market data'
    }, { status: 500 });
  }
}