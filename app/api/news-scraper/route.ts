import { createClient } from 'redis';
import { NextResponse } from 'next/server';

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  summary: string;
  publishedAt: string;
  category?: string;
  image?: string;
}

interface CachedNewsData {
  items: NewsItem[];
  timestamp: string;
  source: 'live' | 'cache' | 'fallback';
}

const CACHE_KEY = 'news_feed';
const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const NEWS_CATEGORIES = ['general', 'crypto', 'forex', 'merger'];

// Keywords for filtering relevant financial news
const RELEVANT_KEYWORDS = [
  'crypto', 'bitcoin', 'ethereum', 'blockchain', 'defi', 'nft',
  'fed', 'federal reserve', 'interest rate', 'inflation', 'recession',
  'market', 'stock', 'trading', 'bull', 'bear', 'rally', 'selloff',
  'earnings', 'revenue', 'profit', 'loss', 'ipo', 'merger', 'acquisition',
  'tech', 'ai', 'artificial intelligence', 'semiconductor', 'chip',
  'tesla', 'apple', 'google', 'amazon', 'microsoft', 'nvidia', 'meta',
  'oil', 'gold', 'commodity', 'dollar', 'euro', 'yen'
];

// Priority sources for financial news
const PRIORITY_SOURCES = [
  'Bloomberg', 'Reuters', 'CNBC', 'Financial Times', 'WSJ', 'Wall Street Journal',
  'MarketWatch', 'Investopedia', 'The Block', 'CoinDesk', 'CoinTelegraph',
  'TechCrunch', 'The Verge', 'Ars Technica'
];

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.REDIS_URL || undefined
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

/**
 * Fetch news from Finnhub API
 * Categories: general, forex, crypto, merger
 */
async function fetchFinnhubNews(category: string): Promise<NewsItem[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('FINNHUB_API_KEY not set');
    return [];
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=${category}&token=${apiKey}`,
      { next: { revalidate: 0 } } // Don't cache at Next.js level
    );
    
    if (!response.ok) {
      console.warn(`Finnhub news error for ${category}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.warn(`Unexpected Finnhub response for ${category}:`, data);
      return [];
    }
    
    return data.map((item: {
      headline: string;
      source: string;
      url: string;
      summary: string;
      datetime: number;
      category?: string;
      image?: string;
    }) => ({
      headline: item.headline || 'Untitled',
      source: item.source || 'Unknown',
      url: item.url || '#',
      summary: item.summary || '',
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      category: category,
      image: item.image
    }));
  } catch (error) {
    console.error(`Finnhub news fetch error for ${category}:`, error);
    return [];
  }
}

/**
 * Calculate relevance score for a news item
 * Higher score = more relevant to financial markets
 */
function calculateRelevanceScore(item: NewsItem): number {
  let score = 0;
  const text = `${item.headline} ${item.summary}`.toLowerCase();
  
  // Check for relevant keywords
  for (const keyword of RELEVANT_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }
  
  // Boost score for priority sources
  const sourceLower = item.source.toLowerCase();
  for (const prioritySource of PRIORITY_SOURCES) {
    if (sourceLower.includes(prioritySource.toLowerCase())) {
      score += 3;
      break;
    }
  }
  
  // Boost for crypto category
  if (item.category === 'crypto') {
    score += 2;
  }
  
  // Boost for recent news (within last 6 hours)
  const publishedTime = new Date(item.publishedAt).getTime();
  const hoursAgo = (Date.now() - publishedTime) / (1000 * 60 * 60);
  if (hoursAgo < 6) {
    score += 2;
  } else if (hoursAgo < 24) {
    score += 1;
  }
  
  return score;
}

/**
 * Fetch and aggregate news from all categories
 */
async function fetchAllNews(): Promise<NewsItem[]> {
  // Fetch from all categories in parallel
  const allNewsArrays = await Promise.all(
    NEWS_CATEGORIES.map(category => fetchFinnhubNews(category))
  );
  
  // Combine all news
  const allNews = allNewsArrays.flat();
  
  // Remove duplicates based on URL
  const seenUrls = new Set<string>();
  const uniqueNews = allNews.filter(item => {
    if (seenUrls.has(item.url)) {
      return false;
    }
    seenUrls.add(item.url);
    return true;
  });
  
  // Calculate relevance scores and sort
  const scoredNews = uniqueNews.map(item => ({
    ...item,
    score: calculateRelevanceScore(item)
  }));
  
  // Sort by relevance score (descending), then by date (most recent first)
  scoredNews.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  
  // Return top 15 most relevant items
  return scoredNews.slice(0, 15).map(({ score, ...item }) => item);
}

/**
 * Get cached news from Redis
 */
