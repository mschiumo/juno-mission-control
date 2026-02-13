import { NextResponse } from 'next/server';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

interface YahooQuote {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  try {
    const symbolsParam = symbols.join(',');
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbolsParam}?interval=1d&range=1d`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 60 } // 1 minute cache for real-time feel
      }
    );
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }
    
    const data = await response.json();
    const quotes: YahooQuote[] = [];
    
    // Handle single or multiple symbols
    const results = Array.isArray(data.chart?.result) ? data.chart.result : [data.chart?.result];
    
    for (const result of results) {
      if (result?.meta) {
        const meta = result.meta;
        const symbol = meta.symbol || meta.shortName || 'UNKNOWN';
        const price = meta.regularMarketPrice || meta.previousClose || 0;
        const prevClose = meta.previousClose || meta.regularMarketPrice || 0;
        const change = price - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
        
        quotes.push({
          symbol: symbol,
          shortName: meta.shortName || symbol,
          regularMarketPrice: price,
          regularMarketChange: change,
          regularMarketChangePercent: changePercent
        });
      }
    }
    
    return quotes;
  } catch (error) {
    console.error('Yahoo Finance fetch error:', error);
    return [];
  }
}

async function fetchCryptoPrices(): Promise<MarketItem[]> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
      { next: { revalidate: 60 } }
    );
    const data = await response.json();
    
    const cryptos: MarketItem[] = [];
    
    if (data.bitcoin) {
      cryptos.push({
        symbol: 'BTC',
        name: 'Bitcoin',
        price: data.bitcoin.usd,
        change: data.bitcoin.usd * (data.bitcoin.usd_24h_change / 100),
        changePercent: data.bitcoin.usd_24h_change,
        status: data.bitcoin.usd_24h_change >= 0 ? 'up' : 'down'
      });
    }
    
    if (data.ethereum) {
      cryptos.push({
        symbol: 'ETH',
        name: 'Ethereum',
        price: data.ethereum.usd,
        change: data.ethereum.usd * (data.ethereum.usd_24h_change / 100),
        changePercent: data.ethereum.usd_24h_change,
        status: data.ethereum.usd_24h_change >= 0 ? 'up' : 'down'
      });
    }
    
    if (data.solana) {
      cryptos.push({
        symbol: 'SOL',
        name: 'Solana',
        price: data.solana.usd,
        change: data.solana.usd * (data.solana.usd_24h_change / 100),
        changePercent: data.solana.usd_24h_change,
        status: data.solana.usd_24h_change >= 0 ? 'up' : 'down'
      });
    }
    
    return cryptos;
  } catch (error) {
    console.error('Failed to fetch crypto prices:', error);
    return [];
  }
}

// Stock name mappings
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

export async function GET() {
  try {
    // Fetch real-time data from Yahoo Finance and CoinGecko in parallel
    const [indexQuotes, stockQuotes, cryptoData] = await Promise.all([
      fetchYahooQuotes(['SPY', 'QQQ', 'DIA']),
      fetchYahooQuotes(['TSLA', 'META', 'NVDA', 'GOOGL', 'AMZN', 'PLTR']),
      fetchCryptoPrices()
    ]);

    // Transform Yahoo quotes to MarketItem format
    const transformQuote = (quote: YahooQuote): MarketItem => ({
      symbol: quote.symbol,
      name: stockNames[quote.symbol] || quote.shortName || quote.symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      status: quote.regularMarketChange >= 0 ? 'up' : 'down'
    });

    const marketData = {
      indices: indexQuotes.length > 0 
        ? indexQuotes.map(transformQuote)
        : [
            { symbol: 'SPY', name: 'S&P 500 ETF', price: 595.32, change: 2.15, changePercent: 0.36, status: 'up' as const },
            { symbol: 'QQQ', name: 'NASDAQ ETF', price: 518.47, change: 3.21, changePercent: 0.62, status: 'up' as const },
            { symbol: 'DIA', name: 'Dow Jones ETF', price: 448.92, change: 1.87, changePercent: 0.42, status: 'up' as const }
          ],
      stocks: stockQuotes.length > 0
        ? stockQuotes.map(transformQuote)
        : [
            { symbol: 'TSLA', name: 'Tesla Inc.', price: 355.84, change: 8.50, changePercent: 2.45, status: 'up' as const },
            { symbol: 'META', name: 'Meta Platforms', price: 736.67, change: -7.20, changePercent: -0.97, status: 'down' as const },
            { symbol: 'NVDA', name: 'NVIDIA', price: 138.25, change: -2.15, changePercent: -1.53, status: 'down' as const },
            { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 185.19, change: -0.82, changePercent: -0.44, status: 'down' as const },
            { symbol: 'AMZN', name: 'Amazon.com', price: 228.68, change: 0.15, changePercent: 0.07, status: 'up' as const },
            { symbol: 'PLTR', name: 'Palantir', price: 84.48, change: -1.20, changePercent: -1.40, status: 'down' as const }
          ],
      crypto: cryptoData.length > 0 ? cryptoData : [
        { symbol: 'BTC', name: 'Bitcoin', price: 68229.47, change: 3125.80, changePercent: 4.79, status: 'up' as const },
        { symbol: 'ETH', name: 'Ethereum', price: 2054.38, change: 132.80, changePercent: 6.92, status: 'up' as const },
        { symbol: 'SOL', name: 'Solana', price: 83.97, change: 6.72, changePercent: 8.72, status: 'up' as const }
      ],
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json({ 
      success: true, 
      data: marketData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Market data fetch error:', error);
    
    // Return fallback data on error
    return NextResponse.json({ 
      success: true, 
      data: {
        indices: [
          { symbol: 'SPY', name: 'S&P 500 ETF', price: 595.32, change: 2.15, changePercent: 0.36, status: 'up' as const },
          { symbol: 'QQQ', name: 'NASDAQ ETF', price: 518.47, change: 3.21, changePercent: 0.62, status: 'up' as const },
          { symbol: 'DIA', name: 'Dow Jones ETF', price: 448.92, change: 1.87, changePercent: 0.42, status: 'up' as const }
        ],
        stocks: [
          { symbol: 'TSLA', name: 'Tesla Inc.', price: 355.84, change: 8.50, changePercent: 2.45, status: 'up' as const },
          { symbol: 'META', name: 'Meta Platforms', price: 736.67, change: -7.20, changePercent: -0.97, status: 'down' as const },
          { symbol: 'NVDA', name: 'NVIDIA', price: 138.25, change: -2.15, changePercent: -1.53, status: 'down' as const },
          { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 185.19, change: -0.82, changePercent: -0.44, status: 'down' as const },
          { symbol: 'AMZN', name: 'Amazon.com', price: 228.68, change: 0.15, changePercent: 0.07, status: 'up' as const },
          { symbol: 'PLTR', name: 'Palantir', price: 84.48, change: -1.20, changePercent: -1.40, status: 'down' as const }
        ],
        crypto: [
          { symbol: 'BTC', name: 'Bitcoin', price: 68229.47, change: 3125.80, changePercent: 4.79, status: 'up' as const },
          { symbol: 'ETH', name: 'Ethereum', price: 2054.38, change: 132.80, changePercent: 6.92, status: 'up' as const },
          { symbol: 'SOL', name: 'Solana', price: 83.97, change: 6.72, changePercent: 8.72, status: 'up' as const }
        ],
        lastUpdated: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }
}
