import { NextResponse } from 'next/server';

// News categories with their keywords for filtering
const NEWS_CATEGORIES = {
  fed: {
    name: 'Fed & Rates',
    keywords: ['fed', 'fomc', 'federal reserve', 'interest rate', 'rate hike', 'rate cut', 'jerome powell', 'monetary policy', 'fed chair'],
    priority: 'high',
    color: '#8b5cf6' // Purple
  },
  macro: {
    name: 'Macro & Policy',
    keywords: ['cpi', 'inflation', 'jobs report', 'unemployment', 'gdp', 'non-farm payrolls', 'nfp', 'retail sales', 'consumer confidence', 'pmi', 'purchasing managers', 'ism manufacturing', 'ism services', 'flash manufacturing', 'manufacturing index', 'services index', 'economic growth', 'white house', 'executive order', 'trump', 'administration', 'legislation', 'congress', 'senate', 'regulation', 'tariff', 'fiscal policy'],
    priority: 'high',
    color: '#3b82f6' // Blue
  },
  mergers: {
    name: 'M&A',
    keywords: ['merger', 'acquisition', 'acquire', 'acquiring', 'buyout', 'takeover', 'merging', 'deal', 'purchased by', 'to buy', 'to acquire'],
    priority: 'high',
    color: '#f97316' // Orange
  },
  earnings: {
    name: 'Earnings',
    keywords: ['earnings', 'beats', 'misses', 'revenue', 'profit', 'loss', 'quarterly results', 'q1', 'q2', 'q3', 'q4', 'guidance', 'outlook'],
    priority: 'medium',
    color: '#14b8a6' // Teal
  },
  ai: {
    name: 'AI & Tech',
    keywords: ['artificial intelligence', 'ai model', 'large language model', 'llm', 'chatgpt', 'openai', 'anthropic', 'gemini', 'claude', 'machine learning', 'deep learning', 'generative ai', 'nvidia', 'gpu', 'semiconductor', 'chips act', 'data center', 'ai chip', 'ai infrastructure'],
    priority: 'medium',
    color: '#22c55e', // Green
  },
  crypto: {
    name: 'Crypto',
    keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'blockchain', 'solana', 'sol', 'ripple', 'xrp', 'dogecoin', 'doge', 'cardano', 'ada', 'defi', 'decentralized finance', 'nft', 'stablecoin', 'usdt', 'usdc', 'coinbase', 'binance', 'crypto exchange', 'digital asset', 'web3', 'altcoin', 'token', 'mining', 'halving', 'spot etf', 'bitcoin etf'],
    priority: 'medium',
    color: '#f59e0b', // Amber
  },
};

interface NewsItem {
  category: string;
  datetime: number;
  headline: string;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
  // When set, skip keyword matching and file the item under this category
  // directly. Used for items from dedicated single-topic feeds (e.g. AI/tech).
  forceCategory?: keyof typeof NEWS_CATEGORIES;
}

interface CategorizedNews {
  id: string;
  category: keyof typeof NEWS_CATEGORIES;
  categoryName: string;
  priority: string;
  color: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  related: string[];
  timestamp: number;
  timeAgo: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
}

const BULLISH_KEYWORDS = ['rally', 'surge', 'soar', 'jump', 'pump', 'breakout', 'all-time high', 'ath', 'bull', 'bullish', 'moon', 'adoption', 'approval', 'approved', 'etf approved', 'upgrade', 'partnership', 'institutional', 'accumulate', 'buy signal', 'recovery', 'rebound', 'inflow', 'inflows'];
const BEARISH_KEYWORDS = ['crash', 'plunge', 'dump', 'drop', 'collapse', 'bear', 'bearish', 'sell-off', 'selloff', 'hack', 'hacked', 'exploit', 'rug pull', 'scam', 'fraud', 'ban', 'banned', 'crackdown', 'liquidat', 'outflow', 'outflows', 'sec sues', 'lawsuit', 'ponzi', 'warning', 'fear'];

