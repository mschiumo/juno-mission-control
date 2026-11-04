/**
 * Market News aggregator.
 *
 * Pulls headlines from ~30 free, key-less RSS feeds (CNBC, WSJ, NYT, BBC,
 * Guardian, Al Jazeera, Bloomberg, FT, Politico, OilPrice, the Fed's
 * monetary-policy releases, Google News sections…) plus Finnhub when a key is
 * configured, tags every story with one market-relevant category (Fed,
 * geopolitics/war, politics, macro data, energy & commodities, M&A, earnings,
 * AI, crypto, general markets), de-dupes, and stores the result in Redis.
 *
 * Refresh model:
 *  - `/api/cron-jobs/market-news-refresh` runs every 15 minutes (vercel.json)
 *    and calls `refreshMarketNews()`, so the cache is always warm.
 *  - `/api/news-screener` reads the cache via `getMarketNews()`. If the cache
 *    is missing or older than the refresh interval (cron missed, cold deploy)
 *    it refreshes inline — guarded by a short Redis lock so a burst of users
 *    doesn't fan out into N parallel pulls of 30 feeds.
 *
 * Only `headline + summary` are keyword-matched, with word boundaries, so
 * "method" no longer lands in Crypto because it contains "eth".
 */

import { getRedisClient } from '@/lib/redis';
import {
  DIGEST_CATEGORIES,
  NEWS_CATEGORY_META,
  NEWS_CATEGORY_ORDER,
  NEWS_REFRESH_INTERVAL_MS,
  formatTimeAgo,
  type NewsCategoryId,
} from '@/lib/news/categories';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawNewsItem {
  datetime: number; // unix seconds
  headline: string;
  summary: string;
  source: string;
  url: string;
  /** Comma-separated tickers when the source provides them (Finnhub). */
  related?: string;
  /** Skip keyword matching and file under this category (single-topic feeds). */
  forceCategory?: NewsCategoryId;
  /** Use this category only when no keyword matches (topical feeds). */
  fallbackCategory?: NewsCategoryId;
}

export interface CategorizedNews {
  id: string;
  category: NewsCategoryId;
  categoryName: string;
  priority: 'high' | 'medium';
  color: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  related: string[];
  timestamp: number;
  /** Computed at generation time; the card recomputes from `timestamp`. */
  timeAgo: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
}

export interface MarketNewsPayload {
  generatedAt: string;
  items: CategorizedNews[];
  highPriority: CategorizedNews[];
  latestByCategory: Partial<Record<NewsCategoryId, CategorizedNews>>;
  counts: Partial<Record<NewsCategoryId, number>>;
  totalScanned: number;
  categorized: number;
  sourcesOk: number;
  sourcesFailed: number;
  failedSources: string[];
  source: 'live' | 'mock';
}

