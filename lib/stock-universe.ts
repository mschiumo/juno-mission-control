/**
 * Stock Universe Management
 * 
 * Manages the list of 5000 stocks for gap scanning.
 * Fetches from Finnhub, filters by market cap > $100M, caches in Redis.
 */

import { createClient } from 'redis';

// Redis client - lazy initialization
let redisClient: ReturnType<typeof createClient> | null = null;

const STOCK_UNIVERSE_KEY = 'stock_universe:top5000';
const STOCK_UNIVERSE_UPDATED_KEY = 'stock_universe:last_updated';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface StockInfo {
  symbol: string;
  name: string;
  marketCap: number; // in USD
  exchange: string;
}

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

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

function getFinnhubApiKey(): string {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY environment variable is required');
  }
  return FINNHUB_API_KEY;
}

// Finnhub stock symbols endpoint - supports batch requests
interface FinnhubSymbol {
  symbol: string;
  description: string;
  type: string;
  exchange: string;
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
 * Fetch all US stocks from Finnhub
 * This gets NYSE + NASDAQ stocks
 */
async function fetchAllUSStocks(): Promise<FinnhubSymbol[]> {
  const apiKey = getFinnhubApiKey();
  
  // Finnhub US exchanges: US (all), NYSE, NASDAQ
  const exchanges = ['US', 'NYSE', 'NASDAQ'];
  const allSymbols = new Map<string, FinnhubSymbol>();
  
  for (const exchange of exchanges) {
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/stock/symbol?exchange=${exchange}&token=${apiKey}`,
        { next: { revalidate: 86400 } } // Cache for 24 hours
      );
      
      if (!response.ok) {
        console.warn(`Finnhub symbols error for ${exchange}:`, response.status);
        continue;
      }
      
      const data: FinnhubSymbol[] = await response.json();
      
      // Add unique symbols (avoid duplicates from US vs specific exchanges)
      for (const symbol of data) {
        if (!allSymbols.has(symbol.symbol) && !isETFOrDerivative(symbol.symbol)) {
          allSymbols.set(symbol.symbol, symbol);
        }
      }
      
      console.log(`[StockUniverse] Fetched ${data.length} symbols from ${exchange}`);
      
      // Rate limiting - 100ms between calls
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Error fetching symbols for ${exchange}:`, error);
    }
  }
  
  return Array.from(allSymbols.values());
}

/**
 * Fetch market cap for a batch of stocks using Finnhub
 * Batch size: 50 (to match our polling rate)
 */