function analyzeSentiment(headline: string, summary: string): 'bullish' | 'bearish' | 'neutral' {
  const text = `${headline} ${summary}`.toLowerCase();
  let bullScore = 0;
  let bearScore = 0;
  for (const kw of BULLISH_KEYWORDS) {
    if (text.includes(kw)) bullScore++;
  }
  for (const kw of BEARISH_KEYWORDS) {
    if (text.includes(kw)) bearScore++;
  }
  if (bullScore > bearScore) return 'bullish';
  if (bearScore > bullScore) return 'bearish';
  return 'neutral';
}

interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  source: { title: string };
  published_at: string;
  currencies?: Array<{ code: string }>;
  votes: { positive: number; negative: number; important: number };
}

// Finnhub free tier: 60 calls/minute
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const CRYPTOPANIC_API_KEY = process.env.CRYPTOPANIC_API_KEY;

// Dedicated AI/tech news sources. Finnhub's general feed almost never surfaces
// AI stories, which left the "AI & Tech" category empty. These are free, public
// RSS/Atom feeds (no API key required), so the category stays populated even
// when no market-data keys are configured.
const AI_RSS_FEEDS: Array<{ url: string; source: string }> = [
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch' },
  { url: 'https://arstechnica.com/ai/feed/', source: 'Ars Technica' },
  { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', source: 'The Verge' },
  { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', source: 'MIT Technology Review' },
  { url: 'https://www.wired.com/feed/tag/ai/latest/rss', source: 'Wired' },
];

// Cap stories taken from any one publication so a prolific feed can't crowd the
// others out of the AI tab.
const AI_PER_FEED_LIMIT = 6;

/**
 * Categorize news based on headline and summary content
 */
function categorizeNews(item: NewsItem): CategorizedNews | null {
  const text = `${item.headline} ${item.summary}`.toLowerCase();
  
  for (const [key, config] of Object.entries(NEWS_CATEGORIES)) {
    // Items from dedicated single-topic feeds carry their category explicitly;
    // everything else is matched by keyword against the headline + summary.
    const matches = item.forceCategory
      ? item.forceCategory === key
      : config.keywords.some(keyword => text.includes(keyword.toLowerCase()));

    if (matches) {
      const result: CategorizedNews = {
        id: `${item.datetime}-${item.headline.slice(0, 30).replace(/\s+/g, '-')}`,
        category: key as keyof typeof NEWS_CATEGORIES,
        categoryName: config.name,
        priority: config.priority,
        color: config.color,
        headline: item.headline,
        summary: item.summary,
        source: item.source,
        url: item.url,
        related: item.related ? item.related.split(',').filter(Boolean) : [],
        timestamp: item.datetime,
        timeAgo: getTimeAgo(item.datetime)
      };
      if (key === 'crypto') {
        result.sentiment = analyzeSentiment(item.headline, item.summary);
      }
      return result;
    }
  }
  
  return null;
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - (timestamp * 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

async function fetchCryptoPanicNews(): Promise<NewsItem[]> {
  if (!CRYPTOPANIC_API_KEY) return [];

  try {
    const response = await fetch(
      `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_KEY}&filter=hot&kind=news`,
      { next: { revalidate: 900 } }
    );

    if (!response.ok) {
      console.warn(`CryptoPanic API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: CryptoPanicPost[] = data?.results ?? [];

    return posts.map((post) => {
      const tickers = post.currencies?.map(c => c.code).join(',') ?? '';
      const sentimentHint = post.votes.positive > post.votes.negative ? 'bullish' :
        post.votes.negative > post.votes.positive ? 'bearish' : '';

      return {
        category: 'crypto',
        datetime: Math.floor(new Date(post.published_at).getTime() / 1000),
        headline: post.title,
        image: '',
        related: tickers,
        source: post.source.title,
        summary: sentimentHint ? `Community sentiment: ${sentimentHint}` : '',
        url: post.url,
      };
    });
  } catch (error) {
    console.warn('CryptoPanic fetch error:', error);
    return [];
  }
}

async function fetchFinnhubNews(): Promise<NewsItem[]> {
  if (!FINNHUB_API_KEY) {
    console.warn('FINNHUB_API_KEY not set, using mock data');
    return getMockNews();
  }

  try {
    const [newsResponse, cryptoResponse, cryptoPanicNews] = await Promise.all([
      fetch(
        `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
        { next: { revalidate: 900 } },
      ),
      fetch(
        `https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB_API_KEY}`,
        { next: { revalidate: 900 } },
      ),
      fetchCryptoPanicNews(),
    ]);

    let generalNews: NewsItem[] = [];
    if (newsResponse.ok) {
      const data = await newsResponse.json();
      if (Array.isArray(data)) generalNews = data;
      else console.warn('Finnhub general news response is not an array');
    } else {
      console.warn(`Finnhub general news error: ${newsResponse.status}`);
    }

    let cryptoNews: NewsItem[] = [];
    if (cryptoResponse.ok) {
      const data = await cryptoResponse.json();
      if (Array.isArray(data)) cryptoNews = data;
      else console.warn('Finnhub crypto news response is not an array');
    } else {
      console.warn(`Finnhub crypto news error: ${cryptoResponse.status}`);
    }

    const combined = [...generalNews, ...cryptoNews, ...cryptoPanicNews];
    if (combined.length === 0) return getMockNews();

    return combined;
  } catch (error) {
    console.error('Finnhub news fetch error:', error);
    return getMockNews();
  }
}

/**
 * Decode the XML/HTML entities and CDATA wrappers that show up in RSS/Atom
 * payloads, strip any markup, and collapse whitespace.
 */
function cleanFeedText(raw: string): string {
  let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Minimal RSS/Atom parser. Pulls the headline, link, timestamp, and summary out
 * of each <item> (RSS) or <entry> (Atom) block. Intentionally lightweight — good
 * enough for the well-formed feeds major publications serve; any block without a
 * title or a usable http(s) link is skipped.
 */
function parseFeed(xml: string, source: string, category: keyof typeof NEWS_CATEGORIES): NewsItem[] {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []),
  ];

  const items: NewsItem[] = [];
  for (const block of blocks) {
    const headline = cleanFeedText(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    if (!headline) continue;

    // RSS uses <link>URL</link>; Atom uses <link href="URL" rel="alternate"/>.
    const rssLink = block.match(/<link>\s*([\s\S]*?)\s*<\/link>/i)?.[1]?.trim();
    const atomLink =
      block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const url = (rssLink && /^https?:\/\//i.test(rssLink) ? rssLink : atomLink ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;

    const dateRaw =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      block.match(/<published>([\s\S]*?)<\/published>/i)?.[1] ??
      block.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] ??
      block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1];
    const parsedMs = dateRaw ? Date.parse(dateRaw.trim()) : NaN;
    const datetime = Number.isNaN(parsedMs) ? Math.floor(Date.now() / 1000) : Math.floor(parsedMs / 1000);

    const summaryRaw =
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ??
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
      '';

    items.push({
      category,
      datetime,
      headline,
      image: '',
      related: '',
      source,
      summary: cleanFeedText(summaryRaw).slice(0, 220),
      url,
      forceCategory: category,
    });
  }

  return items;
}

/**
 * Fetch AI/tech headlines from the dedicated RSS/Atom feeds. Each feed is
 * fetched independently — a slow or failing feed never blocks the others, and
 * the whole thing degrades to an empty list rather than throwing.
 */
async function fetchAiTechNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    AI_RSS_FEEDS.map(async ({ url, source }) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'JunoMissionControl/1.0 (+news-screener)' },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 900 },
      });
      if (!response.ok) {
        console.warn(`AI feed ${source} error: ${response.status}`);
        return [] as NewsItem[];
      }
      const xml = await response.text();
      return parseFeed(xml, source, 'ai')
        .sort((a, b) => b.datetime - a.datetime)
        .slice(0, AI_PER_FEED_LIMIT);
    }),
  );

  const items: NewsItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') items.push(...result.value);
    else console.warn('AI feed fetch failed:', result.reason);
  }
  console.log(`[NewsScreener] Fetched ${items.length} AI/tech items from ${AI_RSS_FEEDS.length} feeds`);
  return items;
}