// ---------------------------------------------------------------------------
// Keyword model
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<NewsCategoryId, string[]> = {
  fed: [
    'fed', 'fomc', 'federal reserve', 'powell', 'fed chair', 'fed officials', 'fed president',
    'interest rate', 'interest rates', 'rate hike', 'rate hikes', 'rate cut', 'rate cuts', 'rate decision',
    'rate-cut', 'rate-hike', 'monetary policy', 'basis points', 'quantitative easing', 'quantitative tightening',
    'fed funds', 'dot plot', 'hawkish', 'dovish', 'central bank', 'central banks', 'central bankers',
    'ecb', 'european central bank', 'lagarde', 'bank of japan', 'boj', 'bank of england', 'boe',
    'bank of canada', 'rba', 'snb', 'pboc', 'beige book', 'jackson hole',
  ],
  geopolitics: [
    'war', 'wars', 'warfare', 'military', 'missile', 'missiles', 'airstrike', 'airstrikes', 'air strike',
    'ceasefire', 'cease-fire', 'truce', 'sanction', 'sanctions', 'iran', 'tehran', 'israel', 'israeli', 'gaza',
    'hezbollah', 'hamas', 'houthi', 'houthis', 'red sea', 'strait of hormuz', 'ukraine', 'ukrainian', 'russia',
    'russian', 'kremlin', 'putin', 'zelensky', 'china', 'chinese', 'beijing', 'taiwan', 'xi jinping',
    'north korea', 'pyongyang', 'nato', 'pentagon', 'troops', 'invasion', 'invade', 'invades', 'drone attack',
    'drone strike', 'drones', 'nuclear', 'hostage', 'hostages', 'geopolitical', 'geopolitics', 'conflict',
    'escalation', 'escalates', 'battlefield', 'offensive', 'bombing', 'bombed', 'terror', 'terrorist',
    'terrorism', 'coup', 'insurgents', 'navy', 'warship', 'warships', 'embargo', 'blockade', 'middle east',
    'armistice', 'peace talks', 'peace deal', 'defense spending', 'defence spending', 'arms', 'weapons',
    'venezuela', 'maduro', 'syria', 'yemen', 'lebanon', 'kyiv', 'moscow',
  ],
  politics: [
    'trump', 'white house', 'congress', 'congressional', 'senate', 'house of representatives', 'speaker of the house',
    'democrats', 'democrat', 'democratic', 'republicans', 'republican', 'gop', 'midterm', 'midterms', 'election',
    'elections', 'electoral', 'executive order', 'legislation', 'lawmakers', 'supreme court', 'tariff', 'tariffs',
    'trade war', 'trade deal', 'trade talks', 'shutdown', 'debt ceiling', 'budget', 'fiscal', 'stimulus',
    'tax cut', 'tax cuts', 'tax bill', 'regulation', 'regulators', 'regulatory', 'antitrust', 'doj',
    'justice department', 'ftc', 'treasury secretary', 'bessent', 'vance', 'administration', 'governor',
    'parliament', 'prime minister', 'ballot', 'impeach', 'impeachment', 'nominee', 'cabinet', 'capitol hill',
    'policy', 'policymakers', 'bipartisan', 'filibuster', 'veto', 'subsidies', 'subsidy',
  ],
  macro: [
    'inflation', 'inflationary', 'disinflation', 'deflation', 'cpi', 'pce', 'ppi', 'jobs report', 'payrolls',
    'nonfarm', 'non-farm', 'unemployment', 'jobless', 'jobless claims', 'gdp', 'recession', 'economic growth',
    'economy', 'economic', 'economist', 'economists', 'economic data', 'retail sales', 'consumer confidence',
    'consumer sentiment', 'pmi', 'ism', 'manufacturing', 'factory', 'housing starts', 'home sales',
    'mortgage rates', 'mortgage', 'trade deficit', 'deficit', 'national debt', 'consumer spending', 'wages',
    'labor market', 'jolts', 'productivity', 'durable goods', 'imf', 'world bank', 'stagflation',
    'soft landing', 'hard landing', 'cost of living', 'affordability', 'tariff revenue', 'trade data', 'exports',
    'imports', 'supply chain', 'supply chains',
  ],
  commodities: [
    'oil', 'crude', 'brent', 'wti', 'opec', 'opec+', 'natural gas', 'lng', 'gasoline', 'gas prices',
    'energy prices', 'energy market', 'gold', 'silver', 'copper', 'iron ore', 'lithium', 'uranium', 'wheat',
    'corn', 'soybeans', 'commodities', 'commodity', 'barrel', 'barrels', 'refinery', 'refineries', 'pipeline',
    'aramco', 'exxon', 'chevron', 'oil prices', 'fuel prices', 'fuel', 'bullion', 'metals', 'gas',
    'power grid', 'electricity prices', 'utilities',
  ],
  mergers: [
    'merger', 'mergers', 'acquisition', 'acquisitions', 'acquire', 'acquires', 'acquiring', 'acquired',
    'buyout', 'takeover', 'to buy', 'agrees to buy', 'deal to buy', 'bid for', 'stake in', 'spin-off',
    'spinoff', 'ipo', 'goes public', 'm&a', 'divest', 'divestiture', 'tender offer', 'merge', 'merging',
    'combination', 'leveraged buyout', 'private equity',
  ],
  earnings: [
    'earnings', 'quarterly results', 'results', 'q1', 'q2', 'q3', 'q4', 'beats estimates', 'misses estimates',
    'beat expectations', 'missed expectations', 'tops estimates', 'revenue', 'revenues', 'profit', 'profits',
    'net income', 'guidance', 'outlook', 'eps', 'same-store sales', 'shares fall', 'shares rise',
    'shares jump', 'shares slide', 'shares tumble', 'shares surge', 'shares drop', 'quarter', 'full-year',
    'margins', 'ceo', 'layoffs',
  ],
  ai: [
    'artificial intelligence', 'ai', 'a.i.', 'openai', 'chatgpt', 'anthropic', 'claude', 'gemini', 'llm',
    'llms', 'large language model', 'machine learning', 'generative ai', 'nvidia', 'gpu', 'gpus',
    'semiconductor', 'semiconductors', 'chips', 'chipmaker', 'chipmakers', 'data center', 'data centers',
    'datacenter', 'datacenters', 'tsmc', 'amd', 'intel', 'microsoft', 'alphabet', 'google', 'meta', 'apple',
    'amazon', 'tesla', 'big tech', 'tech stocks', 'silicon valley', 'robotics', 'autonomous', 'cloud computing',
    'palantir', 'broadcom', 'oracle', 'software',
  ],
  crypto: [
    'bitcoin', 'btc', 'ethereum', 'ether', 'crypto', 'cryptocurrency', 'cryptocurrencies', 'blockchain',
    'solana', 'xrp', 'ripple', 'dogecoin', 'cardano', 'defi', 'stablecoin', 'stablecoins', 'usdt', 'usdc',
    'tether', 'coinbase', 'binance', 'kraken', 'microstrategy', 'altcoin', 'altcoins', 'memecoin', 'memecoins',
    'nft', 'nfts', 'web3', 'bitcoin etf', 'spot etf', 'halving', 'satoshi', 'digital asset', 'digital assets',
    'crypto exchange', 'crypto market', 'crypto markets',
  ],
  markets: [
    'stocks', 'stock', 'stock market', 'shares', 'equities', 's&p 500', 's&p', 'dow', 'dow jones', 'nasdaq',
    'russell 2000', 'wall street', 'investors', 'investor', 'futures', 'bond', 'bonds', 'treasury', 'treasuries',
    'yields', 'yield', 'dollar', 'euro', 'yen', 'currency', 'currencies', 'forex', 'volatility', 'vix',
    'sell-off', 'selloff', 'rally', 'rallies', 'bull market', 'bear market', 'correction', 'record high',
    'all-time high', 'hedge fund', 'hedge funds', 'etf', 'etfs', 'index', 'indexes', 'indices', 'markets wrap',
    'premarket', 'pre-market', 'after-hours', 'market', 'markets', 'trading', 'traders', 'analyst', 'analysts',
    'downgrade', 'downgrades', 'upgrade', 'upgrades', 'price target', 'buyback', 'dividend', 'bankruptcy',
    'chapter 11', 'sec', 'banks', 'bank', 'jpmorgan', 'goldman', 'morgan stanley', 'blackrock', 'berkshire',
    'valuation', 'valuations', 'bubble',
  ],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One regex per category. Phrases are matched whole-word so short tickers like
 * "eth"/"sol"/"ada" can't fire on "method"/"solution"/"Canada". Longer
 * alternatives go first so "rate cuts" wins over "rate cut".
 */
const CATEGORY_PATTERNS: Record<NewsCategoryId, RegExp> = Object.fromEntries(
  (Object.entries(CATEGORY_KEYWORDS) as [NewsCategoryId, string[]][]).map(([key, words]) => {
    const alternatives = [...words].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
    // (?<![\w&]) / (?![\w&]) instead of \b so "s&p" and "m&a" still match whole.
    return [key, new RegExp(`(?<![\\w&])(?:${alternatives})(?![\\w&])`, 'gi')];
  }),
) as Record<NewsCategoryId, RegExp>;

function countHits(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return text.match(pattern)?.length ?? 0;
}

/**
 * Pick the category for a story. The headline must contain at least one
 * keyword — a summary-only match (an obituary that mentions "the economy")
 * is not a market story. Headline hits count double, summary hits break ties,
 * and remaining ties go to the earlier entry in NEWS_CATEGORY_ORDER.
 * Returns null when nothing market-relevant matched.
 */
export function pickCategory(headline: string, summary: string = ''): NewsCategoryId | null {
  const h = headline.toLowerCase();
  const sm = summary.toLowerCase();
  let best: NewsCategoryId | null = null;
  let bestScore = 0;
  let anyHeadlineHit = false;
  for (const key of NEWS_CATEGORY_ORDER) {
    const pattern = CATEGORY_PATTERNS[key];
    const headlineHits = countHits(h, pattern);
    if (headlineHits > 0) anyHeadlineHit = true;
    const score = headlineHits * 2 + (sm ? countHits(sm, pattern) : 0);
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return anyHeadlineHit ? best : null;
}

const BULLISH_KEYWORDS = ['rally', 'surge', 'soar', 'jump', 'pump', 'breakout', 'all-time high', 'ath', 'bull', 'bullish', 'moon', 'adoption', 'approval', 'approved', 'etf approved', 'upgrade', 'partnership', 'institutional', 'accumulate', 'buy signal', 'recovery', 'rebound', 'inflow', 'inflows'];
const BEARISH_KEYWORDS = ['crash', 'plunge', 'dump', 'drop', 'collapse', 'bear', 'bearish', 'sell-off', 'selloff', 'hack', 'hacked', 'exploit', 'rug pull', 'scam', 'fraud', 'ban', 'banned', 'crackdown', 'liquidat', 'outflow', 'outflows', 'sec sues', 'lawsuit', 'ponzi', 'warning', 'fear'];

function analyzeSentiment(headline: string, summary: string): 'bullish' | 'bearish' | 'neutral' {
  const text = `${headline} ${summary}`.toLowerCase();
  let bull = 0;
  let bear = 0;
  for (const kw of BULLISH_KEYWORDS) if (text.includes(kw)) bull++;
  for (const kw of BEARISH_KEYWORDS) if (text.includes(kw)) bear++;
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

export function categorizeNews(item: RawNewsItem, nowMs: number = Date.now()): CategorizedNews | null {
  const category =
    item.forceCategory ??
    pickCategory(item.headline, item.summary) ??
    item.fallbackCategory ??
    null;
  if (!category) return null;

  const meta = NEWS_CATEGORY_META[category];
  const result: CategorizedNews = {
    id: `${item.datetime}-${item.headline.slice(0, 30).replace(/\s+/g, '-')}`,
    category,
    categoryName: meta.name,
    priority: meta.priority,
    color: meta.color,
    headline: item.headline,
    summary: item.summary,
    source: item.source,
    url: item.url,
    related: item.related ? item.related.split(',').map((t) => t.trim()).filter(Boolean) : [],
    timestamp: item.datetime,
    timeAgo: formatTimeAgo(item.datetime, nowMs),
  };
  if (category === 'crypto') result.sentiment = analyzeSentiment(item.headline, item.summary);
  return result;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface FeedSource {
  name: string;
  url: string;
  /** Items from this feed always land here (single-topic feeds). */
  force?: NewsCategoryId;
  /** Items that match no keyword land here instead of being dropped. */
  fallback?: NewsCategoryId;
  /** Google News feeds carry the publisher in <source> and "Headline - Publisher" titles. */
  googleNews?: boolean;
  /** Per-feed cap (newest first). */
  limit?: number;
}

const GN = 'hl=en-US&gl=US&ceid=US:en';

/**
 * Free, key-less feeds. Every one of these was verified to return fresh items
 * on 2026-11-04. A feed that stops responding just logs a warning — the rest
 * keep flowing.
 */
export const FEED_SOURCES: FeedSource[] = [
  // Broad business / markets desks
  { name: 'CNBC Top News',        url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'CNBC Finance',         url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', fallback: 'markets' },
  { name: 'MarketWatch',          url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'WSJ Markets',          url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', fallback: 'markets' },
  { name: 'Bloomberg Markets',    url: 'https://feeds.bloomberg.com/markets/news.rss', fallback: 'markets' },
  { name: 'Financial Times',      url: 'https://www.ft.com/rss/home' },
  { name: 'NYT Business',         url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml' },
  { name: 'BBC Business',         url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'Guardian Business',    url: 'https://www.theguardian.com/business/rss' },
  { name: 'Investing.com',        url: 'https://www.investing.com/rss/news.rss' },
  { name: 'Google News Business', url: `https://news.google.com/rss/headlines/section/topic/BUSINESS?${GN}`, googleNews: true },

  // Economy / macro data
  { name: 'CNBC Economy',         url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', fallback: 'macro' },
  { name: 'WSJ Economy',          url: 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed', fallback: 'macro' },
  { name: 'Bloomberg Economics',  url: 'https://feeds.bloomberg.com/economics/news.rss', fallback: 'macro' },
  { name: 'NYT Economy',          url: 'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml', fallback: 'macro' },

  // Fed
  { name: 'Federal Reserve',      url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', force: 'fed', limit: 5 },

  // Politics / policy
  { name: 'CNBC Politics',        url: 'https://www.cnbc.com/id/10000113/device/rss/rss.html', fallback: 'politics' },
  { name: 'WSJ Politics',         url: 'https://feeds.content.dowjones.io/public/rss/socialpoliticsfeed', fallback: 'politics' },
  { name: 'Bloomberg Politics',   url: 'https://feeds.bloomberg.com/politics/news.rss', fallback: 'politics' },
  { name: 'NYT Politics',         url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', fallback: 'politics' },
  { name: 'Politico',             url: 'https://rss.politico.com/politics-news.xml', fallback: 'politics' },
  { name: 'Google News U.S.',     url: `https://news.google.com/rss/headlines/section/topic/NATION?${GN}`, googleNews: true },

  // World / geopolitics — keyword-gated so human-interest stories stay out
  { name: 'CNBC World',           url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { name: 'WSJ World',            url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews' },
  { name: 'NYT World',            url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { name: 'BBC World',            url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Guardian World',       url: 'https://www.theguardian.com/world/rss' },
  { name: 'Al Jazeera',           url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'Google News World',    url: `https://news.google.com/rss/headlines/section/topic/WORLD?${GN}`, googleNews: true },
  { name: 'Reuters (via Google)', url: `https://news.google.com/rss/search?q=site:reuters.com+when:1d&${GN}`, googleNews: true, limit: 40 },

  // Energy & commodities
  { name: 'OilPrice.com',         url: 'https://oilprice.com/rss/main', fallback: 'commodities' },

  // Earnings
  { name: 'CNBC Earnings',        url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html', fallback: 'earnings' },

  // AI & tech — single-topic feeds, filed directly
  { name: 'TechCrunch AI',        url: 'https://techcrunch.com/category/artificial-intelligence/feed/', force: 'ai', limit: 6 },
  { name: 'Ars Technica AI',      url: 'https://arstechnica.com/ai/feed/', force: 'ai', limit: 6 },
  { name: 'The Verge AI',         url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', force: 'ai', limit: 6 },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', force: 'ai', limit: 6 },
  { name: 'Wired AI',             url: 'https://www.wired.com/feed/tag/ai/latest/rss', force: 'ai', limit: 6 },
];

const DEFAULT_PER_FEED_LIMIT = 25;
/** Stories older than this are dropped — "breaking" means the last day and a half. */
const MAX_ITEM_AGE_MS = 36 * 60 * 60 * 1000;
const FEED_TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (compatible; ConfluenceTrading/1.0; +https://confluencetrading.app)';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const CRYPTOPANIC_API_KEY = process.env.CRYPTOPANIC_API_KEY;

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

/** Strip CDATA wrappers and markup, decode entities, collapse whitespace. */
export function cleanFeedText(raw: string): string {
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
 * Parse a feed date. Handles RFC-822 (most feeds), ISO-8601 (Atom), and the
 * zone-less "YYYY-MM-DD HH:MM:SS" Investing.com emits (which is UTC).
 */
export function parseFeedDate(raw: string | undefined, nowMs: number): number {
  if (!raw) return Math.floor(nowMs / 1000);
  let s = cleanFeedText(raw);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = `${s.replace(' ', 'T')}Z`;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? Math.floor(nowMs / 1000) : Math.floor(ms / 1000);
}

/**
 * Minimal RSS/Atom parser: headline, link, timestamp, summary (and publisher
 * for Google News feeds). Blocks without a title or an http(s) link are skipped.
 */
export function parseFeed(xml: string, feed: FeedSource, nowMs: number = Date.now()): RawNewsItem[] {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []),
  ];

  const items: RawNewsItem[] = [];
  for (const block of blocks) {
    let headline = cleanFeedText(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    if (!headline) continue;

    let source = feed.name;
    if (feed.googleNews) {
      const publisher = cleanFeedText(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? '');
      if (publisher) {
        source = publisher;
        // Google formats titles as "Headline - Publisher"; drop the suffix.
        const suffix = ` - ${publisher}`;
        if (headline.endsWith(suffix)) headline = headline.slice(0, -suffix.length).trim();
      } else {
        const dash = headline.lastIndexOf(' - ');
        if (dash > 0) {
          source = headline.slice(dash + 3).trim() || source;
          headline = headline.slice(0, dash).trim();
        }
      }
    }

    // RSS: <link>URL</link> (sometimes CDATA-wrapped); Atom: <link href="URL" rel="alternate"/>.
    const rssLink = cleanFeedText(block.match(/<link>\s*([\s\S]*?)\s*<\/link>/i)?.[1] ?? '');
    const atomLink =
      block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const url = (/^https?:\/\//i.test(rssLink) ? rssLink : atomLink ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;

    const dateRaw =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      block.match(/<published>([\s\S]*?)<\/published>/i)?.[1] ??
      block.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] ??
      block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1];

    const summaryRaw =
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ??
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
      '';
    let summary = cleanFeedText(summaryRaw).slice(0, 220);
    // Google News descriptions are just the headline wrapped in a link — useless.
    if (feed.googleNews) summary = '';

    items.push({
      datetime: parseFeedDate(dateRaw, nowMs),
      headline,
      summary,
      source,
      url,
      forceCategory: feed.force,
      fallbackCategory: feed.fallback,
    });
  }
  return items;
}

async function fetchFeed(feed: FeedSource, nowMs: number): Promise<RawNewsItem[]> {
  const response = await fetch(feed.url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  const minTs = Math.floor((nowMs - MAX_ITEM_AGE_MS) / 1000);
  return parseFeed(xml, feed, nowMs)
    .filter((item) => item.datetime >= minTs)
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, feed.limit ?? DEFAULT_PER_FEED_LIMIT);
}

// ---------------------------------------------------------------------------
// Keyed sources (optional)
// ---------------------------------------------------------------------------

interface FinnhubNewsItem {
  datetime: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  related?: string;
}

async function fetchFinnhub(category: 'general' | 'crypto', nowMs: number): Promise<RawNewsItem[]> {
  if (!FINNHUB_API_KEY) return [];
  const response = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_API_KEY}`, {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('response is not an array');
  const minTs = Math.floor((nowMs - MAX_ITEM_AGE_MS) / 1000);
  return (data as FinnhubNewsItem[])
    .filter((n) => n.headline && n.url && n.datetime >= minTs)
    .map((n): RawNewsItem => ({
      datetime: n.datetime,
      headline: n.headline,
      summary: (n.summary || '').slice(0, 220),
      source: n.source,
      url: n.url,
      related: n.related,
      // Finnhub's crypto category is crypto by construction.
      forceCategory: category === 'crypto' ? 'crypto' : undefined,
    }))
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, category === 'crypto' ? 15 : 40);
}

interface CryptoPanicPost {
  title: string;
  url: string;
  source: { title: string };
  published_at: string;
  currencies?: Array<{ code: string }>;
  votes?: { positive: number; negative: number };
}

async function fetchCryptoPanic(nowMs: number): Promise<RawNewsItem[]> {
  if (!CRYPTOPANIC_API_KEY) return [];
  const response = await fetch(
    `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_KEY}&filter=hot&kind=news`,
    { signal: AbortSignal.timeout(FEED_TIMEOUT_MS), cache: 'no-store', headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) throw new Error(`non-JSON response (${contentType || 'unknown'})`);
  const data = await response.json();
  const posts: CryptoPanicPost[] = data?.results ?? [];
  const minTs = Math.floor((nowMs - MAX_ITEM_AGE_MS) / 1000);
  return posts
    .map((post): RawNewsItem => {
      const votes = post.votes;
      const hint = votes && votes.positive > votes.negative ? 'bullish' : votes && votes.negative > votes.positive ? 'bearish' : '';
      return {
        datetime: Math.floor(new Date(post.published_at).getTime() / 1000),
        headline: post.title,
        summary: hint ? `Community sentiment: ${hint}` : '',
        source: post.source?.title ?? 'CryptoPanic',
        url: post.url,
        related: post.currencies?.map((c) => c.code).join(',') ?? '',
        forceCategory: 'crypto',
      };
    })
    .filter((n) => n.headline && n.url && n.datetime >= minTs)
    .slice(0, 15);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface FetchAllResult {
  items: RawNewsItem[];
  sourcesOk: number;
  failedSources: string[];
}

export async function fetchAllSources(nowMs: number = Date.now()): Promise<FetchAllResult> {
  const tasks: Array<{ name: string; run: () => Promise<RawNewsItem[]> }> = [
    ...FEED_SOURCES.map((feed) => ({ name: feed.name, run: () => fetchFeed(feed, nowMs) })),
  ];
  if (FINNHUB_API_KEY) {
    tasks.push({ name: 'Finnhub general', run: () => fetchFinnhub('general', nowMs) });
    tasks.push({ name: 'Finnhub crypto', run: () => fetchFinnhub('crypto', nowMs) });
  }
  if (CRYPTOPANIC_API_KEY) {
    tasks.push({ name: 'CryptoPanic', run: () => fetchCryptoPanic(nowMs) });
  }

  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  const items: RawNewsItem[] = [];
  const failedSources: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      failedSources.push(tasks[i].name);
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[MarketNews] ${tasks[i].name} failed: ${reason}`);
    }
  });
  return { items, sourcesOk: tasks.length - failedSources.length, failedSources };
}

/** Normalise a headline for de-duplication across outlets. */
export function headlineKey(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_PER_CATEGORY = 40;
const MAX_DIGEST = 40;
const MAX_DIGEST_PER_CATEGORY = 12;
/** Earnings previews are plentiful and rarely "breaking"; keep a few, not a wall. */
const DIGEST_CAPS: Partial<Record<NewsCategoryId, number>> = { earnings: 4 };

export function buildPayload(
  raw: RawNewsItem[],
  meta: { sourcesOk: number; failedSources: string[]; source: 'live' | 'mock' },
  nowMs: number = Date.now(),
): MarketNewsPayload {
  const seenHeadlines = new Set<string>();
  const seenUrls = new Set<string>();
  let categorized: CategorizedNews[] = [];

  // Newest first so the de-dupe keeps the freshest copy of a syndicated story.
  for (const item of [...raw].sort((a, b) => b.datetime - a.datetime)) {
    if (!/^https?:\/\//i.test((item.url || '').trim())) continue;
    const hk = headlineKey(item.headline);
    if (!hk || seenHeadlines.has(hk) || seenUrls.has(item.url)) continue;
    const result = categorizeNews(item, nowMs);
    if (!result) continue;
    seenHeadlines.add(hk);
    seenUrls.add(item.url);
    categorized.push(result);
  }

  // Cap each category so one prolific topic can't swamp the payload.
  const perCategory: Partial<Record<NewsCategoryId, number>> = {};
  categorized = categorized.filter((item) => {
    perCategory[item.category] = (perCategory[item.category] ?? 0) + 1;
    return (perCategory[item.category] ?? 0) <= MAX_PER_CATEGORY;
  });

  // "Breaking" digest: newest market-moving stories across the digest
  // categories. Pure recency — a 6-hour-old Fed headline must not outrank a
  // 5-minute-old war headline just because of a priority flag — but with a
  // per-category cap so one busy topic (election night, say) can't push every
  // Fed, war and energy story out of the default tab.
  const digestSet = new Set<NewsCategoryId>(DIGEST_CATEGORIES);
  const digestPerCategory: Partial<Record<NewsCategoryId, number>> = {};
  const highPriority: CategorizedNews[] = [];
  for (const item of categorized) {
    if (!digestSet.has(item.category)) continue;
    const n = digestPerCategory[item.category] ?? 0;
    if (n >= (DIGEST_CAPS[item.category] ?? MAX_DIGEST_PER_CATEGORY)) continue;
    digestPerCategory[item.category] = n + 1;
    highPriority.push(item);
    if (highPriority.length >= MAX_DIGEST) break;
  }

  const counts: Partial<Record<NewsCategoryId, number>> = {};
  const latestByCategory: Partial<Record<NewsCategoryId, CategorizedNews>> = {};
  for (const item of categorized) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    if (!latestByCategory[item.category]) latestByCategory[item.category] = item;
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    items: categorized,
    highPriority,
    latestByCategory,
    counts,
    totalScanned: raw.length,
    categorized: categorized.length,
    sourcesOk: meta.sourcesOk,
    sourcesFailed: meta.failedSources.length,
    failedSources: meta.failedSources,
    source: meta.source,
  };
}

/** Demo stories for environments with no outbound network at all. */
export function getMockNews(nowMs: number = Date.now()): RawNewsItem[] {
  const now = Math.floor(nowMs / 1000);
  return [
    { datetime: now - 900,   headline: 'Oil Slides 6% as Ceasefire Talks Resume in the Middle East', summary: 'Brent crude fell sharply after reports that negotiators had agreed to a framework for a truce.', source: 'Reuters', url: 'https://example.com/oil-ceasefire', related: 'USO,XLE' },
    { datetime: now - 1800,  headline: 'Fed Signals Potential Rate Cuts in Coming Months', summary: 'Federal Reserve officials indicated they may begin cutting interest rates as inflation continues to cool toward the 2% target.', source: 'Financial Times', url: 'https://example.com/fed-news', related: 'SPY,QQQ,GLD' },
    { datetime: now - 3600,  headline: 'White House Unveils Sweeping Tariff Package on Imports', summary: 'The administration announced new tariffs covering autos, steel and semiconductors, drawing immediate pushback from trading partners.', source: 'WSJ', url: 'https://example.com/tariffs', related: 'XLI,F,GM' },
    { datetime: now - 5400,  headline: 'CPI Report Shows Inflation Cooling Faster Than Expected', summary: 'The latest Consumer Price Index data came in below expectations, suggesting price pressures are easing.', source: 'Bloomberg', url: 'https://example.com/cpi-news', related: 'SPY,DIA' },
    { datetime: now - 7200,  headline: 'Stocks Rally to Record as Treasury Yields Retreat', summary: 'The S&P 500 and Nasdaq closed at all-time highs while the 10-year yield fell below 4%.', source: 'CNBC', url: 'https://example.com/stocks-record', related: 'SPY,QQQ' },
    { datetime: now - 9000,  headline: 'Tech Giants Announce Major Merger Worth $50 Billion', summary: 'Two major technology companies have agreed to merge in a deal that will reshape the industry landscape.', source: 'Reuters', url: 'https://example.com/merger-news', related: 'META,GOOGL' },
    { datetime: now - 10800, headline: 'Apple Beats Earnings Estimates, Stock Rises in After-Hours', summary: 'Apple reported quarterly earnings that exceeded Wall Street expectations, driven by strong iPhone and Services revenue.', source: 'CNBC', url: 'https://example.com/earnings-news', related: 'AAPL' },
    { datetime: now - 12600, headline: 'Nvidia Unveils Next-Gen AI Chip Aimed at Faster LLM Training', summary: 'The new GPU architecture targets large language model workloads, with major cloud providers already lining up orders.', source: 'The Verge', url: 'https://example.com/nvidia-ai-chip', related: 'NVDA', forceCategory: 'ai' },
    { datetime: now - 14400, headline: 'Bitcoin Surges Past $100K as Institutional Inflows Hit Record', summary: 'Bitcoin rally continues as ETF inflows reach all-time highs, signaling strong institutional adoption.', source: 'CoinDesk', url: 'https://example.com/btc-surge', related: 'BTC' },
  ];
}

// ---------------------------------------------------------------------------
// Cache + refresh
// ---------------------------------------------------------------------------

const CACHE_KEY = 'market_news:latest';
const LOCK_KEY = 'market_news:refreshing';
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const LOCK_TTL_SECONDS = 60;

async function readCache(): Promise<MarketNewsPayload | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MarketNewsPayload) : null;
  } catch (err) {
    console.warn('[MarketNews] cache read failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function writeCache(payload: MarketNewsPayload): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(CACHE_KEY, JSON.stringify(payload), { EX: CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn('[MarketNews] cache write failed:', err instanceof Error ? err.message : err);
  }
}

async function acquireLock(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const ok = await redis.set(LOCK_KEY, String(Date.now()), { NX: true, EX: LOCK_TTL_SECONDS });
    return ok === 'OK';
  } catch {
    // No Redis → no coordination possible; just refresh.
    return true;
  }
}

async function releaseLock(): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(LOCK_KEY);
  } catch { /* ignore */ }
}

/** Pull every source, build the payload and store it. Used by the cron. */
export async function refreshMarketNews(): Promise<MarketNewsPayload> {
  const started = Date.now();
  const { items, sourcesOk, failedSources } = await fetchAllSources(started);

  let payload: MarketNewsPayload;
  if (items.length === 0) {
    console.warn('[MarketNews] every source failed — serving demo stories');
    payload = buildPayload(getMockNews(started), { sourcesOk, failedSources, source: 'mock' }, started);
  } else {
    payload = buildPayload(items, { sourcesOk, failedSources, source: 'live' }, started);
  }

  // Never overwrite a good live cache with the demo set.
  if (payload.source === 'live') await writeCache(payload);

  console.log(
    `[MarketNews] refreshed: ${payload.categorized} stories from ${payload.totalScanned} scanned, ` +
    `${sourcesOk} sources ok, ${failedSources.length} failed, ${Date.now() - started}ms`,
  );
  return payload;
}

export function isPayloadFresh(payload: MarketNewsPayload, nowMs: number = Date.now(), maxAgeMs: number = NEWS_REFRESH_INTERVAL_MS): boolean {
  const generated = Date.parse(payload.generatedAt);
  return !Number.isNaN(generated) && nowMs - generated < maxAgeMs;
}

/**
 * Read the latest payload for the UI. Serves the cache when it is younger than
 * the refresh interval; otherwise refreshes inline (lock-guarded) and falls
 * back to the stale copy if another instance is already refreshing.
 */
export async function getMarketNews(): Promise<MarketNewsPayload> {
  const cached = await readCache();
  if (cached && isPayloadFresh(cached)) return cached;

  if (await acquireLock()) {
    try {
      return await refreshMarketNews();
    } finally {
      await releaseLock();
    }
  }

  if (cached) return cached;
  // Someone else holds the lock and there is nothing cached yet (cold start):
  // do the pull anyway rather than return nothing.
  return refreshMarketNews();
}
