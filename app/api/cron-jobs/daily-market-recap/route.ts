/**
 * Daily Market Recap Cron Job
 *
 * Runs Mon-Fri at 5:00 PM EDT (21:00 UTC) — after the close, the bookend to
 * the morning market briefing.
 * 1. Fetches closing index/stock quotes from Polygon, crypto from CoinGecko
 * 2. Fetches the session's top gainers/losers from Polygon
 * 3. Fetches the day's market news, economic data releases (with actuals),
 *    and earnings results from Finnhub
 * 4. Sends everything to Claude to produce a structured recap of the market day
 * 5. Caches the structured result in Redis
 * 6. Emails subscribers (Gold+ feature, enforced at send time) and posts to
 *    cron results + activity log
 *
 * Query params (route is gated by CRON_SECRET in middleware.ts):
 *   ?preview=true — return the generated recap as JSON, send no emails
 *   ?test=true    — send the email only to the owner (sample/verification)
 *   ?force=true   — run even when the market was closed today
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  postToCronResults,
  logToActivityLog,
  isMarketOpenToday,
  sendEmailsToSubscribers,
} from '@/lib/cron-helpers';
import { getRedisClient } from '@/lib/redis';
import {
  fetchGainersAndLosers,
  isETFOrDerivative,
  isLikelyADRBySymbol,
} from '@/lib/gap-scanner-polygon';
import type { DailyRecapAiSummary } from '@/lib/emails/DailyRecapEmail';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RECAP_CACHE_KEY = 'daily_recap_latest';

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

interface DayMover {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
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
  SOL: 'Solana',
};

// ---------------------------------------------------------------------------
// Polygon — closing stock & index prices
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
      console.warn(`[DailyRecap] Polygon snapshot error: ${res.status}`);
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
    console.error('[DailyRecap] Polygon snapshot error:', err);
    return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Polygon — the session's top gainers and losers
// ---------------------------------------------------------------------------

async function fetchTopMovers(): Promise<{ gainers: DayMover[]; losers: DayMover[] }> {
  try {
    const snapshots = await fetchGainersAndLosers();

    const movers = snapshots
      .filter((snap) => {
        if (isETFOrDerivative(snap.ticker)) return false;
        if (isLikelyADRBySymbol(snap.ticker)) return false;
        const price = snap.day?.c || snap.lastTrade?.p || 0;
        const volume = snap.day?.v || 0;
        // Skip illiquid penny movers — they dominate the raw Polygon lists
        // but are noise for a market-day recap.
        return price >= 5 && volume >= 1_000_000 && typeof snap.todaysChangePerc === 'number';
      })
      .map((snap) => ({
        symbol: snap.ticker,
        price: +(snap.day?.c || snap.lastTrade?.p || 0).toFixed(2),
        changePercent: +(snap.todaysChangePerc as number).toFixed(1),
        volume: snap.day?.v || 0,
      }));

    const gainers = movers
      .filter((m) => m.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 8);
    const losers = movers
      .filter((m) => m.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 8);

    return { gainers, losers };
  } catch (err) {
    console.error('[DailyRecap] Top movers error:', err);
    return { gainers: [], losers: [] };
  }
}

// ---------------------------------------------------------------------------
// CoinGecko — crypto prices
// ---------------------------------------------------------------------------

async function fetchCoinGeckoPrices(): Promise<MarketItem[]> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
    );
    if (!res.ok) {
      console.warn(`[DailyRecap] CoinGecko error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const items: MarketItem[] = [];
    const coins = [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
      { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
      { id: 'solana', symbol: 'SOL', name: 'Solana' },
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
    console.error('[DailyRecap] CoinGecko error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Finnhub — news + today's economic releases + earnings
// ---------------------------------------------------------------------------

// Keywords that indicate market/financial relevance (aligned with the briefing)
const MARKET_KEYWORDS = [
  // Fed & rates
  'fed', 'fomc', 'federal reserve', 'interest rate', 'rate hike', 'rate cut', 'jerome powell', 'monetary policy',
  // Macro & policy
  'cpi', 'inflation', 'jobs report', 'unemployment', 'gdp', 'non-farm', 'nfp', 'retail sales', 'pmi',
  'ism', 'economic growth', 'tariff', 'fiscal policy', 'regulation', 'trade war', 'sanctions',
  // M&A
  'merger', 'acquisition', 'buyout', 'takeover', 'ipo',
  // Earnings & markets
  'earnings', 'revenue', 'profit', 'quarterly results', 'guidance', 'outlook', 'beats', 'misses',
  'stock', 'shares', 'equit', 'index', 'dow', 'nasdaq', 's&p', 'wall street', 'rally', 'sell-off',
  'bull', 'bear', 'volatility', 'treasury', 'bond', 'yield', 'oil', 'crude', 'gold', 'commodit',
  // AI & tech (market-relevant)
  'nvidia', 'semiconductor', 'chips act', 'ai chip',
  // Crypto
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 'defi', 'etf',
];

function isMarketRelevant(article: FinnhubNewsItem): boolean {
  const text = `${article.headline} ${article.summary}`.toLowerCase();
  return MARKET_KEYWORDS.some((kw) => text.includes(kw));
}

async function fetchTodaysMarketNews(): Promise<FinnhubNewsItem[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const [generalRes, cryptoRes] = await Promise.all([
      fetch(
        `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
        { cache: 'no-store' },
      ),
      fetch(
        `https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB_API_KEY}`,
        { cache: 'no-store' },
      ),
    ]);

    const articles: FinnhubNewsItem[] = [];
    if (generalRes.ok) {
      const data = await generalRes.json();
      if (Array.isArray(data)) articles.push(...data);
    }
    if (cryptoRes.ok) {
      const data = await cryptoRes.json();
      if (Array.isArray(data)) articles.push(...data);
    }

    // A recap covers the market day: keep only articles from the last 24 hours.
    const cutoff = Date.now() / 1000 - 24 * 60 * 60;
    const relevant = articles.filter(
      (a) => a.datetime >= cutoff && isMarketRelevant(a),
    );
    return relevant.slice(0, 25);
  } catch {
    return [];
  }
}

const etDateStr = (d: Date) =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

/**
 * Today's US economic releases with actual vs estimate — the macro recap —
 * plus the next two days of scheduled releases for the "looking ahead" section.
 */
