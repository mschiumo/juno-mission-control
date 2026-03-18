/**
 * Gap Scanner using Polygon.io API
 * 
 * GET /api/gap-scanner-polygon
 * Fetches all stocks in a single API call and calculates gaps
 * Much faster than Finnhub (1 call vs 5000 calls)
 */

import { NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

interface PolygonSnapshot {
  ticker: string;
  day: {
    c: number; // close
    h: number; // high
    l: number; // low
    o: number; // open
    v: number; // volume
    vw: number; // volume weighted average
  };
  prevDay: {
    c: number; // previous close
    h: number;
    l: number;
    o: number;
    v: number;
    vw: number;
  };
  lastTrade?: {
    p: number; // price
  };
  lastQuote?: {
    p: number; // ask price
  };
  min?: {
    c: number;
  };
  todaysChange?: number;
  todaysChangePerc?: number;
}

interface GapStock {
  symbol: string;
  price: number;
  previousClose: number;
  gapPercent: number;
  volume: number;
  marketCap: number; // Not available from Polygon basic
  status: 'gainer' | 'loser';
}

interface ScanResult {
  success: boolean;
  data: {
    gainers: GapStock[];
    losers: GapStock[];
  };
  timestamp: string;
  source: string;
  scanned: number;
  found: number;
  durationMs: number;
  debug: {
    apiKeyPresent: boolean;
    skippedByGap: number;
    skippedByVolume: number;
    skippedByPrice: number;
  };
  filters: {
    minGapPercent: number;
    minVolume: number;
    maxPrice: number;
  };
}

// ETF patterns to exclude
const ETF_PATTERNS = [
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'EMB',
  'VIX', 'UVXY', 'SVXY', 'SQQQ', 'TQQQ', 'UPRO', 'SPXU', 'FAZ', 'FAS',
];

// Warrant/Unit/Right suffixes
const EXCLUDED_SUFFIXES = ['.WS', '.WSA', '.WSB', '.WT', '+', '^', '=', '/WS', '/WT', '.U', '.UN', '.R', '.RT'];

function isETFOrDerivative(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  if (ETF_PATTERNS.includes(upperSymbol)) return true;
  for (const suffix of EXCLUDED_SUFFIXES) {
    if (upperSymbol.endsWith(suffix)) return true;
  }
  if (/[\/\^\+\=]/.test(symbol)) return true;
  if (/\.PR[A-Z]?$/.test(upperSymbol) || /-P[ABCDEF]?$/.test(upperSymbol)) return true;
  if (/\.[BC]$/.test(upperSymbol) && upperSymbol !== 'BRK.B') return true;
  return false;
}

/**
 * Fetch all stock snapshots from Polygon
 * This returns ALL stocks in a single API call!
 */
async function fetchAllSnapshots(): Promise<PolygonSnapshot[]> {
  if (!POLYGON_API_KEY) {
    throw new Error('POLYGON_API_KEY environment variable is required');
  }

  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
  
  console.log('[GapScanner-Polygon] Fetching all stock snapshots...');
  
  const response = await fetch(url, {
    next: { revalidate: 60 } // Cache for 1 minute
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.tickers || !Array.isArray(data.tickers)) {
    throw new Error('Invalid response from Polygon API');
  }
  
  console.log(`[GapScanner-Polygon] Fetched ${data.tickers.length} snapshots`);
  return data.tickers;
}

/**
 * Process snapshots and calculate gaps
 */
function processGaps(
  snapshots: PolygonSnapshot[],
  options: {
    minGapPercent: number;
    minVolume: number;
    maxPrice: number;
  }
): { gainers: GapStock[]; losers: GapStock[]; skipped: { gap: number; volume: number; price: number } } {
  const { minGapPercent, minVolume, maxPrice } = options;
  
  const gainers: GapStock[] = [];
  const losers: GapStock[] = [];
  let skippedGap = 0;
  let skippedVolume = 0;
  let skippedPrice = 0;
  
  for (const snap of snapshots) {
    // Skip ETFs and derivatives
    if (isETFOrDerivative(snap.ticker)) continue;
    
    // Need both current and previous day data
    if (!snap.day?.c || !snap.prevDay?.c) continue;
    
    const currentPrice = snap.lastTrade?.p || snap.day.c;
    const previousClose = snap.prevDay.c;
    const volume = snap.day.v || 0;
    
    // Skip if price too high
    if (currentPrice > maxPrice) {
      skippedPrice++;
      continue;
    }
    
    // Skip if volume too low
    if (volume < minVolume) {
      skippedVolume++;
      continue;
    }
    
    // Calculate gap percentage
    const gapPercent = ((currentPrice - previousClose) / previousClose) * 100;
    
    // Skip if gap too small
    if (Math.abs(gapPercent) < minGapPercent) {
      skippedGap++;
      continue;
    }
    
    const stock: GapStock = {
      symbol: snap.ticker,
      price: currentPrice,
      previousClose,
      gapPercent: Number(gapPercent.toFixed(2)),
      volume,
      marketCap: 0, // Polygon basic doesn't provide market cap
      status: gapPercent > 0 ? 'gainer' : 'loser'
    };
    
    if (gapPercent > 0) {
      gainers.push(stock);
    } else {
      losers.push(stock);
    }
  }
  
  // Sort by gap magnitude
  gainers.sort((a, b) => b.gapPercent - a.gapPercent);
  losers.sort((a, b) => a.gapPercent - b.gapPercent);
  
  return {
    gainers: gainers.slice(0, 20), // Top 20
    losers: losers.slice(0, 20),
    skipped: { gap: skippedGap, volume: skippedVolume, price: skippedPrice }
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  
  // Parse filters from query params
  const minGapPercent = parseFloat(searchParams.get('minGap') || '2'); // Default 2% to match UI
  const minVolume = parseInt(searchParams.get('minVolume') || '100000', 10);
  const maxPrice = parseFloat(searchParams.get('maxPrice') || '1000');
  
  try {
    // Check API key
    if (!POLYGON_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured. Please add it to your .env.local file.',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }, { status: 500 });
    }
    
    console.log(`[GapScanner-Polygon] Starting scan at ${new Date().toISOString()}`);
    console.log(`[GapScanner-Polygon] Filters: minGap=${minGapPercent}%, minVolume=${minVolume}, maxPrice=${maxPrice}`);
    
    // Fetch all snapshots in ONE API call
    const snapshots = await fetchAllSnapshots();
    
    // Process gaps
    const { gainers, losers, skipped } = processGaps(snapshots, {
      minGapPercent,
      minVolume,
      maxPrice
    });
    
    const durationMs = Date.now() - startTime;
    
    const result: ScanResult = {
      success: true,
      data: { gainers, losers },
      timestamp: new Date().toISOString(),
      source: 'polygon',
      scanned: snapshots.length,
      found: gainers.length + losers.length,
      durationMs,
      debug: {
        apiKeyPresent: true,
        skippedByGap: skipped.gap,
        skippedByVolume: skipped.volume,
        skippedByPrice: skipped.price
      },
      filters: {
        minGapPercent,
        minVolume,
        maxPrice
      }
    };
    
    console.log(`[GapScanner-Polygon] Completed in ${durationMs}ms`);
    console.log(`[GapScanner-Polygon] Results: ${gainers.length} gainers, ${losers.length} losers from ${snapshots.length} stocks`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('[GapScanner-Polygon] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch gap data',
      timestamp: new Date().toISOString(),
      durationMs
    }, { status: 500 });
  }
}
