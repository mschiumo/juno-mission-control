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

// Yahoo Finance fetch for pre-market data
async function fetchYahooGappers(): Promise<GapStock[]> {
  try {
    // Fetch active stocks with high volume
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/^GSPC,^IXIC,^DJI?interval=1d&range=1d',
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        next: { revalidate: 60 }
      }
    );

    // For actual gap scanning, we'll use a predefined list of high-volume stocks
    // and check their pre-market data
    const highVolumeStocks = [
      'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'AMD', 'PLTR', 'COIN',
      'NIO', 'BABA', 'UBER', 'PYPL', 'SQ', 'HOOD', 'SOFI', 'LCID', 'RIVN', 'MARA',
      'RIOT', 'CVNA', 'GME', 'AMC', 'BB', 'NOK', 'TLRY', 'SNDL', 'F', 'GM',
      'XOM', 'CVX', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'AXP',
      'JNJ', 'PFE', 'MRNA', 'BNTX', 'AZN', 'NVO', 'UNH', 'ABBV', 'LLY', 'TMO'
    ];

    const results: GapStock[] = [];

    // Fetch in batches of 10 to avoid rate limits
    for (let i = 0; i < highVolumeStocks.length; i += 10) {
      const batch = highVolumeStocks.slice(i, i + 10);
      const batchPromises = batch.map(symbol => fetchStockGap(symbol));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((s): s is GapStock => s !== null));
      
      // Small delay between batches
      if (i + 10 < highVolumeStocks.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return results;
  } catch (error) {
    console.error('Gap scanner error:', error);
    return [];
  }
}

async function fetchStockGap(symbol: string): Promise<GapStock | null> {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        next: { revalidate: 60 }
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const currentPrice = meta.regularMarketPrice || previousClose;
    
    if (!previousClose || previousClose === 0) return null;

    const gapPercent = ((currentPrice - previousClose) / previousClose) * 100;
    
    // Only include stocks with 10%+ gaps
    if (Math.abs(gapPercent) < 10) return null;

    const volume = meta.regularMarketVolume || 0;
    const marketCap = calculateMarketCap(meta);

    // Filters
    if (volume < 100000) return null; // Min 100K volume
    if (marketCap < 100000000) return null; // Min $100M market cap
    if (currentPrice > 500) return null; // Max $500 price

    return {
      symbol,
      name: meta.shortName || meta.longName || symbol,
      price: currentPrice,
      previousClose,
      gapPercent: Number(gapPercent.toFixed(2)),
      volume,
      marketCap,
      status: gapPercent > 0 ? 'gainer' : 'loser'
    };
  } catch (error) {
    return null;
  }
}

function calculateMarketCap(meta: any): number {
  // If market cap is available, use it
  if (meta.marketCap) return meta.marketCap;
  
  // Otherwise estimate from price * shares outstanding (if available)
  if (meta.sharesOutstanding && meta.regularMarketPrice) {
    return meta.sharesOutstanding * meta.regularMarketPrice;
  }
  
  return 0;
}

// Mock data for when API fails
function getMockGapData(): GapStock[] {
  return [
    // Gainers
    { symbol: 'MARA', name: 'Marathon Digital', price: 18.45, previousClose: 14.20, gapPercent: 29.93, volume: 45000000, marketCap: 3200000000, status: 'gainer' },
    { symbol: 'RIOT', name: 'Riot Platforms', price: 12.30, previousClose: 9.85, gapPercent: 24.87, volume: 28000000, marketCap: 2100000000, status: 'gainer' },
    { symbol: 'COIN', name: 'Coinbase Global', price: 245.60, previousClose: 198.40, gapPercent: 23.79, volume: 15200000, marketCap: 58500000000, status: 'gainer' },
    { symbol: 'CVNA', name: 'Carvana Co.', price: 185.25, previousClose: 152.80, gapPercent: 21.24, volume: 3200000, marketCap: 12500000000, status: 'gainer' },
    { symbol: 'SOFI', name: 'SoFi Technologies', price: 8.95, previousClose: 7.42, gapPercent: 20.62, volume: 28500000, marketCap: 8700000000, status: 'gainer' },
    // Losers
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
    const stocks = await fetchYahooGappers();
    
    // Sort and filter
    const gainers = stocks
      .filter(s => s.status === 'gainer')
      .sort((a, b) => b.gapPercent - a.gapPercent)
      .slice(0, 5);
    
    const losers = stocks
      .filter(s => s.status === 'loser')
      .sort((a, b) => a.gapPercent - b.gapPercent)
      .slice(0, 5);

    const hasRealData = stocks.length > 0;
    const result = hasRealData ? { gainers, losers } : { 
      gainers: getMockGapData().filter(s => s.status === 'gainer'),
      losers: getMockGapData().filter(s => s.status === 'loser')
    };

    return NextResponse.json({
      success: true,
      data: result,
      timestamp,
      source: hasRealData ? 'live' : 'mock',
      filters: {
        minGapPercent: 10,
        minVolume: 100000,
        minMarketCap: 100000000,
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
      filters: {
        minGapPercent: 10,
        minVolume: 100000,
        minMarketCap: 100000000,
        maxPrice: 500
      }
    });
  }
}