async function getCachedNews(redis: ReturnType<typeof createClient>): Promise<CachedNewsData | null> {
  try {
    const data = await redis.get(CACHE_KEY);
    if (data) {
      const parsed = JSON.parse(data) as CachedNewsData;
      // Check if cache is still valid (less than 15 minutes old)
      const cacheAge = Date.now() - new Date(parsed.timestamp).getTime();
      const maxAge = CACHE_TTL_SECONDS * 1000;
      
      if (cacheAge < maxAge) {
        return { ...parsed, source: 'cache' };
      }
    }
    return null;
  } catch (error) {
    console.error('Error reading cached news:', error);
    return null;
  }
}

/**
 * Save news to Redis cache
 */
async function cacheNews(redis: ReturnType<typeof createClient>, items: NewsItem[]): Promise<void> {
  try {
    const data: CachedNewsData = {
      items,
      timestamp: new Date().toISOString(),
      source: 'live'
    };
    await redis.setEx(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(data));
  } catch (error) {
    console.error('Error caching news:', error);
  }
}

/**
 * Get fallback/mock news data when APIs fail
 */
function getFallbackNews(): NewsItem[] {
  const now = new Date();
  return [
    {
      headline: "Markets Await Federal Reserve Decision on Interest Rates",
      source: "Reuters",
      url: "https://www.reuters.com/markets/",
      summary: "Investors are closely watching for signals from the Federal Reserve regarding future monetary policy decisions.",
      publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      category: "general"
    },
    {
      headline: "Bitcoin Surges Past Key Resistance Level",
      source: "CoinDesk",
      url: "https://www.coindesk.com/",
      summary: "Cryptocurrency markets show strength as Bitcoin breaks through important technical resistance.",
      publishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      category: "crypto"
    },
    {
      headline: "Tech Stocks Rally on AI Optimism",
      source: "CNBC",
      url: "https://www.cnbc.com/",
      summary: "Major technology companies lead market gains as artificial intelligence investments continue to drive growth.",
      publishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      category: "general"
    },
    {
      headline: "Oil Prices Stabilize Amid Supply Concerns",
      source: "Bloomberg",
      url: "https://www.bloomberg.com/",
      summary: "Energy markets find equilibrium as production data offsets geopolitical tensions.",
      publishedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
      category: "general"
    }
  ];
}

/**
 * Format time ago for display
 */
function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const hasFinnhubKey = !!process.env.FINNHUB_API_KEY;
  
  try {
    const redis = await getRedisClient();
    
    // Try to get cached data first
    if (redis) {
      const cached = await getCachedNews(redis);
      if (cached) {
        console.log('Returning cached news data');
        return NextResponse.json({
          success: true,
          data: {
            items: cached.items,
            lastUpdated: cached.timestamp,
            cached: true
          },
          timestamp,
          source: 'cache'
        });
      }
    }
    
    // Fetch fresh data if no valid cache
    if (!hasFinnhubKey) {
      console.warn('FINNHUB_API_KEY not configured, using fallback data');
      const fallbackNews = getFallbackNews();
      return NextResponse.json({
        success: true,
        data: {
          items: fallbackNews,
          lastUpdated: timestamp,
          cached: false
        },
        timestamp,
        source: 'fallback'
      });
    }
    
    console.log('Fetching fresh news from Finnhub');
    const newsItems = await fetchAllNews();
    
    // Cache the fresh data
    if (redis && newsItems.length > 0) {
      await cacheNews(redis, newsItems);
    }
    
    // If no news fetched but we have Redis, try to get stale cache
    if (newsItems.length === 0 && redis) {
      const staleData = await redis.get(CACHE_KEY);
      if (staleData) {
        const parsed = JSON.parse(staleData) as CachedNewsData;
        console.log('Using stale cache as fallback');
        return NextResponse.json({
          success: true,
          data: {
            items: parsed.items,
            lastUpdated: parsed.timestamp,
            cached: true,
            stale: true
          },
          timestamp,
          source: 'cache-stale'
        });
      }
    }
    
    // Return live data or fallback if empty
    const finalItems = newsItems.length > 0 ? newsItems : getFallbackNews();
    const source = newsItems.length > 0 ? 'live' : 'fallback';
    
    console.log(`News data: source=${source}, items=${finalItems.length}`);
    
    return NextResponse.json({
      success: true,
      data: {
        items: finalItems,
        lastUpdated: timestamp,
        cached: false
      },
      timestamp,
      source
    });
    
  } catch (error) {
    console.error('News scraper error:', error);
    
    // Try to return cached data on error
    try {
      const redis = await getRedisClient();
      if (redis) {
        const staleData = await redis.get(CACHE_KEY);
        if (staleData) {
          const parsed = JSON.parse(staleData) as CachedNewsData;
          return NextResponse.json({
            success: true,
            data: {
              items: parsed.items,
              lastUpdated: parsed.timestamp,
              cached: true,
              stale: true
            },
            timestamp,
            source: 'cache-error'
          });
        }
      }
    } catch (cacheError) {
      console.error('Error reading cache during recovery:', cacheError);
    }
    
    // Final fallback
    return NextResponse.json({
      success: true,
      data: {
        items: getFallbackNews(),
        lastUpdated: timestamp,
        cached: false
      },
      timestamp,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}