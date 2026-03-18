import { NextResponse } from 'next/server';
import { getStockUniverse, getStockInfoMap, refreshStockUniverse, StockInfo } from '@/lib/stock-universe';
import { createClient } from 'redis';

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
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketSession: string;
  marketStatus: string;
  isPreMarket: boolean;
  durationMs: number;
  debug: {
    apiKeyPresent: boolean;
    apiKeyLength: number;
    universeSize: number;
    skippedETF: number;
    skippedGap: number;
    skippedVolume: number;
    skippedPrice: number;
    skippedMarketCap: number;
    quoteFailures: number;
    profileFailures: number;
    errors: string[];
  };
  filters: {
    minGapPercent: number;
    minVolume: number;
    maxPrice: number;
    minMarketCap: number;
    excludeETFs: boolean;
    excludeWarrants: boolean;
  };
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// Lazy check for API key - don't throw at module load time
function getFinnhubApiKey(): string {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY environment variable is required');
  }
  return FINNHUB_API_KEY;
}

// US Market Holidays 2026
const MARKET_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas Day
];

function isMarketHoliday(dateStr: string): boolean {
  return MARKET_HOLIDAYS_2026.includes(dateStr);
}

function getLastTradingDate(date: Date = new Date()): string {
  // Start with yesterday
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  
  // Keep going back until we find a trading day (not weekend, not holiday)
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6 || isMarketHoliday(prevDate.toISOString().split('T')[0])) {
    prevDate.setDate(prevDate.getDate() - 1);
  }
  
  return prevDate.toISOString().split('T')[0];
}

// Market hours in EST (UTC-5, or UTC-4 during DST)
// Pre-market: 4:00 AM - 9:30 AM EST
// Market open: 9:30 AM - 4:00 PM EST
// Post-market: 4:00 PM - 8:00 PM EST
function getMarketSession(): {
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  isPreMarket: boolean;
  marketStatus: 'open' | 'closed';
} {
  const now = new Date();
  // Convert to EST (Eastern Time)
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = estTime.getHours();
  const minute = estTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Pre-market: 4:00 AM (240 min) to 9:30 AM (570 min)
  if (timeInMinutes >= 240 && timeInMinutes < 570) {
    return { session: 'pre-market', isPreMarket: true, marketStatus: 'open' };
  }
  
  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
  if (timeInMinutes >= 570 && timeInMinutes < 960) {
    return { session: 'market-open', isPreMarket: false, marketStatus: 'open' };
  }
  
  // Post-market: 4:00 PM (960 min) to 8:00 PM (1200 min)
  if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    return { session: 'post-market', isPreMarket: false, marketStatus: 'open' };
  }
  
  // Closed (outside market hours)
  return { session: 'closed', isPreMarket: false, marketStatus: 'closed' };
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

// Redis client for caching results
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined,
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

/**
 * Fetch batch quotes from Finnhub
 * Note: Finnhub doesn't support true batch quotes, but we can make parallel requests
 * with rate limiting (60 calls/minute = 1 call per second)
 */
interface QuoteData {
  symbol: string;
  current: number;
  previous: number;
  volume: number;
}

async function fetchBatchQuotes(
  symbols: string[], 
  delayMs: number = 1000
): Promise<Map<string, QuoteData>> {
  const apiKey = getFinnhubApiKey();
  const quotes = new Map<string, QuoteData>();
  
  // Process in batches - rate limited
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
        { next: { revalidate: 0 } } // No cache - real-time data
      );
      
      if (!response.ok) {
        console.warn(`Finnhub quote error for ${symbol}:`, response.status);
        continue;
      }
      
      const data = await response.json();
      
      // Finnhub quote response: c: current, pc: previous close, v: volume
      if (data && data.c !== 0 && data.pc !== 0) {
        quotes.set(symbol, {
          symbol,
          current: data.c,
          previous: data.pc,
          volume: data.v || 0
        });
      }
      
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
    }
    
    // Rate limiting between requests
    if (i < symbols.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  return quotes;
}

/**
 * Store scan results in Redis
 */
