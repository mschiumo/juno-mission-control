import { NextResponse } from 'next/server';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
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
 * Fetches stock data from Yahoo Finance (unofficial but widely used)
 * Uses the public crumb/cookie-less endpoint
 */
async function fetchYahooFinance(symbols: string[]): Promise<MarketItem[]> {
  try {
    const symbolsParam = symbols.join(',');
    // Use the v8 chart endpoint which is more reliable
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
    
    // Handle single or multiple results
    const resultArray = Array.isArray(data.chart?.result) 
      ? data.chart.result 
      : data.chart?.result ? [data.chart.result] : [];
    
    for (const result of resultArray) {
      if (!result?.meta) continue;
      
      const meta = result.meta;
      const symbol = meta.symbol || meta.shortName || 'UNKNOWN';
      const price = meta.regularMarketPrice || meta.previousClose || 0;
      const prevClose = meta.previousClose || meta.regularMarketPrice || price;
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
 * Alternative: Use Twelve Data API (free tier: 8 calls/day, no key required for some endpoints)
 * Or try other free sources
 */
async function fetchAlternativeStocks(symbols: string[]): Promise<MarketItem[]> {
  // Try Yahoo Finance first
  const yahooData = await fetchYahooFinance(symbols);
  if (yahooData.length > 0) {
    return yahooData;
  }
  
  // If Yahoo fails, return empty to trigger fallback
  return [];
}

/**
 * Fetches cryptocurrency prices from CoinGecko API
 * Free tier, no API key required
 */
async function fetchCryptoPrices(): Promise<MarketItem[]> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
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
    
    return cryptos;
  } catch (error) {
    console.error('CoinGecko error:', error);
    return [];
  }
}

/**
 * Fallback mock data when all APIs fail
 */
function getFallbackData(): { indices: MarketItem[]; stocks: MarketItem[]; crypto: MarketItem[] } {
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
    ],
    crypto: [
      { symbol: 'BTC', name: 'Bitcoin', price: 68229.47, change: 3125.80, changePercent: 4.79, status: 'up' },
      { symbol: 'ETH', name: 'Ethereum', price: 2054.38, change: 132.80, changePercent: 6.92, status: 'up' },
      { symbol: 'SOL', name: 'Solana', price: 83.97, change: 6.72, changePercent: 8.72, status: 'up' }
    ]
  };
}

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    // Fetch all data in parallel
    const [indices, stocks, crypto] = await Promise.all([
      fetchAlternativeStocks(['SPY', 'QQQ', 'DIA']),
      fetchAlternativeStocks(['TSLA', 'META', 'NVDA', 'GOOGL', 'AMZN', 'PLTR']),
      fetchCryptoPrices()
    ]);
    
    const fallback = getFallbackData();
    
    // Use live data if available, otherwise fallback
    const hasRealIndices = indices.length > 0;
    const hasRealStocks = stocks.length > 0;
    const hasRealCrypto = crypto.length > 0;
    
    const marketData = {
      indices: hasRealIndices ? indices : fallback.indices,
      stocks: hasRealStocks ? stocks : fallback.stocks,
      crypto: hasRealCrypto ? crypto : fallback.crypto,
      lastUpdated: timestamp
    };
    
    // Determine data source
    const realCount = [hasRealIndices, hasRealStocks, hasRealCrypto].filter(Boolean).length;
    const source = realCount === 3 ? 'live' : realCount > 0 ? 'partial' : 'fallback';
    
    console.log(`Market data: source=${source}, indices=${indices.length}, stocks=${stocks.length}, crypto=${crypto.length}`);
    
    return NextResponse.json({ 
      success: true, 
      data: marketData,
      timestamp,
      source
    });
    
  } catch (error) {
    console.error('Market data error:', error);
    const fallback = getFallbackData();
    
    return NextResponse.json({ 
      success: true, 
      data: {
        indices: fallback.indices,
        stocks: fallback.stocks,
        crypto: fallback.crypto,
        lastUpdated: timestamp
      },
      timestamp,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
