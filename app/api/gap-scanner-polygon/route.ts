/**
 * Gap Scanner using Polygon.io API
 *
 * GET /api/gap-scanner-polygon
 * Fetches all stocks in a single API call and calculates gaps
 * Much faster than Finnhub (1 call vs 5000 calls)
 */

import { NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Market session helpers (all times in ET)
function getMarketSession(): {
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketStatus: 'open' | 'closed';
  isPreMarket: boolean;
} {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay(); // 0=Sun, 6=Sat
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const isWeekend = day === 0 || day === 6;

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' });

  // Previous trading day (skip weekends)
  const prevDate = new Date(etTime);
  prevDate.setDate(prevDate.getDate() - 1);
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
    prevDate.setDate(prevDate.getDate() - 1);
  }

  // Current trading date (today if weekday, last Friday if weekend)
  const tradingDate = new Date(etTime);
  while (tradingDate.getDay() === 0 || tradingDate.getDay() === 6) {
    tradingDate.setDate(tradingDate.getDate() - 1);
  }

  let session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  if (isWeekend) {
    session = 'closed';
  } else if (timeInMinutes >= 4 * 60 && timeInMinutes < 9 * 60 + 30) {
    session = 'pre-market';
  } else if (timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60) {
    session = 'market-open';
  } else if (timeInMinutes >= 16 * 60 && timeInMinutes < 20 * 60) {
    session = 'post-market';
  } else {
    session = 'closed';
  }

  return {
    session,
    isWeekend,
    tradingDate: fmt(tradingDate),
    previousDate: fmt(prevDate),
    marketStatus: session === 'market-open' ? 'open' : 'closed',
    isPreMarket: session === 'pre-market',
  };
}

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
  name: string;
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
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketSession: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  marketStatus: 'open' | 'closed';
  isPreMarket: boolean;
  debug: {
    apiKeyPresent: boolean;
    skippedByGap: number;
    skippedByVolume: number;
    skippedByPrice: number;
  };
  filters: {
    minGapPercent: number;
    minVolume: number;
    minPrice: number;
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

// Polygon free tier doesn't return company names, so detect likely ADRs by symbol pattern.
// ADRs often have 4-5 character tickers; domestic US blue-chips are 1-4 chars.
// This is a best-effort filter — Yahoo route uses name-based ADR detection instead.
function isLikelyADRBySymbol(symbol: string): boolean {
  // Common known ADR tickers to explicitly exclude
  const KNOWN_ADRS = new Set([
    'BABA', 'BIDU', 'JD', 'PDD', 'NIO', 'XPEV', 'LI', 'BILI', 'IQ',
    'TSM', 'ASML', 'SAP', 'TM', 'NVO', 'SONY', 'SHOP', 'RY', 'TD', 'BNS',
    'VALE', 'ITUB', 'BBD', 'SAN', 'BBVA', 'UL', 'BP', 'SHELL', 'AZN',
    'GSK', 'BTI', 'VOD', 'DEO', 'WPP',
  ]);
  return KNOWN_ADRS.has(symbol.toUpperCase());
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
    minPrice: number;
    maxPrice: number;
  }
): { gainers: GapStock[]; losers: GapStock[]; skipped: { gap: number; volume: number; price: number } } {
  const { minGapPercent, minVolume, minPrice, maxPrice } = options;

  const gainers: GapStock[] = [];
  const losers: GapStock[] = [];
  let skippedGap = 0;
  let skippedVolume = 0;
  let skippedPrice = 0;

  for (const snap of snapshots) {
    // Skip ETFs, derivatives, and known ADRs
    if (isETFOrDerivative(snap.ticker)) continue;
    if (isLikelyADRBySymbol(snap.ticker)) continue;

    // Need both current and previous day data
    if (!snap.day?.c || !snap.prevDay?.c) continue;

    const currentPrice = snap.lastTrade?.p || snap.day.c;
    const previousClose = snap.prevDay.c;
    const volume = snap.day.v || 0;

    // Skip if price out of range — minPrice filters sub-penny junk
    if (currentPrice < minPrice || currentPrice > maxPrice) {
      skippedPrice++;
      continue;
    }

    // Skip if today's volume < 1M (proxy for 90-day avg; Polygon snapshots
    // don't include historical avg volume on the free tier)
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
      name: snap.ticker, // Polygon basic tier doesn't return names; component falls back to symbol
      price: currentPrice,
      previousClose,
      gapPercent: Number(gapPercent.toFixed(2)),
      volume,
      marketCap: 0, // Not available on Polygon free tier
      status: gapPercent > 0 ? 'gainer' : 'loser',
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
    gainers: gainers.slice(0, 20),
    losers: losers.slice(0, 20),
    skipped: { gap: skippedGap, volume: skippedVolume, price: skippedPrice },
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  // Parse filters from query params
  const minGapPercent = parseFloat(searchParams.get('minGap') || '2');
  const minVolume = parseInt(searchParams.get('minVolume') || '1000000', 10);
  const minPrice = parseFloat(searchParams.get('minPrice') || '1'); // Proxy for microcap filter
  const maxPrice = parseFloat(searchParams.get('maxPrice') || '1000');

  const marketInfo = getMarketSession();

  try {
    // Check API key
    if (!POLYGON_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured. Please add it to your .env.local file.',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        ...marketInfo,
        marketSession: marketInfo.session,
      }, { status: 500 });
    }

    console.log(`[GapScanner-Polygon] Starting scan at ${new Date().toISOString()}`);
    console.log(`[GapScanner-Polygon] Filters: minGap=${minGapPercent}%, minVolume=${minVolume}, minPrice=${minPrice}, maxPrice=${maxPrice}`);

    // Fetch all snapshots in ONE API call
    const snapshots = await fetchAllSnapshots();

    // Process gaps
    const { gainers, losers, skipped } = processGaps(snapshots, {
      minGapPercent,
      minVolume,
      minPrice,
      maxPrice,
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
      isWeekend: marketInfo.isWeekend,
      tradingDate: marketInfo.tradingDate,
      previousDate: marketInfo.previousDate,
      marketSession: marketInfo.session,
      marketStatus: marketInfo.marketStatus,
      isPreMarket: marketInfo.isPreMarket,
      debug: {
        apiKeyPresent: true,
        skippedByGap: skipped.gap,
        skippedByVolume: skipped.volume,
        skippedByPrice: skipped.price,
      },
      filters: {
        minGapPercent,
        minVolume,
        minPrice,
        maxPrice,
      },
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
      durationMs,
      isWeekend: marketInfo.isWeekend,
      tradingDate: marketInfo.tradingDate,
      previousDate: marketInfo.previousDate,
      marketSession: marketInfo.session,
      marketStatus: marketInfo.marketStatus,
      isPreMarket: marketInfo.isPreMarket,
    }, { status: 500 });
  }
}
