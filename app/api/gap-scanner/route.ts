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

// Common ETF prefixes/suffixes and patterns to exclude
const ETF_PATTERNS = [
  // Major ETFs
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'EMB',
  'VIX', 'UVXY', 'SVXY', 'SQQQ', 'TQQQ', 'UPRO', 'SPXU', 'FAZ', 'FAS',
  // Leveraged/Inverse patterns
  'TQQQ', 'SQQQ', 'UPRO', 'SPXU', 'UDOW', 'SDOW', 'TNA', 'TZA',
  'FAS', 'FAZ', 'LABU', 'LABD', 'SOXL', 'SOXS', 'YINN', 'YANG',
  // Sector ETFs common patterns
  'XL', 'XRT', 'XBI', 'XHB', 'XME', 'XES', 'XOP', 'XLE', 'XLF', 'XLU', 
  'XLI', 'XLB', 'XLK', 'XLP', 'XLY', 'XLC', 'XLRE',
  // Other ETF patterns
  'ARK', 'VT', 'VG', 'VB', 'VO', 'VV', 'VEU', 'VXUS',
];

// Warrant/Unit/Right suffixes
const EXCLUDED_SUFFIXES = ['.WS', '.WSA', '.WSB', '.WT', '+', '^', '=', '/WS', '/WT', '.U', '.UN', '.R', '.RT'];

// Check if symbol is an ETF or derivative
function isETFOrDerivative(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  
  // Check ETF patterns
  if (ETF_PATTERNS.includes(upperSymbol)) return true;
  
  // Check suffixes (warrants, units, rights)
  for (const suffix of EXCLUDED_SUFFIXES) {
    if (upperSymbol.endsWith(suffix)) return true;
  }
  
  // Check for special characters common in non-common-stock tickers
  if (/[\/\^\+\=]/.test(symbol)) return true;
  
  // Check for preferred stock patterns (usually ends with .PR or -P)
  if (/\.PR[A-Z]?$/.test(upperSymbol) || /-P[ABCDEF]?$/.test(upperSymbol)) return true;
  
  // Check for Class B/C shares (BRK.B style, but keep BRK.B as it's liquid)
  if (/\.[BC]$/.test(upperSymbol) && upperSymbol !== 'BRK.B') return true;
  
  return false;
}

// Get the last trading day (handles weekends and holidays simply)
function getLastTradingDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  
  // If Saturday, go back to Friday
  if (day === 6) {
    d.setDate(d.getDate() - 1);
  }
  // If Sunday, go back to Friday
  else if (day === 0) {
    d.setDate(d.getDate() - 2);
  }
  
  return d;
}

// Check if markets are currently closed (weekend)
function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Fetch all stocks from Polygon grouped daily endpoint
async function fetchPolygonGappers(): Promise<{ stocks: GapStock[]; isWeekend: boolean; tradingDate: string; previousDate: string }> {
  const now = new Date();
  const isWeekendDay = isWeekend();
  
  // Get trading dates (handle weekends)
  const todayTrading = getLastTradingDate(now);
  const yesterday = new Date(todayTrading);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayTrading = getLastTradingDate(yesterday);
  
  const todayStr = formatDate(todayTrading);
  const yesterdayStr = formatDate(yesterdayTrading);
  
  try {
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
      return { stocks: [], isWeekend: isWeekendDay, tradingDate: todayStr, previousDate: yesterdayStr };
    }

    const todayData = await todayResponse.json();
    const yesterdayData = await yesterdayResponse.json();
    
    if (todayData.resultsCount === 0 || !todayData.results) {
      console.log('No trading data available');
      return { stocks: [], isWeekend: isWeekendDay, tradingDate: todayStr, previousDate: yesterdayStr };
    }

    // Create map of yesterday's closes
    const yesterdayCloses: Record<string, number> = {};
    if (yesterdayData.results) {
      yesterdayData.results.forEach((result: any) => {
        yesterdayCloses[result.T] = result.c;
      });
    }

    const results: GapStock[] = [];
    let etfsFiltered = 0;
    let lowVolumeFiltered = 0;
    let lowGapFiltered = 0;
    let priceFiltered = 0;
    
    // Process all stocks from today
    for (const result of todayData.results) {
      const symbol = result.T;
      const currentPrice = result.c; // Close price (or current if during market)
      const previousClose = yesterdayCloses[symbol];
      const volume = result.v;
      
      // Skip ETFs and derivatives
      if (isETFOrDerivative(symbol)) {
        etfsFiltered++;
        continue;
      }
      
      // Skip if no previous close data
      if (!previousClose || previousClose === 0) continue;
      
      // Calculate gap from open vs previous close (typical gap calculation)
      const openPrice = result.o;
      const gapPercent = ((openPrice - previousClose) / previousClose) * 100;
      
      // Current price for display (use close if market closed, could use last trade if open)
      const displayPrice = currentPrice || openPrice;
      
      // Apply filters
      if (Math.abs(gapPercent) < 5) {
        lowGapFiltered++;
        continue; // Min 5% gap
      }
      if (volume < 100000) {
        lowVolumeFiltered++;
        continue; // Min 100K volume
      }
      if (displayPrice > 500) {
        priceFiltered++;
        continue; // Max $500 price
      }
      
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

    console.log(`Gap Scan: ${todayData.resultsCount} total tickers, ${etfsFiltered} ETFs filtered, ${lowGapFiltered} low gap, ${lowVolumeFiltered} low volume, ${priceFiltered} high price, ${results.length} results`);

    return { 
      stocks: results, 
      isWeekend: isWeekendDay, 
      tradingDate: todayStr, 
      previousDate: yesterdayStr 
    };
  } catch (error) {
    console.error('Polygon gap scanner error:', error);
    return { stocks: [], isWeekend: isWeekendDay, tradingDate: todayStr, previousDate: yesterdayStr };
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
    const { stocks, isWeekend: weekendFlag, tradingDate, previousDate } = await fetchPolygonGappers();
    
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
      isWeekend: weekendFlag,
      tradingDate,
      previousDate,
      marketStatus: weekendFlag ? 'closed' : 'open',
      nextMarketOpen: weekendFlag ? 'Monday 4:00 AM EST' : null,
      filters: {
        minGapPercent: 5,
        minVolume: 100000,
        maxPrice: 500,
        excludeETFs: true,
        excludeWarrants: true
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
      isWeekend: isWeekend(),
      marketStatus: isWeekend() ? 'closed' : 'unknown',
      nextMarketOpen: isWeekend() ? 'Monday 4:00 AM EST' : null,
      error: 'Failed to fetch live data',
      filters: {
        minGapPercent: 5,
        minVolume: 100000,
        maxPrice: 500,
        excludeETFs: true,
        excludeWarrants: true
      }
    });
  }
}
