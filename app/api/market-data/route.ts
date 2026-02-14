import { NextResponse } from 'next/server';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

interface FinnhubQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
  t: number;  // Timestamp
}

// Stock/ETF name mappings
const stockNames: Record<string, string> = {
  'SPY': 'S&P 500 ETF',
  'QQQ': 'NASDAQ ETF', 
  'DIA': 'Dow Jones ETF',
  'TSLA': 'Tesla Inc.',
  'META': 'Meta Platforms',
  'NVDA': 'NVIDIA',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com',
  'PLTR': 'Palantir'
};

/**
 * Fetches real-time stock/ETF quotes from Finnhub API
 * Free tier: 60 calls/minute, real-time US market data
 * 
 * Why Finnhub?
 * - Free tier with 60 calls/min (sufficient for our needs)
 * - Real-time US stock data
 * - No CORS issues when called server-side
 * - Reliable API with good uptime
 * 
 * @param symbols - Array of stock symbols (e.g., ['SPY', 'TSLA'])
 * @returns Array of market items or empty array on failure
 */
async function fetchFinnhubQuotes(symbols: string[]): Promise<MarketItem[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  
  if (!apiKey) {
    console.warn('FINNHUB_API_KEY not set. Falling back to mock data for stocks.');
    return [];
  }

  try {
    // Fetch quotes in parallel - Finnhub requires individual calls per symbol
    const quotePromises = symbols.map(async (symbol) => {
      try {
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
          { 
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 30 } // Cache for 30 seconds
          }
        );
        
        if (!response.ok) {
          console.warn(`Finnhub API error for ${symbol}: ${response.status}`);
          return null;
        }
        
        const data: FinnhubQuote = await response.json();
        
        // Validate response data
        if (!data || data.c === 0) {
          console.warn(`Invalid data for ${symbol}`);
          return null;
        }
        
        return {
          symbol: symbol,
          name: stockNames[symbol] || symbol,
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          status: data.d >= 0 ? 'up' as const : 'down' as const
        };
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(quotePromises);
    return results.filter((item): item is MarketItem => item !== null);
    
  } catch (error) {
    console.error('Finnhub fetch error:', error);
    return [];
  }
}

/**
 * Fetches cryptocurrency prices from CoinGecko API
 * Free tier: 10-30 calls/minute (depending on load)
 * 
 * Why CoinGecko?
 * - Free tier available without API key (with limits)
 * - No authentication required for basic endpoints
 * - Good coverage of major cryptocurrencies
 * - Reliable for BTC, ETH, SOL
 * 
 * @returns Array of crypto market items or empty array on failure
 */
async function fetchCryptoPrices(): Promise<MarketItem[]> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
      { 
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 } // Cache for 60 seconds
      }
    );
    
    if (!response.ok) {
      if (response.status === 429) {
        console.warn('CoinGecko rate limit hit');
      } else {
        console.warn(`CoinGecko API error: ${response.status}`);
      }
      return [];
    }
    
    const data = await response.json();
    const cryptos: MarketItem[] = [];
    
    if (data.bitcoin) {
      const changePercent = data.bitcoin.usd_24h_change || 0;
      cryptos.push({
        symbol: 'BTC',
        name: 'Bitcoin',
        price: data.bitcoin.usd,
        change: data.bitcoin.usd * (changePercent / 100),
        changePercent: changePercent,
        status: changePercent >= 0 ? 'up' : 'down'
      });
    }
    
    if (data.ethereum) {
      const changePercent = data.ethereum.usd_24h_change || 0;
      cryptos.push({
        symbol: 'ETH',
        name: 'Ethereum',
        price: data.ethereum.usd,
        change: data.ethereum.usd * (changePercent / 100),
        changePercent: changePercent,
        status: changePercent >= 0 ? 'up' : 'down'
      });
    }
    
    if (data.solana) {
      const changePercent = data.solana.usd_24h_change || 0;
      cryptos.push({
        symbol: 'SOL',
        name: 'Solana',
        price: data.solana.usd,
        change: data.solana.usd * (changePercent / 100),
        changePercent: changePercent,
        status: changePercent >= 0 ? 'up' : 'down'
      });
    }
    
    return cryptos;
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return [];
  }
}

/**
 * Returns fallback mock data for stocks when APIs fail
 * These are realistic but static values - shown when no API key or API errors
 */
