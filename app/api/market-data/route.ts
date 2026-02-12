import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder market data
  // In production, this would fetch from a market data API
  const marketData = {
    indices: [
      {
        symbol: 'SPX',
        name: 'S&P 500',
        price: 4783.35,
        change: 25.48,
        changePercent: 0.54,
        status: 'up'
      },
      {
        symbol: 'DJI',
        name: 'Dow Jones',
        price: 37545.33,
        change: 156.87,
        changePercent: 0.42,
        status: 'up'
      },
      {
        symbol: 'IXIC',
        name: 'NASDAQ',
        price: 15074.57,
        change: -12.34,
        changePercent: -0.08,
        status: 'down'
      }
    ],
    stocks: [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 185.92,
        change: 2.15,
        changePercent: 1.17,
        status: 'up'
      },
      {
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        price: 141.80,
        change: -0.92,
        changePercent: -0.64,
        status: 'down'
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft',
        price: 415.26,
        change: 5.43,
        changePercent: 1.32,
        status: 'up'
      }
    ],
    crypto: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 42567.89,
        change: 1234.56,
        changePercent: 2.99,
        status: 'up'
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        price: 2567.34,
        change: -45.21,
        changePercent: -1.73,
        status: 'down'
      }
    ],
    lastUpdated: new Date().toISOString()
  };

  return NextResponse.json({ 
    success: true, 
    data: marketData,
    timestamp: new Date().toISOString()
  });
}
