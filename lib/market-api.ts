/**
 * Market Data API utilities (Client-side)
 * 
 * This file contains client-side utilities for market data.
 * The actual API calls are made server-side via /api/market-data route
 * to avoid exposing API keys and handle CORS properly.
 * 
 * Server-side implementation: app/api/market-data/route.ts
 * 
 * Supported Providers (server-side):
 * - Finnhub (free tier: 60 calls/min, real-time US data) - RECOMMENDED
 * - CoinGecko (free tier, no key required for basic crypto data)
 * 
 * Environment Variables Required:
 * - FINNHUB_API_KEY: Get free key at https://finnhub.io/register
 */

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

export interface MarketDataResponse {
  success: boolean;
  data: {
    indices: MarketItem[];
    stocks: MarketItem[];
    crypto: MarketItem[];
    lastUpdated: string;
  };
  timestamp: string;
  source: 'live' | 'partial' | 'fallback';
}

// Default watchlist
export const DEFAULT_WATCHLIST = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];

// Market indices
export const MARKET_INDICES = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'DIA', name: 'Dow Jones' },
  { symbol: 'QQQ', name: 'NASDAQ' }
];

/**
 * Fetch market data from the server-side API
 * This is the recommended way to get market data in components
 */
export async function fetchMarketData(): Promise<MarketDataResponse | null> {
  try {
    const response = await fetch('/api/market-data');
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch market data:', error);
    return null;
  }
}
