import { NextResponse } from 'next/server';

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

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

// Fetch all stocks from Polygon grouped daily endpoint
async function fetchPolygonGappers(): Promise<GapStock[]> {
  try {
    // Get yesterday's date for previous close data
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format dates as YYYY-MM-DD
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Fetch today's data (or most recent trading day)
    const todayResponse = await fetch(
      `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${todayStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 60 } }
    );
    
    // Fetch yesterday's data for previous close
    const yesterdayResponse = await fetch(
      `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${yesterdayStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!todayResponse.ok || !yesterdayResponse.ok) {
      console.error('Polygon API error:', todayResponse.status, yesterdayResponse.status);
      return [];
    }

    const todayData = await todayResponse.json();
    const yesterdayData = await yesterdayResponse.json();
    
    if (todayData.resultsCount === 0 || !todayData.results) {
      console.log('No trading data for today, using previous day');
      return [];
    }

    // Create map of yesterday's closes
    const yesterdayCloses: Record<string, number> = {};
    if (yesterdayData.results) {
      yesterdayData.results.forEach((result: any) => {
        yesterdayCloses[result.T] = result.c;
      });
    }

    const results: GapStock[] = [];
    
    // Process all stocks from today
    for (const result of todayData.results) {
      const symbol = result.T;
      const currentPrice = result.c; // Close price (or current if during market)
      const previousClose = yesterdayCloses[symbol];
      const volume = result.v;
      
      // Skip if no previous close data
      if (!previousClose || previousClose === 0) continue;
      
      // Calculate gap from open vs previous close (typical gap calculation)
      const openPrice = result.o;
      const gapPercent = ((openPrice - previousClose) / previousClose) * 100;
      
      // Current price for display (use close if market closed, could use last trade if open)
      const displayPrice = currentPrice || openPrice;
      
      // Apply filters
      if (Math.abs(gapPercent) < 5) continue; // Min 5% gap
      if (volume < 100000) continue; // Min 100K volume
      if (displayPrice > 500) continue; // Max $500 price
      
      // Polygon doesn't provide market cap, so we'll skip that filter or estimate
      // Most stocks in Polygon are US equities with reasonable market caps
      
      results.push({
        symbol,
        name: symbol, // Polygon grouped endpoint doesn't include company names
        price: displayPrice,
        previousClose,
        gapPercent: Number(gapPercent.toFixed(2)),
        volume,
        marketCap: 0, // Not available in grouped endpoint
        status: gapPercent > 0 ? 'gainer' : 'loser'
      });
    }

    return results;
  } catch (error) {
    console.error('Polygon gap scanner error:', error);
    return [];
  }
}

// Mock data for when API fails
function getMockGapData(): GapStock[] {
  return [
    { symbol: 'MARA', name: 'Marathon Digital', price: 18.45, previousClose: 14.20, gapPercent: 29.93, volume: 45000000, marketCap: 3200000000, status: 'gainer' },
    { symbol: 'RIOT', name: 'Riot Platforms', price: 12.30, previousClose: 9.85, gapPercent: 24.87, volume: 28000000, marketCap: 2100000000, status: 'gainer' },
    { symbol: 'COIN', name: 'Coinbase Global', price: 245.60, previousClose: 198.40, gapPercent: 23.79, volume: 15200000, marketCap: 58500000000, status: 'gainer' },
    { symbol: 'CVNA', name: 'Carvana Co.', price: 185.25, previousClose: 152.80, gapPercent: 21.24, volume: 3200000, marketCap: 12500000000, status: 'gainer' },
    { symbol: 'SOFI', name: 'SoFi Technologies', price: 8.95, previousClose: 7.42, gapPercent: 20.62, volume: 28500000, marketCap: 8700000000, status: 'gainer' },
    { symbol: 'PLTR', name: 'Palantir Technologies', price: 68.40, previousClose: 84.48, gapPercent: -19.03, volume: 65000000, marketCap: 152000000000, status: 'loser' },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 288.20, previousClose: 355.84, gapPercent: -19.01, volume: 52000000, marketCap: 915000000000, status: 'loser' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 112.15, previousClose: 138.25, gapPercent: -18.88, volume: 48000000, marketCap: 2750000000000, status: 'loser' },
    { symbol: 'AMD', name: 'Advanced Micro Devices', price: 98.50, previousClose: 118.75, gapPercent: -17.06, volume: 35000000, marketCap: 159000000000, status: 'loser' },
    { symbol: 'NIO', name: 'NIO Inc.', price: 3.85, previousClose: 4.52, gapPercent: -14.82, volume: 42000000, marketCap: 8100000000, status: 'loser' }
  ];
}

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    const stocks = await fetchPolygonGappers();
    
    // Sort and filter
    const gainers = stocks
      .filter(s => s.status === 'gainer')
      .sort((a, b) => b.gapPercent - a.gapPercent)
      .slice(0, 10);
    
    const losers = stocks
      .filter(s => s.status === 'loser')
      .sort((a, b) => a.gapPercent - b.gapPercent)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: { gainers, losers },
      timestamp,
      source: 'live',
      scanned: stocks.length,
      found: stocks.length,
      filters: {
        minGapPercent: 5,
        minVolume: 100000,
        maxPrice: 500
      }
    });

  } catch (error) {
    console.error('Gap scanner API error:', error);
    
    // Return mock data on error
    const mockData = getMockGapData();
    return NextResponse.json({
      success: true,
      data: {
        gainers: mockData.filter(s => s.status === 'gainer'),
        losers: mockData.filter(s => s.status === 'loser')
      },
      timestamp,
      source: 'fallback',
      scanned: 0,
      found: 0,
      error: 'Failed to fetch live data',
      filters: {
        minGapPercent: 5,
        minVolume: 100000,
        maxPrice: 500
      }
    });
  }
}
