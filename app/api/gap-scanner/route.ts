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

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd6802j9r01qobepji5i0d6802j9r01qobepji5ig';

// High-volume stocks to scan
const SCAN_SYMBOLS = [
  'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'AMD', 'PLTR', 'COIN',
  'NIO', 'BABA', 'UBER', 'PYPL', 'SQ', 'HOOD', 'SOFI', 'LCID', 'RIVN', 'MARA',
  'RIOT', 'CVNA', 'GME', 'AMC', 'BB', 'NOK', 'TLRY', 'SNDL', 'F', 'GM',
  'XOM', 'CVX', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'AXP',
  'JNJ', 'PFE', 'MRNA', 'BNTX', 'AZN', 'NVO', 'UNH', 'ABBV', 'LLY', 'TMO'
];

// Fetch quote from Finnhub
async function fetchFinnhubQuote(
  symbol: string, 
  debug?: { symbol: string; gapPercent: number; filtered: string; reason?: string }[]
): Promise<GapStock | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 60 } }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`Rate limit hit for ${symbol}`);
      }
      debug?.push({ symbol, gapPercent: 0, filtered: 'yes', reason: 'API error' });
      return null;
    }

    const data = await response.json();
    
    // Finnhub quote response:
    // { c: current price, d: change, dp: change percent, h: high, l: low, o: open, pc: previous close, t: timestamp }
    const currentPrice = data.c;
    const previousClose = data.pc;
    
    if (!currentPrice || !previousClose || previousClose === 0) {
      debug?.push({ symbol, gapPercent: 0, filtered: 'yes', reason: 'No price data' });
      return null;
    }

    const gapPercent = ((currentPrice - previousClose) / previousClose) * 100;
    
    // Only include stocks with 5%+ gaps (lowered from 10% for weekend testing)
    if (Math.abs(gapPercent) < 5) {
      debug?.push({ symbol, gapPercent: Number(gapPercent.toFixed(2)), filtered: 'yes', reason: 'Gap < 5%' });
      return null;
    }

    // Fetch profile for market cap and company name
    const profile = await fetchFinnhubProfile(symbol);
    
    const volume = data.v || 0; // Volume from quote (if available)
    const marketCap = profile?.marketCapitalization || 0;
    
    // Apply filters
    // Note: Finnhub basic quote doesn't include volume, so we skip volume filter if not available
    // Market cap: allow if unknown (0) or >= $100M (Finnhub returns in millions, so 100 = $100M)
    if (marketCap > 0 && marketCap < 100) {
      debug?.push({ symbol, gapPercent: Number(gapPercent.toFixed(2)), filtered: 'yes', reason: `Market cap too small: ${marketCap}M` });
      return null; // Only filter if we have data and it's too small
    }
    if (currentPrice > 500) {
      debug?.push({ symbol, gapPercent: Number(gapPercent.toFixed(2)), filtered: 'yes', reason: `Price too high: ${currentPrice}` });
      return null; // Max $500 price
    }
    
    // Volume filter: skip if not available, otherwise require 100K+
    if (volume > 0 && volume < 100000) {
      debug?.push({ symbol, gapPercent: Number(gapPercent.toFixed(2)), filtered: 'yes', reason: `Volume too low: ${volume}` });
      return null;
    }
    
    debug?.push({ symbol, gapPercent: Number(gapPercent.toFixed(2)), filtered: 'no' });

    return {
      symbol,
      name: profile?.name || symbol,
      price: currentPrice,
      previousClose,
      gapPercent: Number(gapPercent.toFixed(2)),
      volume: volume,
      marketCap: marketCap * 1000000, // Convert to actual value
      status: gapPercent > 0 ? 'gainer' : 'loser'
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    debug?.push({ symbol, gapPercent: 0, filtered: 'yes', reason: 'Exception' });
    return null;
  }
}

// Fetch company profile for name and market cap
async function fetchFinnhubProfile(symbol: string): Promise<{ name: string; marketCapitalization: number } | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      name: data.name || symbol,
      marketCapitalization: data.marketCapitalization || 0
    };
  } catch (error) {
    return null;
  }
}

// Scan all symbols with rate limiting
async function scanWithFinnhub(): Promise<GapStock[]> {
  const results: GapStock[] = [];
  const debug: { symbol: string; gapPercent: number; filtered: string; reason?: string }[] = [];
  
  // Finnhub free tier: 60 calls/minute
  // We need 2 calls per symbol (quote + profile), so ~30 symbols max per minute
  // But we can batch profile calls since they're cached
  
  // First, fetch all quotes (1 call per symbol)
  for (let i = 0; i < SCAN_SYMBOLS.length; i++) {
    const symbol = SCAN_SYMBOLS[i];
    const result = await fetchFinnhubQuote(symbol, debug);
    if (result) {
      results.push(result);
    }
    
    // Rate limit: 60 calls/min = 1 call per second
    // Add small delay every 5 calls to be safe
    if ((i + 1) % 5 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  // Log debug info
  console.log('Gap Scanner Debug:', JSON.stringify(debug.slice(0, 10), null, 2));

  return results;
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
    const stocks = await scanWithFinnhub();
    
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
      scanned: SCAN_SYMBOLS.length,
      found: stocks.length,
      filters: {
        minGapPercent: 5,
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
      scanned: SCAN_SYMBOLS.length,
      found: 0,
      filters: {
        minGapPercent: 5,
        minVolume: 100000,
        minMarketCap: 100000000,
        maxPrice: 500
      }
    });
  }
}