async function fetchMarketCapsBatch(symbols: string[]): Promise<Map<string, number>> {
  const apiKey = getFinnhubApiKey();
  const marketCaps = new Map<string, number>();
  
  // Process in batches of 50
  const batchSize = 50;
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    // Fetch market caps in parallel within batch
    const promises = batch.map(async (symbol) => {
      try {
        const response = await fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`,
          { next: { revalidate: 604800 } } // Cache for 7 days
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data && data.marketCapitalization) {
          return {
            symbol,
            marketCap: data.marketCapitalization * 1000000 // Convert from millions to actual
          };
        }
        return null;
      } catch (error) {
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result) {
        marketCaps.set(result.symbol, result.marketCap);
      }
    }
    
    // Rate limiting: 1 second between batches = 60 calls/min
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return marketCaps;
}

/**
 * Build the stock universe:
 * 1. Fetch all US stocks from Finnhub
 * 2. Get market cap for each
 * 3. Filter by market cap > $100M
 * 4. Sort by market cap desc
 * 5. Take top 5000
 * 6. Store in Redis
 */
export async function buildStockUniverse(): Promise<{
  success: boolean;
  count: number;
  filteredCount: number;
  finalCount: number;
  timeMs: number;
  errors?: string[];
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  try {
    console.log('[StockUniverse] Starting universe build...');
    
    // Step 1: Fetch all US stocks
    const allStocks = await fetchAllUSStocks();
    console.log(`[StockUniverse] Total unique stocks: ${allStocks.length}`);
    
    if (allStocks.length === 0) {
      throw new Error('No stocks fetched from Finnhub');
    }
    
    // Step 2: Get market caps (this will take a while for large lists)
    // For efficiency, we'll sample if there are too many stocks
    const symbolsToCheck = allStocks.slice(0, 10000); // Limit to first 10k for performance
    const symbolList = symbolsToCheck.map(s => s.symbol);
    
    console.log(`[StockUniverse] Fetching market caps for ${symbolList.length} stocks...`);
    const marketCaps = await fetchMarketCapsBatch(symbolList);
    console.log(`[StockUniverse] Got market caps for ${marketCaps.size} stocks`);
    
    // Step 3: Filter by market cap > $100M
    const MIN_MARKET_CAP = 100_000_000; // $100M
    
    const stocksWithCaps: StockInfo[] = [];
    for (const stock of symbolsToCheck) {
      const cap = marketCaps.get(stock.symbol);
      if (cap && cap >= MIN_MARKET_CAP) {
        stocksWithCaps.push({
          symbol: stock.symbol,
          name: stock.description || stock.symbol,
          marketCap: cap,
          exchange: stock.exchange
        });
      }
    }
    
    console.log(`[StockUniverse] Stocks with cap > $100M: ${stocksWithCaps.length}`);
    
    // Step 4: Sort by market cap desc and take top 5000
    stocksWithCaps.sort((a, b) => b.marketCap - a.marketCap);
    const top5000 = stocksWithCaps.slice(0, 5000);
    
    console.log(`[StockUniverse] Top 5000 selected`);
    
    // Step 5: Store in Redis
    const redis = await getRedisClient();
    if (redis) {
      await redis.setEx(
        STOCK_UNIVERSE_KEY,
        CACHE_TTL_SECONDS,
        JSON.stringify(top5000)
      );
      await redis.set(STOCK_UNIVERSE_UPDATED_KEY, new Date().toISOString());
      console.log(`[StockUniverse] Stored in Redis`);
    } else {
      errors.push('Redis unavailable - storing in memory only');
    }
    
    const timeMs = Date.now() - startTime;
    console.log(`[StockUniverse] Build completed in ${timeMs}ms`);
    
    return {
      success: true,
      count: allStocks.length,
      filteredCount: stocksWithCaps.length,
      finalCount: top5000.length,
      timeMs,
      errors: errors.length > 0 ? errors : undefined
    };
    
  } catch (error) {
    const timeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[StockUniverse] Build failed:', errorMsg);
    
    return {
      success: false,
      count: 0,
      filteredCount: 0,
      finalCount: 0,
      timeMs,
      errors: [errorMsg]
    };
  }
}

/**
 * Get the stock universe from Redis
 * If not available, returns the default universe
 */
export async function getStockUniverse(): Promise<string[]> {
  try {
    const redis = await getRedisClient();
    
    if (redis) {
      const data = await redis.get(STOCK_UNIVERSE_KEY);
      if (data) {
        const stocks: StockInfo[] = JSON.parse(data);
        console.log(`[StockUniverse] Loaded ${stocks.length} stocks from Redis`);
        return stocks.map(s => s.symbol);
      }
    }
    
    console.warn('[StockUniverse] No cached universe found, using fallback');
    return FALLBACK_UNIVERSE;
    
  } catch (error) {
    console.error('[StockUniverse] Error loading universe:', error);
    return FALLBACK_UNIVERSE;
  }
}

/**
 * Get the full stock info (including market cap) from Redis
 */
export async function getStockInfoMap(): Promise<Map<string, StockInfo>> {
  try {
    const redis = await getRedisClient();
    const infoMap = new Map<string, StockInfo>();
    
    if (redis) {
      const data = await redis.get(STOCK_UNIVERSE_KEY);
      if (data) {
        const stocks: StockInfo[] = JSON.parse(data);
        for (const stock of stocks) {
          infoMap.set(stock.symbol, stock);
        }
      }
    }
    
    return infoMap;
    
  } catch (error) {
    console.error('[StockUniverse] Error loading stock info:', error);
    return new Map();
  }
}

/**
 * Get the last update timestamp
 */
export async function getLastUpdated(): Promise<string | null> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      return await redis.get(STOCK_UNIVERSE_UPDATED_KEY);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Force refresh the stock universe
 */
export async function refreshStockUniverse(): Promise<{
  success: boolean;
  message: string;
  details?: {
    count: number;
    filteredCount: number;
    finalCount: number;
    timeMs: number;
  };
}> {
  const result = await buildStockUniverse();
  
  if (result.success) {
    return {
      success: true,
      message: `Stock universe refreshed: ${result.finalCount} stocks`,
      details: {
        count: result.count,
        filteredCount: result.filteredCount,
        finalCount: result.finalCount,
        timeMs: result.timeMs
      }
    };
  } else {
    return {
      success: false,
      message: `Failed to refresh: ${result.errors?.[0] || 'Unknown error'}`,
      details: {
        count: result.count,
        filteredCount: result.filteredCount,
        finalCount: result.finalCount,
        timeMs: result.timeMs
      }
    };
  }
}

// Fallback universe if Redis is unavailable (top 100 liquid stocks)
const FALLBACK_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B', 'UNH', 'JNJ',
  'XOM', 'JPM', 'V', 'PG', 'HD', 'CVX', 'MA', 'LLY', 'BAC', 'ABBV',
  'PFE', 'KO', 'AVGO', 'PEP', 'TMO', 'WMT', 'MRK', 'COST', 'DIS', 'ABT',
  'ADBE', 'CRM', 'ACN', 'VZ', 'DHR', 'WFC', 'NKE', 'TXN', 'NEE', 'PM',
  'RTX', 'BMY', 'ORCL', 'LIN', 'UPS', 'HON', 'QCOM', 'T', 'AMGN', 'SBUX',
  'AMD', 'NFLX', 'INTC', 'CSCO', 'AMAT', 'INTU', 'PLTR', 'ABNB', 'UBER', 'COIN',
  'HOOD', 'RBLX', 'SOFI', 'NET', 'DDOG', 'CRWD', 'FSLY', 'ENPH', 'SEDG', 'RUN'
];

// Export fallback for testing
export { FALLBACK_UNIVERSE };
