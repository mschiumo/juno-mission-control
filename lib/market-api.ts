/**
 * Market Data API utilities
 * 
 * Supports multiple providers:
 * - Alpha Vantage (free tier available)
 * - Finnhub (free tier available)
 * - Yahoo Finance (unofficial)
 * 
 * Set your preferred provider in .env.local
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER || 'finnhub';

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

/**
 * Fetch stock quote from Finnhub
 */
async function fetchFromFinnhub(symbol: string): Promise<StockQuote | null> {
  if (!FINNHUB_API_KEY) return null;

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    const data = await response.json();

    return {
      symbol,
      price: data.c,
      change: data.c - data.pc,
      changePercent: ((data.c - data.pc) / data.pc) * 100,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to fetch ${symbol} from Finnhub:`, error);
    return null;
  }
}

/**
 * Fetch stock quote from Alpha Vantage
 */
async function fetchFromAlphaVantage(symbol: string): Promise<StockQuote | null> {
  if (!ALPHA_VANTAGE_API_KEY) return null;

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
    );
    const data = await response.json();
    const quote = data['Global Quote'];

    if (!quote) return null;

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    return {
      symbol,
      price,
      change,
      changePercent,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to fetch ${symbol} from Alpha Vantage:`, error);
    return null;
  }
}

/**
 * Fetch stock quote using configured provider
 */
export async function fetchStockQuote(symbol: string): Promise<StockQuote | null> {
  switch (MARKET_DATA_PROVIDER) {
    case 'finnhub':
      return fetchFromFinnhub(symbol);
    case 'alphavantage':
      return fetchFromAlphaVantage(symbol);
    default:
      console.error('Unknown market data provider:', MARKET_DATA_PROVIDER);
      return null;
  }
}

/**
 * Fetch multiple stock quotes
 */
export async function fetchMultipleQuotes(symbols: string[]): Promise<StockQuote[]> {
  const quotes = await Promise.all(
    symbols.map(symbol => fetchStockQuote(symbol))
  );
  return quotes.filter((q): q is StockQuote => q !== null);
}

// Default watchlist
export const DEFAULT_WATCHLIST = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];

// Market indices
export const MARKET_INDICES = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'DIA', name: 'Dow Jones' },
  { symbol: 'QQQ', name: 'NASDAQ' }
];