function getFallbackStockData(): { indices: MarketItem[]; stocks: MarketItem[] } {
  return {
    indices: [
      { symbol: 'SPY', name: 'S&P 500 ETF', price: 595.32, change: 2.15, changePercent: 0.36, status: 'up' },
      { symbol: 'QQQ', name: 'NASDAQ ETF', price: 518.47, change: 3.21, changePercent: 0.62, status: 'up' },
      { symbol: 'DIA', name: 'Dow Jones ETF', price: 448.92, change: 1.87, changePercent: 0.42, status: 'up' }
    ],
    stocks: [
      { symbol: 'TSLA', name: 'Tesla Inc.', price: 355.84, change: 8.50, changePercent: 2.45, status: 'up' },
      { symbol: 'META', name: 'Meta Platforms', price: 736.67, change: -7.20, changePercent: -0.97, status: 'down' },
      { symbol: 'NVDA', name: 'NVIDIA', price: 138.25, change: -2.15, changePercent: -1.53, status: 'down' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 185.19, change: -0.82, changePercent: -0.44, status: 'down' },
      { symbol: 'AMZN', name: 'Amazon.com', price: 228.68, change: 0.15, changePercent: 0.07, status: 'up' },
      { symbol: 'PLTR', name: 'Palantir', price: 84.48, change: -1.20, changePercent: -1.40, status: 'down' }
    ]
  };
}

/**
 * Returns fallback mock data for crypto when APIs fail
 */
function getFallbackCryptoData(): MarketItem[] {
  return [
    { symbol: 'BTC', name: 'Bitcoin', price: 68229.47, change: 3125.80, changePercent: 4.79, status: 'up' },
    { symbol: 'ETH', name: 'Ethereum', price: 2054.38, change: 132.80, changePercent: 6.92, status: 'up' },
    { symbol: 'SOL', name: 'Solana', price: 83.97, change: 6.72, changePercent: 8.72, status: 'up' }
  ];
}

/**
 * Market Data API Route
 * 
 * This endpoint provides real-time market data for the Juno Mission Control dashboard.
 * It fetches data from multiple sources:
 * - Stocks/ETFs: Finnhub API (requires FINNHUB_API_KEY env var)
 * - Crypto: CoinGecko API (free, no key required)
 * 
 * If APIs fail or no API key is provided, falls back to mock data.
 * 
 * GET /api/market-data
 * 
 * Response: {
 *   success: boolean,
 *   data: {
 *     indices: MarketItem[],
 *     stocks: MarketItem[],
 *     crypto: MarketItem[],
 *     lastUpdated: string
 *   },
 *   timestamp: string,
 *   source: 'live' | 'cached' | 'fallback'
 * }
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    // Fetch data from all sources in parallel
    const [indexData, stockData, cryptoData] = await Promise.all([
      fetchFinnhubQuotes(['SPY', 'QQQ', 'DIA']),
      fetchFinnhubQuotes(['TSLA', 'META', 'NVDA', 'GOOGL', 'AMZN', 'PLTR']),
      fetchCryptoPrices()
    ]);
    
    const fallbackData = getFallbackStockData();
    const fallbackCrypto = getFallbackCryptoData();
    
    // Determine if we're using live data or fallback
    const hasLiveIndices = indexData.length > 0;
    const hasLiveStocks = stockData.length > 0;
    const hasLiveCrypto = cryptoData.length > 0;
    
    // Use live data if available, otherwise fallback
    const marketData = {
      indices: hasLiveIndices ? indexData : fallbackData.indices,
      stocks: hasLiveStocks ? stockData : fallbackData.stocks,
      crypto: hasLiveCrypto ? cryptoData : fallbackCrypto,
      lastUpdated: timestamp
    };
    
    // Determine source for response
    let source: 'live' | 'partial' | 'fallback' = 'live';
    if (!hasLiveIndices && !hasLiveStocks && !hasLiveCrypto) {
      source = 'fallback';
    } else if (!hasLiveIndices || !hasLiveStocks || !hasLiveCrypto) {
      source = 'partial';
    }
    
    // Log data source for debugging
    console.log(`Market data fetched: source=${source}, indices=${marketData.indices.length}, stocks=${marketData.stocks.length}, crypto=${marketData.crypto.length}`);
    
    return NextResponse.json({ 
      success: true, 
      data: marketData,
      timestamp,
      source
    }, {
      headers: {
        // Add cache headers for client-side caching
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    });
    
  } catch (error) {
    console.error('Market data fetch error:', error);
    
    // Return fallback data on complete failure
    const fallbackData = getFallbackStockData();
    const fallbackCrypto = getFallbackCryptoData();
    
    return NextResponse.json({ 
      success: true, 
      data: {
        indices: fallbackData.indices,
        stocks: fallbackData.stocks,
        crypto: fallbackCrypto,
        lastUpdated: timestamp
      },
      timestamp,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    });
  }
}
