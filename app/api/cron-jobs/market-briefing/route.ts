/**
 * Morning Market Briefing Cron Job
 *
 * Runs Mon-Fri at 8:00 AM EST (13:00 UTC).
 * 1. Fetches index/stock quotes from Polygon, crypto from CoinGecko
 * 2. Fetches general market news from Finnhub
 * 3. Fetches real economic calendar + earnings data for upcoming events
 * 4. Sends everything to Claude to produce a concise, structured briefing
 * 5. Caches the structured result in Redis for the UI
 * 6. Posts to cron results, activity log, and Telegram
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  postToCronResults,
  logToActivityLog,
  isMarketOpenToday,
} from '@/lib/cron-helpers';
import { getRedisClient } from '@/lib/redis';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BRIEFING_CACHE_KEY = 'market_briefing_latest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down' | 'flat';
}

interface FinnhubNewsItem {
  category: string;
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
}

const SYMBOL_NAMES: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: 'NASDAQ',
  DIA: 'Dow Jones',
  IWM: 'Russell 2000',
  VIX: 'VIX',
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  TSLA: 'Tesla',
  NVDA: 'NVIDIA',
  META: 'Meta',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
};

// ---------------------------------------------------------------------------
// Polygon — stock & index prices (premium)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchPolygonSnapshots(symbols: string[]): Promise<MarketItem[]> {
  if (!POLYGON_API_KEY) return [];
  try {
    const tickerParam = symbols.join(',');
    const res = await fetch(
      `https://api.polygon.io/v3/snapshot?ticker.any_of=${tickerParam}&apiKey=${POLYGON_API_KEY}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      console.warn(`[MarketBriefing] Polygon snapshot error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];

    return data.results
      .map((snap: any) => {
        const symbol = snap.ticker as string;
        const price = snap.session?.close ?? snap.session?.price ?? 0;
        const change = snap.session?.change ?? 0;
        const changePercent = snap.session?.change_percent ?? 0;
        if (price <= 0) return null;
        return {
          symbol,
          name: SYMBOL_NAMES[symbol] || symbol,
          price: +price.toFixed(2),
          change: +change.toFixed(2),
          changePercent: +changePercent.toFixed(2),
          status: change >= 0 ? 'up' : 'down',
        } as MarketItem;
      })
      .filter((item: MarketItem | null): item is MarketItem => item !== null);
  } catch (err) {
    console.error('[MarketBriefing] Polygon snapshot error:', err);
    return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// CoinGecko — crypto prices
// ---------------------------------------------------------------------------

async function fetchCoinGeckoPrices(): Promise<MarketItem[]> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
    );
    if (!res.ok) {
      console.warn(`[MarketBriefing] CoinGecko error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const items: MarketItem[] = [];
    const coins = [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
      { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
    ];
    for (const coin of coins) {
      const d = data[coin.id];
      if (!d?.usd) continue;
      const pctChange = d.usd_24h_change || 0;
      items.push({
        symbol: coin.symbol,
        name: coin.name,
        price: d.usd,
        change: +(d.usd * (pctChange / 100)).toFixed(2),
        changePercent: +pctChange.toFixed(2),
        status: pctChange >= 0 ? 'up' : 'down',
      });
    }
    return items;
  } catch (err) {
    console.error('[MarketBriefing] CoinGecko error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Finnhub — news + economic calendar + earnings
// ---------------------------------------------------------------------------

async function fetchMarketNews(): Promise<FinnhubNewsItem[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const articles: FinnhubNewsItem[] = await res.json();
    return articles.slice(0, 20);
  } catch {
    return [];
  }
}

async function fetchEconomicCalendar(): Promise<string[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const endStr = endDate.toISOString().split('T')[0];

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${todayStr}&to=${endStr}&token=${FINNHUB_API_KEY}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?.economicCalendar ?? [];
    if (!Array.isArray(events)) return [];

    return events
      .filter((e: any) => e.country === 'US' && e.event) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const parts = [`${e.event} (${e.country})`];
        if (e.estimate !== null && e.estimate !== undefined) parts.push(`est. ${e.estimate}${e.unit || ''}`);
        if (e.time) parts.push(e.time);
        return `[${todayStr === e.date ? 'Today' : e.date}] ${parts.join(' — ')}`;
      })
      .slice(0, 15);
  } catch {
    return [];
  }
}

async function fetchUpcomingEarnings(): Promise<string[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const endStr = endDate.toISOString().split('T')[0];

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${todayStr}&to=${endStr}&token=${FINNHUB_API_KEY}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const earnings = data?.earningsCalendar ?? [];
    if (!Array.isArray(earnings)) return [];

    const notable = new Set([
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
      'JPM', 'GS', 'BAC', 'MS', 'V', 'MA', 'AMD', 'INTC', 'QCOM', 'AVGO',
      'NFLX', 'DIS', 'UNH', 'JNJ', 'LLY', 'XOM', 'CVX', 'COST', 'WMT',
      'NKE', 'SBUX', 'CRM', 'ORCL', 'NOW', 'PLTR', 'LULU', 'MU', 'ADBE',
    ]);

    return earnings
      .filter((e: any) => notable.has(e.symbol)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const timing = e.hour === 'bmo' ? 'before open' : e.hour === 'amc' ? 'after close' : '';
        return `[${todayStr === e.date ? 'Today' : e.date}] ${e.symbol} earnings Q${e.quarter} ${e.year}${timing ? ` (${timing})` : ''}`;
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AI briefing generation
// ---------------------------------------------------------------------------

export interface BriefingData {
  date: string;
  generatedAt: string;
  indices: MarketItem[];
  stocks: MarketItem[];
  crypto: MarketItem[];
  aiSummary: {
    marketOverview: string;
    bigMovers: { symbol: string; move: string; reason: string }[];
    newsHighlights: { headline: string; url: string }[];
    upcomingEvents: string[];
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  };
}

async function generateAIBriefing(
  indices: MarketItem[],
  stocks: MarketItem[],
  crypto: MarketItem[],
  news: FinnhubNewsItem[],
  calendarEvents: string[],
  earningsEvents: string[],
): Promise<BriefingData['aiSummary']> {
  if (!ANTHROPIC_API_KEY) {
    return {
      marketOverview: 'AI summary unavailable — ANTHROPIC_API_KEY not configured.',
      bigMovers: [],
      newsHighlights: news.slice(0, 5).map((n) => ({ headline: n.headline, url: n.url })),
      upcomingEvents: [...calendarEvents.slice(0, 3), ...earningsEvents.slice(0, 2)],
      sentiment: 'neutral',
    };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const priceContext = [
    '## Index Prices',
    ...indices.map(
      (i) =>
        `${i.name} (${i.symbol}): $${i.price.toFixed(2)} ${i.change >= 0 ? '+' : ''}${i.change} (${i.change >= 0 ? '+' : ''}${i.changePercent}%)`,
    ),
    '',
    '## Key Stocks',
    ...stocks.map(
      (s) =>
        `${s.name} (${s.symbol}): $${s.price.toFixed(2)} ${s.change >= 0 ? '+' : ''}${s.change} (${s.change >= 0 ? '+' : ''}${s.changePercent}%)`,
    ),
    '',
    '## Crypto',
    ...crypto.map(
      (c) =>
        `${c.name} (${c.symbol}): $${c.price.toLocaleString()} ${c.change >= 0 ? '+' : ''}${c.change} (${c.change >= 0 ? '+' : ''}${c.changePercent}%)`,
    ),
  ].join('\n');

  const newsContext = news
    .slice(0, 15)
    .map((n, i) => `${i + 1}. [${n.source}] ${n.headline}\n   URL: ${n.url}\n   ${n.summary.slice(0, 200)}`)
    .join('\n');

  const eventsContext = [
    ...(calendarEvents.length > 0
      ? ['## Economic Calendar (next 3 days)', ...calendarEvents]
      : ['## Economic Calendar', 'No upcoming economic events found.']),
    '',
    ...(earningsEvents.length > 0
      ? ['## Upcoming Earnings', ...earningsEvents]
      : []),
  ].join('\n');

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a concise financial market analyst. Today is ${todayStr}.

Given the market data, news, and scheduled events below, produce a structured morning briefing as JSON.

${priceContext}

## Recent News Headlines
${newsContext}

${eventsContext}

Return ONLY valid JSON with this exact structure:
{
  "marketOverview": "2-3 sentence summary of overall market conditions and overnight moves",
  "bigMovers": [{"symbol": "TICKER", "move": "+X.X%", "reason": "brief reason"}],
  "newsHighlights": [{"headline": "rewritten headline", "url": "original article URL from source"}],
  "upcomingEvents": ["event that could move markets today or this week"],
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed"
}

Rules:
- bigMovers: 3-5 stocks/assets with the most notable moves. Include the percentage move and a short reason.
- newsHighlights: Top 3-5 most market-relevant headlines, rewritten concisely. For each, include the "url" field copied exactly from the corresponding source article above.
- upcomingEvents: ONLY include events from the Economic Calendar and Upcoming Earnings sections provided above. Do NOT invent or guess at events, speaker schedules, or data releases that are not explicitly listed. If no events are provided, return an empty array.
- Be specific with numbers. No generic filler.
- Return ONLY valid JSON, no markdown, no preamble.`,
      },
    ],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Strip markdown code fences (```json ... ```) that the model sometimes adds
  const text = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    return {
      marketOverview: text || 'Failed to parse AI response.',
      bigMovers: [],
      newsHighlights: news.slice(0, 5).map((n) => ({ headline: n.headline, url: n.url })),
      upcomingEvents: [],
      sentiment: 'neutral',
    };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('preview') === 'true';
    const force = searchParams.get('force') === 'true';

    console.log('[MarketBriefing] Generating morning market briefing...');

    if (!force && !isMarketOpenToday()) {
      const msg = '🪐 Market is closed today (weekend or holiday). No morning briefing needed.';
      await postToCronResults('Morning Market Briefing', msg, 'market');
      await logToActivityLog('Morning Market Briefing', 'Market closed', 'cron');
      return NextResponse.json({
        success: true,
        data: { marketOpen: false, message: msg },
        durationMs: Date.now() - startTime,
      });
    }

    // Fetch all data in parallel
    const [indices, stocks, crypto, news, calendarEvents, earningsEvents] = await Promise.all([
      fetchPolygonSnapshots(['SPY', 'QQQ', 'DIA', 'VIX']),
      fetchPolygonSnapshots(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'AMZN', 'GOOGL']),
      fetchCoinGeckoPrices(),
      fetchMarketNews(),
      fetchEconomicCalendar(),
      fetchUpcomingEarnings(),
    ]);

    // Generate AI summary
    const aiSummary = await generateAIBriefing(indices, stocks, crypto, news, calendarEvents, earningsEvents);

    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const briefing: BriefingData = {
      date: today,
      generatedAt: new Date().toISOString(),
      indices,
      stocks,
      crypto,
      aiSummary,
    };

    // Cache in Redis for the UI
    const redis = await getRedisClient();
    await redis.set(BRIEFING_CACHE_KEY, JSON.stringify(briefing));

    if (preview) {
      return NextResponse.json({ success: true, data: briefing, durationMs: Date.now() - startTime });
    }

    // Post to cron results and activity log
    await Promise.all([
      postToCronResults(
        'Morning Market Briefing',
        `${briefing.aiSummary.marketOverview}\n\nSentiment: ${briefing.aiSummary.sentiment}`,
        'market',
      ),
      logToActivityLog(
        'Morning Market Briefing',
        `Generated with ${indices.length} indices, ${stocks.length} stocks, AI summary`,
        'cron',
      ),
    ]);

    const duration = Date.now() - startTime;
    console.log(`[MarketBriefing] Briefing generated in ${duration}ms`);

    return NextResponse.json({
      success: true,
      data: { indices: indices.length, stocks: stocks.length, crypto: crypto.length, durationMs: duration },
    });
  } catch (error) {
    console.error('[MarketBriefing] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToActivityLog('Morning Market Briefing Failed', errorMessage, 'cron');
    return NextResponse.json(
      { success: false, error: 'Failed to generate market briefing', message: errorMessage },
      { status: 500 },
    );
  }
}