/** Only keep items whose URL is something a click can actually open. */
function hasValidUrl(item: { url?: string }): boolean {
  const u = (item.url || '').trim();
  return /^https?:\/\//i.test(u);
}

/**
 * Mock news data for fallback
 */
function getMockNews(): NewsItem[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      category: 'top news',
      datetime: now - 3600,
      headline: 'Fed Signals Potential Rate Cuts in Coming Months',
      image: '',
      related: 'SPY,QQQ,GLD',
      source: 'Financial Times',
      summary: 'Federal Reserve officials indicated they may begin cutting interest rates as inflation continues to cool toward the 2% target.',
      url: 'https://example.com/fed-news'
    },
    {
      category: 'top news',
      datetime: now - 7200,
      headline: 'Tech Giants Announce Major Merger Worth $50 Billion',
      image: '',
      related: 'META,GOOGL',
      source: 'Reuters',
      summary: 'Two major technology companies have agreed to merge in a deal that will reshape the industry landscape.',
      url: 'https://example.com/merger-news'
    },
    {
      category: 'top news',
      datetime: now - 10800,
      headline: 'CPI Report Shows Inflation Cooling Faster Than Expected',
      image: '',
      related: 'SPY,DIA',
      source: 'Bloomberg',
      summary: 'The latest Consumer Price Index data came in below expectations, suggesting the Fed\'s fight against inflation is working.',
      url: 'https://example.com/cpi-news'
    },
    {
      category: 'top news',
      datetime: now - 14400,
      headline: 'Apple Beats Earnings Estimates, Stock Rises in After-Hours',
      image: '',
      related: 'AAPL',
      source: 'CNBC',
      summary: 'Apple reported quarterly earnings that exceeded Wall Street expectations, driven by strong iPhone and Services revenue.',
      url: 'https://example.com/earnings-news'
    },
    {
      category: 'top news',
      datetime: now - 18000,
      headline: 'White House Announces New Infrastructure Investment Plan',
      image: '',
      related: 'XLI,CAT,DE',
      source: 'WSJ',
      summary: 'The administration unveiled a comprehensive infrastructure package aimed at modernizing transportation and energy systems.',
      url: 'https://example.com/policy-news'
    },
    {
      category: 'top news',
      datetime: now - 21600,
      headline: 'Reddit IPO Prices at $34 per Share, Valued at $6.4 Billion',
      image: '',
      related: 'RDDT',
      source: 'Reuters',
      summary: 'Social media platform Reddit priced its initial public offering at the top end of expectations, marking a major tech IPO.',
      url: 'https://example.com/ipo-news'
    },
    {
      category: 'crypto',
      datetime: now - 1800,
      headline: 'Bitcoin Surges Past $100K as Institutional Inflows Hit Record',
      image: '',
      related: 'BTC',
      source: 'CoinDesk',
      summary: 'Bitcoin rally continues as ETF inflows reach all-time highs, signaling strong institutional adoption.',
      url: 'https://example.com/btc-surge'
    },
    {
      category: 'crypto',
      datetime: now - 5400,
      headline: 'Ethereum Layer 2 Ecosystem Sees Major Partnership Announcement',
      image: '',
      related: 'ETH',
      source: 'The Block',
      summary: 'Leading Ethereum L2 network announces partnership with major financial institution for tokenized assets.',
      url: 'https://example.com/eth-l2'
    },
    {
      category: 'crypto',
      datetime: now - 9000,
      headline: 'SEC Crackdown on DeFi Protocols Sparks Market Fear',
      image: '',
      related: 'ETH,SOL',
      source: 'Bloomberg',
      summary: 'Regulatory crackdown concerns lead to sell-off across decentralized finance tokens.',
      url: 'https://example.com/sec-defi'
    },
    {
      category: 'ai',
      datetime: now - 2400,
      headline: 'Nvidia Unveils Next-Gen AI Chip Aimed at Faster LLM Training',
      image: '',
      related: 'NVDA',
      source: 'The Verge',
      summary: 'The new GPU architecture targets large language model workloads, with major cloud providers already lining up orders.',
      url: 'https://example.com/nvidia-ai-chip',
      forceCategory: 'ai'
    },
    {
      category: 'ai',
      datetime: now - 6000,
      headline: 'OpenAI and Anthropic Push New Frontier Models for Enterprise',
      image: '',
      related: 'MSFT',
      source: 'TechCrunch',
      summary: 'Generative AI competition intensifies as both labs prepare major model releases aimed at business customers.',
      url: 'https://example.com/frontier-models',
      forceCategory: 'ai'
    }
  ];
}

