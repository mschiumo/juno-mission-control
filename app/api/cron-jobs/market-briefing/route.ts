/**
 * Morning Market Briefing Cron Job
 *
 * Runs Mon-Fri at 8:00 AM EST (13:00 UTC).
 * 1. Fetches index, stock, and crypto quotes from Finnhub
 * 2. Fetches general market news from Finnhub
 * 3. Sends everything to Claude to produce a concise, structured briefing
 * 4. Caches the structured result in Redis for the UI
 * 5. Posts to cron results, activity log, and Telegram
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  postToCronResults,
  sendTelegramIfNeeded,
  logToActivityLog,
  formatDate,
  isMarketOpenToday,
} from '@/lib/cron-helpers';
import { getRedisClient } from '@/lib/redis';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BRIEFING_CACHE_KEY = 'market_briefing_latest';

// ---------------------------------------------------------------------------
// Finnhub helpers
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

async function fetchQuote(symbol: string): Promise<MarketItem | null> {
  if (!FINNHUB_API_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.c === 0 || d.pc === 0) return null;
    const change = d.d ?? d.c - d.pc;
    const changePercent = d.dp ?? (change / d.pc) * 100;
    return {
      symbol,
      name: SYMBOL_NAMES[symbol] || symbol,
      price: d.c,
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
      status: change >= 0 ? 'up' : 'down',
    };
  } catch {
    return null;
  }
}

async function fetchCryptoQuote(symbol: string): Promise<MarketItem | null> {
  if (!FINNHUB_API_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=BINANCE:${symbol}USDT&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.c === 0) return null;
    const change = d.d ?? d.c - d.pc;
    const changePercent = d.dp ?? (d.pc ? (change / d.pc) * 100 : 0);
    return {
      symbol,
      name: SYMBOL_NAMES[symbol] || symbol,
      price: d.c,
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
      status: change >= 0 ? 'up' : 'down',
    };
  } catch {
    return null;
  }
}

async function fetchMarketNews(): Promise<FinnhubNewsItem[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return [];
    const articles: FinnhubNewsItem[] = await res.json();
    // Return last 20 articles (most recent)
    return articles.slice(0, 20);
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
    newsHighlights: string[];
    upcomingEvents: string[];
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  };
}

async function generateAIBriefing(
  indices: MarketItem[],
  stocks: MarketItem[],
  crypto: MarketItem[],
  news: FinnhubNewsItem[],
): Promise<BriefingData['aiSummary']> {
  if (!ANTHROPIC_API_KEY) {
    return {
      marketOverview: 'AI summary unavailable — ANTHROPIC_API_KEY not configured.',
      bigMovers: [],
      newsHighlights: news.slice(0, 5).map((n) => n.headline),
      upcomingEvents: [],
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
    .map((n, i) => `${i + 1}. [${n.source}] ${n.headline}\n   ${n.summary.slice(0, 200)}`)
    .join('\n');

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

Given the market data and news below, produce a structured morning briefing as JSON.

${priceContext}

## Recent News Headlines
${newsContext}

Return ONLY valid JSON with this exact structure:
{
  "marketOverview": "2-3 sentence summary of overall market conditions and overnight moves",
  "bigMovers": [{"symbol": "TICKER", "move": "+X.X%", "reason": "brief reason"}],
  "newsHighlights": ["headline 1", "headline 2", "headline 3"],
  "upcomingEvents": ["event that could move markets today or this week"],
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed"
}

Rules:
- bigMovers: 3-5 stocks/assets with the most notable moves. Include the percentage move and a short reason.
- newsHighlights: Top 3-5 most market-relevant headlines, rewritten concisely.
- upcomingEvents: Any scheduled events today or this week that could move markets significantly (Fed decisions, earnings, economic data releases, policy announcements). If none are obvious from the news, note the next known major event.
- Be specific with numbers. No generic filler.
- Return ONLY valid JSON, no markdown, no preamble.`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    return JSON.parse(text);
  } catch {
    return {
      marketOverview: text || 'Failed to parse AI response.',
      bigMovers: [],
      newsHighlights: news.slice(0, 5).map((n) => n.headline),
      upcomingEvents: [],
      sentiment: 'neutral',
    };
  }
}

// ---------------------------------------------------------------------------
// Telegram formatting
// ---------------------------------------------------------------------------

function getEmoji(pct: number): string {
  if (pct >= 2) return '🚀';
  if (pct >= 1) return '🟢';
  if (pct > 0) return '📈';
  if (pct <= -2) return '🔴';
  if (pct <= -1) return '🟥';
  if (pct < 0) return '📉';
  return '➡️';
}

function buildTelegramMessage(briefing: BriefingData): string {
  const lines: string[] = [
    `🪐 <b>Morning Market Briefing</b> — ${formatDate()}`,
    '',
    `<i>${briefing.aiSummary.marketOverview}</i>`,
    '',
  ];

  if (briefing.indices.length > 0) {
    lines.push('<b>MAJOR INDICES</b>');
    for (const i of briefing.indices) {
      const sign = i.change >= 0 ? '+' : '';
      lines.push(`${getEmoji(i.changePercent)} ${i.name}: $${i.price.toFixed(2)} ${sign}${i.changePercent}%`);
    }
    lines.push('');
  }

  if (briefing.crypto.length > 0) {
    lines.push('<b>CRYPTO</b>');
    for (const c of briefing.crypto) {
      const sign = c.change >= 0 ? '+' : '';
      lines.push(`${getEmoji(c.changePercent)} ${c.name}: $${c.price.toLocaleString()} ${sign}${c.changePercent}%`);
    }
    lines.push('');
  }

  if (briefing.aiSummary.bigMovers.length > 0) {
    lines.push('<b>BIG MOVERS</b>');
    for (const m of briefing.aiSummary.bigMovers) {
      lines.push(`• ${m.symbol} ${m.move} — ${m.reason}`);
    }
    lines.push('');
  }

  if (briefing.aiSummary.upcomingEvents.length > 0) {
    lines.push('<b>WATCH TODAY</b>');
    for (const e of briefing.aiSummary.upcomingEvents) {
      lines.push(`⚡ ${e}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('preview') === 'true';

    console.log('[MarketBriefing] Generating morning market briefing...');

    if (!isMarketOpenToday()) {
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
    const [indicesRaw, stocksRaw, cryptoRaw, news] = await Promise.all([
      Promise.all([fetchQuote('SPY'), fetchQuote('QQQ'), fetchQuote('DIA'), fetchQuote('VIX')]),
      Promise.all([
        fetchQuote('AAPL'),
        fetchQuote('NVDA'),
        fetchQuote('MSFT'),
        fetchQuote('TSLA'),
        fetchQuote('META'),
        fetchQuote('AMZN'),
        fetchQuote('GOOGL'),
      ]),
      Promise.all([fetchCryptoQuote('BTC'), fetchCryptoQuote('ETH')]),
      fetchMarketNews(),
    ]);

    const indices = indicesRaw.filter((i): i is MarketItem => i !== null);
    const stocks = stocksRaw.filter((s): s is MarketItem => s !== null);
    const crypto = cryptoRaw.filter((c): c is MarketItem => c !== null);

    // Generate AI summary
    const aiSummary = await generateAIBriefing(indices, stocks, crypto, news);

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

    // Build Telegram message
    const telegramMsg = buildTelegramMessage(briefing);

    // Post to cron results, activity log, Telegram in parallel
    await Promise.all([
      postToCronResults('Morning Market Briefing', telegramMsg, 'market'),
      logToActivityLog(
        'Morning Market Briefing',
        `Generated with ${indices.length} indices, ${stocks.length} stocks, AI summary`,
        'cron',
      ),
      sendTelegramIfNeeded(telegramMsg),
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