async function fetchEconomicData(): Promise<{ today: string[]; upcoming: string[] }> {
  if (!FINNHUB_API_KEY) return { today: [], upcoming: [] };
  try {
    const now = new Date();
    const todayStr = etDateStr(now);
    const endStr = etDateStr(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${todayStr}&to=${endStr}&token=${FINNHUB_API_KEY}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return { today: [], upcoming: [] };
    const data = await res.json();
    const events = data?.economicCalendar ?? [];
    if (!Array.isArray(events)) return { today: [], upcoming: [] };

    const today: string[] = [];
    const upcoming: string[] = [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const e of events as any[]) {
      if (e.country !== 'US' || !e.event) continue;
      const isToday = e.date?.startsWith(todayStr);
      if (isToday && e.actual !== null && e.actual !== undefined) {
        const parts = [`${e.event}: actual ${e.actual}${e.unit || ''}`];
        if (e.estimate !== null && e.estimate !== undefined) parts.push(`est. ${e.estimate}${e.unit || ''}`);
        if (e.prev !== null && e.prev !== undefined) parts.push(`prev. ${e.prev}${e.unit || ''}`);
        today.push(parts.join(' — '));
      } else if (!isToday) {
        const parts = [`${e.event}`];
        if (e.estimate !== null && e.estimate !== undefined) parts.push(`est. ${e.estimate}${e.unit || ''}`);
        upcoming.push(`[${e.date?.split(' ')[0] || 'Upcoming'}] ${parts.join(' — ')}`);
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { today: today.slice(0, 12), upcoming: upcoming.slice(0, 10) };
  } catch {
    return { today: [], upcoming: [] };
  }
}

const NOTABLE_EARNINGS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
  'JPM', 'GS', 'BAC', 'MS', 'V', 'MA', 'AMD', 'INTC', 'QCOM', 'AVGO',
  'NFLX', 'DIS', 'UNH', 'JNJ', 'LLY', 'XOM', 'CVX', 'COST', 'WMT',
  'NKE', 'SBUX', 'CRM', 'ORCL', 'NOW', 'PLTR', 'LULU', 'MU', 'ADBE',
]);

/**
 * Today's notable earnings — with actual vs estimated EPS when reported —
 * plus the next two days of scheduled reports.
 */
async function fetchEarningsData(): Promise<{ today: string[]; upcoming: string[] }> {
  if (!FINNHUB_API_KEY) return { today: [], upcoming: [] };
  try {
    const now = new Date();
    const todayStr = etDateStr(now);
    const endStr = etDateStr(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${todayStr}&to=${endStr}&token=${FINNHUB_API_KEY}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return { today: [], upcoming: [] };
    const data = await res.json();
    const earnings = data?.earningsCalendar ?? [];
    if (!Array.isArray(earnings)) return { today: [], upcoming: [] };

    const today: string[] = [];
    const upcoming: string[] = [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const e of earnings as any[]) {
      if (!NOTABLE_EARNINGS.has(e.symbol)) continue;
      const timing = e.hour === 'bmo' ? 'before open' : e.hour === 'amc' ? 'after close' : '';
      if (e.date === todayStr) {
        if (e.epsActual !== null && e.epsActual !== undefined) {
          const parts = [`${e.symbol} Q${e.quarter} ${e.year}: EPS ${e.epsActual}`];
          if (e.epsEstimate !== null && e.epsEstimate !== undefined) parts.push(`est. ${e.epsEstimate}`);
          today.push(parts.join(' vs ') + (timing ? ` (${timing})` : ''));
        } else {
          // Reported today but numbers not yet in the feed (e.g. just released
          // after the close) — still worth flagging in the recap.
          today.push(`${e.symbol} Q${e.quarter} ${e.year} earnings${timing ? ` (${timing})` : ''} — results pending`);
        }
      } else {
        upcoming.push(`[${e.date}] ${e.symbol} Q${e.quarter} ${e.year}${timing ? ` (${timing})` : ''}`);
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { today: today.slice(0, 10), upcoming: upcoming.slice(0, 10) };
  } catch {
    return { today: [], upcoming: [] };
  }
}

// ---------------------------------------------------------------------------
// AI recap generation
// ---------------------------------------------------------------------------

export interface DailyRecapData {
  date: string;
  generatedAt: string;
  indices: MarketItem[];
  stocks: MarketItem[];
  crypto: MarketItem[];
  topMovers: { gainers: DayMover[]; losers: DayMover[] };
  aiSummary: DailyRecapAiSummary;
}

function fallbackSummary(
  news: FinnhubNewsItem[],
  econ: { today: string[]; upcoming: string[] },
  earnings: { today: string[]; upcoming: string[] },
  overview: string,
): DailyRecapAiSummary {
  return {
    marketRecap: overview,
    notableMovers: [],
    macroRecap: econ.today,
    earningsRecap: earnings.today,
    newsHighlights: news.slice(0, 5).map((n) => ({ headline: n.headline, url: n.url })),
    lookingAhead: [...econ.upcoming.slice(0, 3), ...earnings.upcoming.slice(0, 2)],
    sentiment: 'neutral',
  };
}

async function generateAIRecap(
  indices: MarketItem[],
  stocks: MarketItem[],
  crypto: MarketItem[],
  topMovers: { gainers: DayMover[]; losers: DayMover[] },
  news: FinnhubNewsItem[],
  econ: { today: string[]; upcoming: string[] },
  earnings: { today: string[]; upcoming: string[] },
): Promise<DailyRecapAiSummary> {
  if (!ANTHROPIC_API_KEY) {
    return fallbackSummary(news, econ, earnings, 'AI recap unavailable — ANTHROPIC_API_KEY not configured.');
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const fmtItem = (i: MarketItem) =>
    `${i.name} (${i.symbol}): $${i.price.toFixed(2)} ${i.change >= 0 ? '+' : ''}${i.change} (${i.change >= 0 ? '+' : ''}${i.changePercent}%)`;
  const fmtMover = (m: DayMover) =>
    `${m.symbol}: $${m.price.toFixed(2)} ${m.changePercent >= 0 ? '+' : ''}${m.changePercent}% on ${(m.volume / 1_000_000).toFixed(1)}M shares`;

  const priceContext = [
    '## Closing Index Prices',
    ...indices.map(fmtItem),
    '',
    '## Key Stocks at the Close',
    ...stocks.map(fmtItem),
    '',
    '## Crypto (24h)',
    ...crypto.map(
      (c) =>
        `${c.name} (${c.symbol}): $${c.price.toLocaleString()} ${c.change >= 0 ? '+' : ''}${c.change} (${c.change >= 0 ? '+' : ''}${c.changePercent}%)`,
    ),
    '',
    "## Today's Top Gainers (full session)",
    ...topMovers.gainers.map(fmtMover),
    '',
    "## Today's Top Losers (full session)",
    ...topMovers.losers.map(fmtMover),
  ].join('\n');

  const newsContext = news
    .slice(0, 15)
    .map((n, i) => `${i + 1}. [${n.source}] ${n.headline}\n   URL: ${n.url}\n   ${n.summary.slice(0, 200)}`)
    .join('\n');

  const eventsContext = [
    ...(econ.today.length > 0
      ? ['## US Economic Data Released Today (actual vs estimate)', ...econ.today]
      : ['## US Economic Data Released Today', 'No US economic releases found for today.']),
    '',
    ...(earnings.today.length > 0
      ? ['## Notable Earnings Today', ...earnings.today]
      : []),
    '',
    ...(econ.upcoming.length > 0
      ? ['## Upcoming Economic Events (next 2 days)', ...econ.upcoming]
      : []),
    '',
    ...(earnings.upcoming.length > 0
      ? ['## Upcoming Earnings (next 2 days)', ...earnings.upcoming]
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
    max_tokens: 2500,
    messages: [
      {
        role: 'user',
        content: `You are a concise financial market analyst. Today is ${todayStr}. The US market has just closed.

Given the closing data, the day's news, economic releases, and earnings below, produce a structured END-OF-DAY market recap as JSON. This is a look BACK at what happened during today's session (with a short look ahead), not a morning preview.

${priceContext}

## Today's News Headlines
${newsContext}

${eventsContext}

Return ONLY valid JSON with this exact structure:
{
  "marketRecap": "3-4 sentence summary of how the trading day went: direction, what drove it, and how the session evolved",
  "notableMovers": [{"symbol": "TICKER", "move": "+X.X%", "reason": "why it moved today"}],
  "macroRecap": ["economic data released today with actual vs estimate and what it means"],
  "earningsRecap": ["notable earnings result today and how the stock reacted"],
  "newsHighlights": [{"headline": "rewritten headline", "url": "original article URL from source"}],
  "lookingAhead": ["event, data release, or earnings report coming tomorrow or the day after that could move markets"],
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed"
}

Rules:
- marketRecap: past tense — the session is over. Lead with the indices and what drove the tape.
- notableMovers: 3-6 stocks/assets with the most significant moves TODAY, drawn from the top gainers/losers and key stocks above. Include the percentage move and the reason when the news explains it; if no clear catalyst appears in the provided headlines, say "no clear catalyst in today's headlines" rather than inventing one.
- macroRecap: ONLY data from the "US Economic Data Released Today" section. State actual vs estimate and whether it beat or missed. Empty array if nothing was released.
- earningsRecap: ONLY results from the "Notable Earnings Today" section. Empty array if none.
- newsHighlights: Top 3-5 headlines that DIRECTLY moved or could move financial markets. Rewrite each concisely and include the "url" field copied exactly from the corresponding source article above.
- lookingAhead: ONLY events from the Upcoming Economic Events and Upcoming Earnings sections. Do NOT invent events. Empty array if none provided.
- sentiment: how the session actually traded, not a forecast.
- Be specific with numbers. No generic filler.
- Return ONLY valid JSON, no markdown, no preamble.`,
      },
    ],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Try multiple strategies to extract valid JSON from the AI response
  function tryParseJSON(input: string): Record<string, unknown> | null {
    const stripped = input.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();
    try { return JSON.parse(stripped); } catch { /* continue */ }

    const first = stripped.indexOf('{');
    const last = stripped.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(stripped.slice(first, last + 1)); } catch { /* continue */ }
    }

    return null;
  }

  const parsed = tryParseJSON(rawText);
  if (parsed && typeof parsed.marketRecap === 'string') {
    const p = parsed as Partial<DailyRecapAiSummary>;
    return {
      marketRecap: p.marketRecap as string,
      notableMovers: Array.isArray(p.notableMovers) ? p.notableMovers : [],
      macroRecap: Array.isArray(p.macroRecap) ? p.macroRecap : [],
      earningsRecap: Array.isArray(p.earningsRecap) ? p.earningsRecap : [],
      newsHighlights: Array.isArray(p.newsHighlights) ? p.newsHighlights : [],
      lookingAhead: Array.isArray(p.lookingAhead) ? p.lookingAhead : [],
      sentiment: p.sentiment === 'bullish' || p.sentiment === 'bearish' || p.sentiment === 'mixed' ? p.sentiment : 'neutral',
    };
  }

  console.warn('[DailyRecap] Failed to parse AI JSON. Raw:', rawText.slice(0, 300));
  return fallbackSummary(news, econ, earnings, 'AI recap could not be parsed. Please regenerate.');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('preview') === 'true';
    const test = searchParams.get('test') === 'true';
    const force = searchParams.get('force') === 'true';

    console.log('[DailyRecap] Generating daily market recap...');

    if (!force && !isMarketOpenToday()) {
      const msg = '🪐 Market was closed today (weekend or holiday). No daily recap needed.';
      await postToCronResults('Daily Market Recap', msg, 'market');
      await logToActivityLog('Daily Market Recap', 'Market closed', 'cron');
      return NextResponse.json({
        success: true,
        data: { marketOpen: false, message: msg },
        durationMs: Date.now() - startTime,
      });
    }

    // Fetch all data in parallel
    const [indices, stocks, crypto, topMovers, news, econ, earnings] = await Promise.all([
      fetchPolygonSnapshots(['SPY', 'QQQ', 'DIA', 'IWM', 'VIX']),
      fetchPolygonSnapshots(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'AMZN', 'GOOGL']),
      fetchCoinGeckoPrices(),
      fetchTopMovers(),
      fetchTodaysMarketNews(),
      fetchEconomicData(),
      fetchEarningsData(),
    ]);

    // Generate AI recap
    const aiSummary = await generateAIRecap(indices, stocks, crypto, topMovers, news, econ, earnings);

    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const recap: DailyRecapData = {
      date: today,
      generatedAt: new Date().toISOString(),
      indices,
      stocks,
      crypto,
      topMovers,
      aiSummary,
    };

    // Cache in Redis
    const redis = await getRedisClient();
    await redis.set(RECAP_CACHE_KEY, JSON.stringify(recap));

    if (preview) {
      return NextResponse.json({ success: true, data: recap, durationMs: Date.now() - startTime });
    }

    const buildEmail = () => {
      const { DailyRecapEmail } = require('@/lib/emails/DailyRecapEmail');
      return DailyRecapEmail({
        date: recap.date,
        indices: recap.indices,
        stocks: recap.stocks,
        crypto: recap.crypto,
        topMovers: recap.topMovers,
        aiSummary: recap.aiSummary,
      });
    };
    const subject = () => `Daily Recap — ${recap.date}`;

    // Test mode: send only to the owner as a sample, skip subscribers.
    if (test) {
      const { OWNER_EMAIL } = await import('@/lib/owner');
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({ to: OWNER_EMAIL, subject: subject(), react: buildEmail() });
      return NextResponse.json({
        success: result.success,
        sentTo: OWNER_EMAIL,
        emailId: result.id,
        error: result.error,
        durationMs: Date.now() - startTime,
      });
    }

    // Post to cron results, activity log, and email subscribers.
    // Entitlement (Gold+) is enforced inside sendEmailsToSubscribers.
    const [,, emailResult] = await Promise.all([
      postToCronResults(
        'Daily Market Recap',
        `${recap.aiSummary.marketRecap}\n\nSentiment: ${recap.aiSummary.sentiment}`,
        'market',
      ),
      logToActivityLog(
        'Daily Market Recap',
        `Generated with ${indices.length} indices, ${topMovers.gainers.length + topMovers.losers.length} movers, ${econ.today.length} macro releases, ${earnings.today.length} earnings`,
        'cron',
      ),
      sendEmailsToSubscribers('dailyRecap', subject, buildEmail),
    ]);

    if (emailResult.sent > 0) {
      console.log(`[DailyRecap] Sent ${emailResult.sent} recap emails`);
    }

    const duration = Date.now() - startTime;
    console.log(`[DailyRecap] Recap generated in ${duration}ms`);

    return NextResponse.json({
      success: true,
      data: {
        indices: indices.length,
        stocks: stocks.length,
        movers: topMovers.gainers.length + topMovers.losers.length,
        emailsSent: emailResult.sent,
        durationMs: duration,
      },
    });
  } catch (error) {
    console.error('[DailyRecap] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToActivityLog('Daily Market Recap Failed', errorMessage, 'cron');
    return NextResponse.json(
      { success: false, error: 'Failed to generate daily market recap', message: errorMessage },
      { status: 500 },
    );
  }
}