/**
 * Main GET handler for news screener
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    console.log(`[NewsScreener] Fetching news at ${timestamp}`);
    
    // Fetch market news (Finnhub/CryptoPanic) and the dedicated AI/tech feeds in
    // parallel, then merge. The AI feeds are what keep the "AI & Tech" tab
    // populated — Finnhub's general feed rarely carries AI stories.
    const [marketNews, aiTechNews] = await Promise.all([
      fetchFinnhubNews(),
      fetchAiTechNews(),
    ]);
    const rawNews = [...marketNews, ...aiTechNews];

    // Categorize and de-dupe. Drop anything without a usable URL — broken
    // anchors make the screener feel unresponsive when you click through.
    let categorizedNews: CategorizedNews[] = [];
    const seenHeadlines = new Set<string>();

    for (const item of rawNews) {
      if (!hasValidUrl(item)) continue;
      if (seenHeadlines.has(item.headline)) continue;
      seenHeadlines.add(item.headline);

      const categorized = categorizeNews(item);
      if (categorized) {
        categorizedNews.push(categorized);
      }
    }

    // If live data produced no categorized items, fall back to mock data
    if (categorizedNews.length === 0 && FINNHUB_API_KEY) {
      console.warn('[NewsScreener] Live data produced 0 categorized items, falling back to mock data');
      const mockItems = getMockNews();
      for (const item of mockItems) {
        if (!hasValidUrl(item)) continue;
        const categorized = categorizeNews(item);
        if (categorized) categorizedNews.push(categorized);
      }
    }

    // Keep a pool per category (newest first, capped) so every category tab
    // has stories to show — a single global cap starves the medium-priority
    // categories whenever Fed/macro/M&A news is heavy.
    const MAX_PER_CATEGORY = 15;
    categorizedNews.sort((a, b) => b.timestamp - a.timestamp);
    const perCategoryCount: Record<string, number> = {};
    categorizedNews = categorizedNews.filter((item) => {
      perCategoryCount[item.category] = (perCategoryCount[item.category] || 0) + 1;
      return perCategoryCount[item.category] <= MAX_PER_CATEGORY;
    });

    // The default "High Priority" digest: market-moving categories (Fed,
    // macro, M&A) first, newest within each group, capped at 15.
    const MAX_HIGH_PRIORITY = 15;
    const highPriority = [...categorizedNews]
      .sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        return b.timestamp - a.timestamp;
      })
      .slice(0, MAX_HIGH_PRIORITY);


    // Count by category
    const categoryCounts: Record<string, number> = {};
    for (const item of categorizedNews) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    }
    
    // Get latest news per category
    const latestByCategory: Record<string, CategorizedNews> = {};
    for (const item of categorizedNews) {
      if (!latestByCategory[item.category]) {
        latestByCategory[item.category] = item;
      }
    }
    
    const source = FINNHUB_API_KEY ? 'live' : 'mock';
    
    console.log(`[NewsScreener] Found ${categorizedNews.length} categorized items from ${rawNews.length} total`);
    console.log(`[NewsScreener] Category counts:`, categoryCounts);
    
    return NextResponse.json({
      success: true,
      data: {
        items: categorizedNews,
        highPriority,
        latestByCategory,
        counts: categoryCounts,
        totalScanned: rawNews.length,
        categorized: categorizedNews.length
      },
      timestamp,
      source,
      categories: Object.keys(NEWS_CATEGORIES),
      nextUpdate: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min cache hint
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' // 15 min cache
      }
    });
    
  } catch (error) {
    console.error('[NewsScreener] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch news',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    }, { status: 500 });
  }
}