async function storeScanResults(results: ScanResult): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const key = `gap_scanner:${results.tradingDate}`;
      await redis.setEx(key, 86400, JSON.stringify(results)); // TTL 24 hours
      console.log(`[GapScanner] Results stored in Redis: ${key}`);
    }
  } catch (error) {
    console.error('[GapScanner] Failed to store results:', error);
  }
}

/**
 * Get cached scan results from Redis
 */
async function getCachedResults(date: string): Promise<ScanResult | null> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const key = `gap_scanner:${date}`;
      const data = await redis.get(key);
      if (data) {
        return JSON.parse(data);
      }
    }
    return null;
  } catch (error) {
    console.error('[GapScanner] Failed to get cached results:', error);
    return null;
  }
}

/**
 * Main scan function - processes stocks in batches
 */
async function scanForGaps(
  symbols: string[],
  stockInfo: Map<string, StockInfo>,
  options: {
    batchSize?: number;
    delayMs?: number;
    minGapPercent?: number;
    minVolume?: number;
    maxPrice?: number;
    minMarketCap?: number;
    dryRun?: boolean;
  } = {}
): Promise<Omit<ScanResult, 'success' | 'source' | 'isWeekend' | 'marketSession' | 'marketStatus' | 'isPreMarket'>> {
  const startTime = Date.now();
  const {
    batchSize = 50,
    delayMs = 1000,
    minGapPercent = 5,
    minVolume = 100000,
    maxPrice = 1000,
    minMarketCap = 100_000_000,
    dryRun = false
  } = options;
  
  const gainers: GapStock[] = [];
  const losers: GapStock[] = [];
  let scanned = 0;
  let quoteFailures = 0;
  let profileFailures = 0;
  let skippedETF = 0;
  let skippedGap = 0;
  let skippedVolume = 0;
  let skippedPrice = 0;
  let skippedMarketCap = 0;
  const errors: string[] = [];
  
  // Split into batches
  const totalBatches = Math.ceil(symbols.length / batchSize);
  console.log(`[GapScanner] Processing ${symbols.length} stocks in ${totalBatches} batches of ${batchSize}`);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, symbols.length);
    const batch = symbols.slice(start, end);
    
    console.log(`[GapScanner] Batch ${batchIndex + 1}/${totalBatches}: ${batch.length} stocks`);
    
    // Fetch quotes for this batch
    const quotes = await fetchBatchQuotes(batch, delayMs);
    
    // Process results
    for (const [symbol, quote] of quotes) {
      const info = stockInfo.get(symbol);
      
      // Check market cap filter
      if (info && info.marketCap < minMarketCap) {
        skippedMarketCap++;
        continue;
      }
      
      scanned++;
      
      // Calculate gap
      const gapPercent = ((quote.current - quote.previous) / quote.previous) * 100;
      
      // Apply filters
      if (Math.abs(gapPercent) < minGapPercent) {
        skippedGap++;
        continue;
      }
      if (quote.volume < minVolume) {
        skippedVolume++;
        continue;
      }
      if (quote.current > maxPrice) {
        skippedPrice++;
        continue;
      }
      
      const stock: GapStock = {
        symbol,
        name: info?.name || symbol,
        price: quote.current,
        previousClose: quote.previous,
        gapPercent: Number(gapPercent.toFixed(2)),
        volume: quote.volume,
        marketCap: info?.marketCap || 0,
        status: gapPercent > 0 ? 'gainer' : 'loser'
      };
      
      if (gapPercent > 0) {
        gainers.push(stock);
      } else {
        losers.push(stock);
      }
    }
    
    // Log progress every 10 batches
    if ((batchIndex + 1) % 10 === 0 || batchIndex === totalBatches - 1) {
      const progress = Math.round(((batchIndex + 1) / totalBatches) * 100);
      console.log(`[GapScanner] Progress: ${progress}% (${batchIndex + 1}/${totalBatches} batches)`);
    }
  }
  
  // Sort by gap magnitude
  gainers.sort((a, b) => b.gapPercent - a.gapPercent);
  losers.sort((a, b) => a.gapPercent - b.gapPercent);
  
  const durationMs = Date.now() - startTime;
  
  return {
    data: {
      gainers: gainers.slice(0, 20), // Top 20 gainers
      losers: losers.slice(0, 20)    // Top 20 losers
    },
    timestamp: new Date().toISOString(),
    scanned,
    found: gainers.length + losers.length,
    tradingDate: new Date().toISOString().split('T')[0],
    previousDate: getLastTradingDate(),
    durationMs,
    debug: {
      apiKeyPresent: !!getFinnhubApiKey(),
      apiKeyLength: getFinnhubApiKey()?.length || 0,
      universeSize: symbols.length,
      skippedETF,
      skippedGap,
      skippedVolume,
      skippedPrice,
      skippedMarketCap,
      quoteFailures,
      profileFailures,
      errors
    },
    filters: {
      minGapPercent,
      minVolume,
      maxPrice,
      minMarketCap,
      excludeETFs: true,
      excludeWarrants: true
    }
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const { searchParams } = new URL(request.url);
  
  // Parse options from query params
  const dryRun = searchParams.get('dryRun') === 'true';
  const limit = parseInt(searchParams.get('limit') || '5000', 10);
  const forceRefresh = searchParams.get('refresh') === 'true';
  const useCache = searchParams.get('cache') !== 'false';
  const minGapPercent = parseFloat(searchParams.get('minGap') || '5');
  
  try {
    // Check API key
    const apiKey = getFinnhubApiKey();
    console.log(`[GapScanner] Starting scan at ${timestamp}`);
    console.log(`[GapScanner] Options: dryRun=${dryRun}, limit=${limit}, forceRefresh=${forceRefresh}`);
    
    // Get stock universe
    let symbols: string[];
    let stockInfo: Map<string, StockInfo>;
    
    if (forceRefresh) {
      console.log('[GapScanner] Refreshing stock universe...');
      await refreshStockUniverse();
    }
    
    // Try to get cached universe
    symbols = await getStockUniverse();
    stockInfo = await getStockInfoMap();
    
    // Limit symbols if requested (for testing)
    if (limit < symbols.length) {
      console.log(`[GapScanner] Limiting scan to ${limit} stocks for testing`);
      symbols = symbols.slice(0, limit);
    }
    
    // Check for cached results today
    const today = new Date().toISOString().split('T')[0];
    if (useCache && !forceRefresh && !dryRun) {
      const cached = await getCachedResults(today);
      if (cached) {
        console.log('[GapScanner] Returning cached results');
        return NextResponse.json({
          ...cached,
          source: 'cache'
        });
      }
    }
    
    // Check market session
    const marketSession = getMarketSession();
    
    // Run the scan
    const scanResults = await scanForGaps(symbols, stockInfo, {
      batchSize: 50,
      delayMs: 1000, // 1 second between stocks = 60 calls/min
      minGapPercent,
      minVolume: 100000,
      maxPrice: 1000,
      minMarketCap: 100_000_000,
      dryRun
    });
    
    const totalDuration = Date.now() - startTime;
    
    // Build response
    const response: ScanResult = {
      success: true,
      ...scanResults,
      source: 'live',
      isWeekend: new Date().getDay() === 0 || new Date().getDay() === 6,
      marketSession: marketSession.session,
      marketStatus: marketSession.marketStatus,
      isPreMarket: marketSession.isPreMarket
    };
    
    console.log(`[GapScanner] Completed in ${totalDuration}ms`);
    console.log(`[GapScanner] Results: ${response.data.gainers.length} gainers, ${response.data.losers.length} losers from ${response.scanned} stocks scanned`);
    
    // Store results if not dry run
    if (!dryRun) {
      await storeScanResults(response);
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[GapScanner] Error:', error);
    const totalDuration = Date.now() - startTime;
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch gap data',
      timestamp,
      durationMs: totalDuration,
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Also support POST for triggering scans with options
export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;
  
  if (action === 'refresh-universe') {
    const result = await refreshStockUniverse();
    return NextResponse.json(result);
  }
  
  return NextResponse.json({
    success: false,
    error: 'Unknown action'
  }, { status: 400 });
}
