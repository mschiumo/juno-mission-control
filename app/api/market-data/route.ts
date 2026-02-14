import { NextResponse } from 'next/server';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

// Stock/ETF/Commodity name mappings
const stockNames: Record<string, string> = {
  'SPY': 'S&P 500 ETF',
  'QQQ': 'NASDAQ ETF', 
  'DIA': 'Dow Jones ETF',
  'VXX': 'iPath VIX Short-Term Futures',
  'UUP': 'US Dollar Index Bullish',
  'TSLA': 'Tesla Inc.',
  'META': 'Meta Platforms',
  'NVDA': 'NVIDIA',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com',
  'PLTR': 'Palantir',
  'AMAT': 'Applied Materials',
  'GLD': 'SPDR Gold Shares',
  'SLV': 'iShares Silver Trust',
  'CPER': 'United States Copper Index',
  'PLTM': 'GraniteShares Platinum Trust',
  'PALL': 'Aberdeen Physical Palladium'
};

/**
 * Fetches stock/commodity data from Finnhub API
 * Requires FINNHUB_API_KEY environment variable
 * Free tier: 60 calls/minute
 */
async function fetchFinnhubQuote(symbol: string): Promise<MarketItem | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('FINNHUB_API_KEY not set');
    return null;
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
      { next: { revalidate: 60 } }
    );
    
    if (!response.ok) {
      console.warn(`Finnhub error for ${symbol}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Finnhub returns: c (current), d (change), dp (change percent), h (high), l (low), o (open), pc (previous close)
    const price = data.c || 0;
    const change = data.d || 0;
    const changePercent = data.dp || 0;
    
    if (price > 0) {
      return {
        symbol: symbol,
        name: stockNames[symbol] || symbol,
        price: Number(price.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Finnhub error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetches multiple stocks/commodities from Finnhub
 */
async function fetchFinnhubStocks(symbols: string[]): Promise<MarketItem[]> {
  const results = await Promise.all(
    symbols.map(symbol => fetchFinnhubQuote(symbol))
  );
  return results.filter((item): item is MarketItem => item !== null);
}

/**
 * Fetches stock data from Yahoo Finance (fallback)
 */
async function fetchYahooFinance(symbols: string[]): Promise<MarketItem[]> {
  try {
    const symbolsParam = symbols.join(',');
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbolsParam}?interval=1d&range=1d`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        next: { revalidate: 60 }
      }
    );
    
    if (!response.ok) {
      console.warn(`Yahoo Finance error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const results: MarketItem[] = [];
    
    const resultArray = Array.isArray(data.chart?.result) 
      ? data.chart.result 
      : data.chart?.result ? [data.chart.result] : [];
    
    for (const result of resultArray) {
      if (!result?.meta) continue;
      
      const meta = result.meta;
      const symbol = meta.symbol || meta.shortName || 'UNKNOWN';
      const price = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0;
      const prevClose = meta.previousClose || meta.chartPreviousClose || price;
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      
      if (price > 0) {
        results.push({
          symbol: symbol,
          name: stockNames[symbol] || meta.shortName || symbol,
          price: Number(price.toFixed(2)),
          change: Number(change.toFixed(2)),
          changePercent: Number(changePercent.toFixed(2)),
          status: change >= 0 ? 'up' : 'down'
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Yahoo Finance error:', error);
    return [];
  }
}

/**
 * Fetches cryptocurrency prices from CoinGecko API
 * Includes HYPE (Hyperliquid token)
 */
async function fetchCryptoPrices(): Promise<MarketItem[]> {
  try {
    // Fetch major cryptos from CoinGecko
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,hyperliquid&vs_currencies=usd&include_24hr_change=true',
      { 
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 }
      }
    );
    
    if (!response.ok) {
      console.warn(`CoinGecko error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const cryptos: MarketItem[] = [];
    
    if (data.bitcoin?.usd) {
      const change = data.bitcoin.usd_24h_change || 0;
      cryptos.push({
        symbol: 'BTC',
        name: 'Bitcoin',
        price: data.bitcoin.usd,
        change: Number((data.bitcoin.usd * (change / 100)).toFixed(2)),
        changePercent: Number(change.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      });
    }
    
    if (data.ethereum?.usd) {
      const change = data.ethereum.usd_24h_change || 0;
      cryptos.push({
        symbol: 'ETH',
        name: 'Ethereum',
        price: data.ethereum.usd,
        change: Number((data.ethereum.usd * (change / 100)).toFixed(2)),
        changePercent: Number(change.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      });
    }
    
    if (data.solana?.usd) {
      const change = data.solana.usd_24h_change || 0;
      cryptos.push({
        symbol: 'SOL',
        name: 'Solana',
        price: data.solana.usd,
        change: Number((data.solana.usd * (change / 100)).toFixed(2)),
        changePercent: Number(change.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      });
    }
    
    // Add HYPE (Hyperliquid)
    if (data.hyperliquid?.usd) {
      const change = data.hyperliquid.usd_24h_change || 0;
      cryptos.push({
        symbol: 'HYPE',
        name: 'Hyperliquid',
        price: data.hyperliquid.usd,
        change: Number((data.hyperliquid.usd * (change / 100)).toFixed(2)),
        changePercent: Number(change.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      });
    }
    
    return cryptos;
  } catch (error) {
    console.error('CoinGecko error:', error);
    return [];
  }
}

/**
 * Fallback mock data when all APIs fail
 */
function getFallbackData(): { indices: MarketItem[]; stocks: MarketItem[]; commodities: MarketItem[]; crypto: MarketItem[] } {
  return {
    indices: [
      { symbol: 'SPY', name: 'S&P 500 ETF', price: 595.32, change: 2.15, changePercent: 0.36, status: 'up' },
      { symbol: 'QQQ', name: 'NASDAQ ETF', price: 518.47, change: 3.21, changePercent: 0.62, status: 'up' },
      { symbol: 'DIA', name: 'Dow Jones ETF', price: 448.92, change: 1.87, changePercent: 0.42, status: 'up' },
      { symbol: 'VXX', name: 'iPath VIX Short-Term Futures', price: 52.35, change: -1.25, changePercent: -2.33, status: 'down' },
      { symbol: 'UUP', name: 'US Dollar Index Bullish', price: 28.45, change: 0.15, changePercent: 0.53, status: 'up' }
    ],
    stocks: [
      { symbol: 'TSLA', name: 'Tesla Inc.', price: 355.84, change: 8.50, changePercent: 2.45, status: 'up' },
      { symbol: 'META', name: 'Meta Platforms', price: 736.67, change: -7.20, changePercent: -0.97, status: 'down' },
      { symbol: 'NVDA', name: 'NVIDIA', price: 138.25, change: -2.15, changePercent: -1.53, status: 'down' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 185.19, change: -0.82, changePercent: -0.44, status: 'down' },
      { symbol: 'AMZN', name: 'Amazon.com', price: 228.68, change: 0.15, changePercent: 0.07, status: 'up' },
      { symbol: 'PLTR', name: 'Palantir', price: 84.48, change: -1.20, changePercent: -1.40, status: 'down' },
      { symbol: 'AMAT', name: 'Applied Materials', price: 92.45, change: 1.25, changePercent: 1.37, status: 'up' }
    ],
    commodities: [
      { symbol: 'GLD', name: 'SPDR Gold Shares', price: 258.42, change: 1.35, changePercent: 0.53, status: 'up' },
      { symbol: 'SLV', name: 'iShares Silver Trust', price: 29.85, change: 0.22, changePercent: 0.74, status: 'up' },
      { symbol: 'CPER', name: 'United States Copper Index', price: 28.45, change: -0.35, changePercent: -1.21, status: 'down' },
      { symbol: 'PLTM', name: 'GraniteShares Platinum Trust', price: 9.85, change: 0.08, changePercent: 0.82, status: 'up' },
      { symbol: 'PALL', name: 'Aberdeen Physical Palladium', price: 95.40, change: -1.20, changePercent: -1.24, status: 'down' }
    ],
    crypto: [
      { symbol: 'BTC', name: 'Bitcoin', price: 68229.47, change: 3125.80, changePercent: 4.79, status: 'up' },
      { symbol: 'ETH', name: 'Ethereum', price: 2054.38, change: 132.80, changePercent: 6.92, status: 'up' },
      { symbol: 'SOL', name: 'Solana', price: 83.97, change: 6.72, changePercent: 8.72, status: 'up' },
      { symbol: 'HYPE', name: 'Hyperliquid', price: 15.42, change: 0.85, changePercent: 5.83, status: 'up' }
    ]
  };
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const hasFinnhubKey = !!process.env.FINNHUB_API_KEY;
  
  try {
    let indices: MarketItem[] = [];
    let stocks: MarketItem[] = [];
    let commodities: MarketItem[] = [];
    
    // Try Finnhub first if API key is available
    if (hasFinnhubKey) {
      console.log('Using Finnhub API for market data');
      [indices, stocks, commodities] = await Promise.all([
        fetchFinnhubStocks(['SPY', 'QQQ', 'DIA', 'VXX', 'UUP']),
        fetchFinnhubStocks(['TSLA', 'META', 'NVDA', 'GOOGL', 'AMZN', 'PLTR', 'AMAT']),
        fetchFinnhubStocks(['GLD', 'SLV', 'CPER', 'PLTM', 'PALL']) // Gold, Silver, Copper, Platinum, Palladium ETFs
      ]);
    }
    
    // Fallback to Yahoo Finance if Finnhub returns no data
    if (indices.length === 0) {
      console.log('Falling back to Yahoo Finance');
      [indices, stocks] = await Promise.all([
        fetchYahooFinance(['SPY', 'QQQ', 'DIA', 'VXX', 'UUP']),
        fetchYahooFinance(['TSLA', 'META', 'NVDA', 'GOOGL', 'AMZN', 'PLTR'])
      ]);
    }
    
    // Always fetch crypto from CoinGecko
    const crypto = await fetchCryptoPrices();
    
    const fallback = getFallbackData();
    
    // Use live data if available, otherwise fallback
    const hasRealIndices = indices.length > 0;
    const hasRealStocks = stocks.length > 0;
    const hasRealCommodities = commodities.length > 0;
    const hasRealCrypto = crypto.length > 0;
    
    const marketData = {
      indices: hasRealIndices ? indices : fallback.indices,
      stocks: hasRealStocks ? stocks : fallback.stocks,
      commodities: hasRealCommodities ? commodities : fallback.commodities,
      crypto: hasRealCrypto ? crypto : fallback.crypto,
      lastUpdated: timestamp
    };
    
    // Determine data source
    const realCount = [hasRealIndices, hasRealStocks, hasRealCommodities, hasRealCrypto].filter(Boolean).length;
    let source: 'live' | 'partial' | 'fallback';
    if (realCount === 4) source = 'live';
    else if (realCount > 0) source = 'partial';
    else source = 'fallback';
    
    console.log(`Market data: source=${source}, provider=${hasFinnhubKey ? 'finnhub' : 'yahoo'}, indices=${indices.length}, stocks=${stocks.length}, commodities=${commodities.length}, crypto=${crypto.length}`);
    
    return NextResponse.json({ 
      success: true, 
      data: marketData,
      timestamp,
      source,
      provider: hasFinnhubKey ? 'finnhub' : indices.length > 0 ? 'yahoo' : 'fallback'
    });
    
  } catch (error) {
    console.error('Market data error:', error);
    const fallback = getFallbackData();
    
    return NextResponse.json({ 
      success: true, 
      data: {
        indices: fallback.indices,
        stocks: fallback.stocks,
        commodities: fallback.commodities,
        crypto: fallback.crypto,
        lastUpdated: timestamp
      },
      timestamp,
      source: 'fallback',
      provider: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
