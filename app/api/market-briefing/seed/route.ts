/**
 * Seed a sample market briefing into Redis for UI testing.
 *
 * GET /api/market-briefing/seed
 *
 * Remove this route before merging to main.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const BRIEFING_CACHE_KEY = 'market_briefing_latest';

const SAMPLE_BRIEFING = {
  date: '3/27/2026',
  generatedAt: '2026-03-27T13:00:12.000Z',
  indices: [
    { symbol: 'SPY', name: 'S&P 500', price: 571.83, change: -3.42, changePercent: -0.59, status: 'down' as const },
    { symbol: 'QQQ', name: 'NASDAQ', price: 487.21, change: -5.87, changePercent: -1.19, status: 'down' as const },
    { symbol: 'DIA', name: 'Dow Jones', price: 422.56, change: 0.78, changePercent: 0.18, status: 'up' as const },
    { symbol: 'VIX', name: 'VIX', price: 18.34, change: 1.52, changePercent: 9.04, status: 'up' as const },
  ],
  stocks: [
    { symbol: 'AAPL', name: 'Apple', price: 223.45, change: -1.12, changePercent: -0.5, status: 'down' as const },
    { symbol: 'NVDA', name: 'NVIDIA', price: 118.62, change: -4.38, changePercent: -3.56, status: 'down' as const },
    { symbol: 'MSFT', name: 'Microsoft', price: 416.89, change: 1.23, changePercent: 0.3, status: 'up' as const },
    { symbol: 'TSLA', name: 'Tesla', price: 278.34, change: -8.91, changePercent: -3.1, status: 'down' as const },
    { symbol: 'META', name: 'Meta', price: 612.45, change: 3.78, changePercent: 0.62, status: 'up' as const },
    { symbol: 'AMZN', name: 'Amazon', price: 198.32, change: -0.45, changePercent: -0.23, status: 'down' as const },
    { symbol: 'GOOGL', name: 'Alphabet', price: 171.56, change: -2.14, changePercent: -1.23, status: 'down' as const },
  ],
  crypto: [
    { symbol: 'BTC', name: 'Bitcoin', price: 87245, change: -1830, changePercent: -2.06, status: 'down' as const },
    { symbol: 'ETH', name: 'Ethereum', price: 2048, change: -89, changePercent: -4.16, status: 'down' as const },
  ],
  aiSummary: {
    marketOverview:
      'Markets are under pressure this morning as risk-off sentiment dominates ahead of tomorrow\'s PCE inflation print. Tech is leading the selloff with NASDAQ down over 1%, while the Dow holds up on defensive rotation. VIX spiked 9% overnight signaling elevated hedging demand.',
    bigMovers: [
      { symbol: 'NVDA', move: '-3.56%', reason: 'Downgraded by Morgan Stanley on AI capex deceleration concerns' },
      { symbol: 'TSLA', move: '-3.10%', reason: 'Q1 delivery estimates cut by multiple analysts; EU tariff headwinds' },
      { symbol: 'ETH', move: '-4.16%', reason: 'Broad crypto weakness as risk assets sell off; ETH/BTC ratio at 3-month low' },
      { symbol: 'META', move: '+0.62%', reason: 'Bucking the trend on strong Reels ad revenue data from internal metrics leak' },
    ],
    newsHighlights: [
      'Core PCE preview: economists expect 2.7% YoY, hotter than Fed\'s 2.5% target — release Friday 8:30 AM',
      'Morgan Stanley downgrades NVIDIA to Equal Weight, citing peak AI infrastructure spending cycle',
      'Treasury 10Y yield rises to 4.38% as rate cut expectations pushed to September',
      'EU finalizes 25% tariff on US auto imports effective April 15, Tesla and GM most exposed',
      'Bitcoin drops below $88K as crypto ETF outflows accelerate for third consecutive week',
    ],
    upcomingEvents: [
      'Core PCE Price Index release tomorrow (Fri) at 8:30 AM ET — consensus 2.7% YoY',
      'Fed Governor Waller speaks today at 1:00 PM ET on monetary policy outlook',
      'Q4 GDP final revision today at 8:30 AM ET — expected 3.2%',
      'Lululemon (LULU) earnings after close today',
    ],
    sentiment: 'bearish' as const,
  },
};

export async function GET() {
  try {
    const redis = await getRedisClient();
    await redis.set(BRIEFING_CACHE_KEY, JSON.stringify(SAMPLE_BRIEFING));

    // Also clear any "read" marker so the unread indicator shows
    await redis.del('market_briefing_last_read');

    return NextResponse.json({ success: true, message: 'Sample briefing seeded' });
  } catch (error) {
    console.error('[MarketBriefing] Failed to seed sample:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
