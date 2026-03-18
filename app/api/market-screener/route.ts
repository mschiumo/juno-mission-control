import { NextResponse } from 'next/server';
import { createClient } from 'redis';

interface NewsItem {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

interface ScreenerItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  timestamp: string;
  datetime: number;
  related: string[];
  category: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  keywords: string[];
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const REDIS_KEY = 'market_screener';
const CACHE_TTL = 600;

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  
  try {
    const client = createClient({ url: process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Redis connection failed:', error);
    return null;
  }
}

const KEYWORDS = {
  fed: ['fed', 'fomc', 'powell', 'interest rate', 'federal reserve', 'rate cut', 'rate hike'],
  inflation: ['cpi', 'inflation', 'ppi', 'jobs report', 'non-farm payrolls', 'unemployment', 'nfp'],
  crypto: ['bitcoin', 'btc', 'crypto', 'cryptocurrency', 'ethereum', 'eth', 'blockchain'],
  market: ['market crash', 'rally', 'sell-off', 'selloff', 'bull market', 'bear market', 'correction'],
  stocks: ['aapl', 'tsla', 'nvda', 'googl', 'amzn', 'msft', 'meta', 'pltr']
};

const SENTIMENT_KEYWORDS = {
  bullish: ['rally', 'surge', 'jump', 'rise', 'gain', 'bull', 'bullish', 'moon', 'rocket', 'breakout', 'upgrade', 'beat', 'outperform'],
  bearish: ['crash', 'plunge', 'drop', 'fall', 'decline', 'bear', 'bearish', 'dump', 'sell-off', 'selloff', 'correction', 'downgrade', 'miss', 'underperform', 'recession'],
  highImpact: ['fed', 'fomc', 'powell', 'cpi', 'inflation', 'jobs report', 'non-farm payrolls', 'nfp', 'rate cut', 'rate hike', 'crash', 'emergency']
};

function detectKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  Object.entries(KEYWORDS).forEach(([category, words]) => {
    words.forEach(word => {
      if (lowerText.includes(word.toLowerCase())) found.push(word);
    });
  });
  
  return [...new Set(found)];
}

function analyzeSentiment(headline: string, summary: string): { sentiment: 'bullish' | 'bearish' | 'neutral'; impact: 'high' | 'medium' | 'low' } {
  const text = (headline + ' ' + summary).toLowerCase();
  
  let bullishScore = 0, bearishScore = 0, impactScore = 0;
  
  SENTIMENT_KEYWORDS.bullish.forEach(word => { if (text.includes(word)) bullishScore++; });
  SENTIMENT_KEYWORDS.bearish.forEach(word => { if (text.includes(word)) bearishScore++; });
  SENTIMENT_KEYWORDS.highImpact.forEach(word => { if (text.includes(word)) impactScore++; });
  
  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullishScore > bearishScore) sentiment = 'bullish';
  else if (bearishScore > bullishScore) sentiment = 'bearish';
  
  let impact: 'high' | 'medium' | 'low' = 'low';
  if (impactScore >= 2) impact = 'high';
  else if (impactScore === 1) impact = 'medium';
  
  if (text.includes('aapl') || text.includes('tsla') || text.includes('nvda')) {
    impact = impact === 'low' ? 'medium' : 'high';
  }
  
  return { sentiment, impact };
}

async function fetchFinnhubNews(): Promise<NewsItem[]> {
  if (!FINNHUB_API_KEY) return [];

  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const fromDate = yesterday.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=GENERAL&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 300 } }
    );
    
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Finnhub news error:', error);
    return [];
  }
}

async function fetchSymbolNews(symbols: string[]): Promise<NewsItem[]> {
  if (!FINNHUB_API_KEY) return [];
  
  const allNews: NewsItem[] = [];
  
  for (const symbol of symbols.slice(0, 5)) {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const fromDate = yesterday.toISOString().split('T')[0];
      const toDate = today.toISOString().split('T')[0];
      
      const response = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`,
        { next: { revalidate: 300 } }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) allNews.push(...data);
      }
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Error fetching ${symbol} news:`, error);
    }
  }
  
  return allNews;
}

function processNewsItems(news: NewsItem[]): ScreenerItem[] {
  const seen = new Set<string>();
  const processed: ScreenerItem[] = [];
  
  const sortedNews = news.sort((a, b) => b.datetime - a.datetime);
  
  for (const item of sortedNews) {
    const key = item.headline.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    
    const keywords = detectKeywords(item.headline + ' ' + item.summary);
    if (keywords.length === 0) continue;
    
    const { sentiment, impact } = analyzeSentiment(item.headline, item.summary);
    
    processed.push({
      id: item.id.toString(),
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      url: item.url,
      timestamp: new Date(item.datetime * 1000).toISOString(),
      datetime: item.datetime,
      related: item.related ? item.related.split(',').filter(Boolean) : [],
      category: item.category,
      sentiment,
      impact,
      keywords
    });
  }
  
  return processed;
}

async function getCachedData(): Promise<ScreenerItem[] | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;
    
    const cached = await redis.get(REDIS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL * 1000) {
        return parsed.data;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function cacheData(data: ScreenerItem[]): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    await redis.set(REDIS_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

function getMockData(): ScreenerItem[] {
  const now = Date.now() / 1000;
  
  return [
    {
      id: '1',
      headline: 'Fed Signals Potential Rate Cuts in 2025 as Inflation Cools',
      summary: 'Federal Reserve Chairman Jerome Powell indicated that the central bank may begin cutting interest rates this year as inflation shows signs of cooling toward the 2% target.',
      source: 'Bloomberg',
      url: 'https://www.bloomberg.com',
      timestamp: new Date((now - 3600) * 1000).toISOString(),
      datetime: now - 3600,
      related: ['SPY', 'QQQ'],
      category: 'top news',
      sentiment: 'bullish',
      impact: 'high',
      keywords: ['fed', 'powell', 'rate cut']
    },
    {
      id: '2',
      headline: 'Bitcoin Surges Past $100K as ETF Inflows Accelerate',
      summary: 'Bitcoin has broken above $100,000 as institutional investors continue pouring money into spot Bitcoin ETFs.',
      source: 'CoinDesk',
      url: 'https://www.coindesk.com',
      timestamp: new Date((now - 7200) * 1000).toISOString(),
      datetime: now - 7200,
      related: ['BTC', 'COIN'],
      category: 'crypto',
      sentiment: 'bullish',
      impact: 'high',
      keywords: ['bitcoin', 'btc', 'crypto']
    },
    {
      id: '3',
      headline: 'CPI Report Shows Inflation Cooling Faster Than Expected',
      summary: 'The latest Consumer Price Index report shows inflation rising just 0.2% in January, below the 0.3% forecast.',
      source: 'Reuters',
      url: 'https://www.reuters.com',
      timestamp: new Date((now - 10800) * 1000).toISOString(),
      datetime: now - 10800,
      related: ['SPY', 'DIA'],
      category: 'economy',
      sentiment: 'bullish',
      impact: 'high',
      keywords: ['cpi', 'inflation']
    },
    {
      id: '4',
      headline: 'Tesla Stock Plunges on Production Concerns',
      summary: 'Tesla shares dropped 5% in pre-market trading following reports of production slowdowns.',
      source: 'CNBC',
      url: 'https://www.cnbc.com',
      timestamp: new Date((now - 1800) * 1000).toISOString(),
      datetime: now - 1800,
      related: ['TSLA'],
      category: 'company news',
      sentiment: 'bearish',
      impact: 'medium',
      keywords: ['tsla']
    },
    {
      id: '5',
      headline: 'NVIDIA Unveils Next-Gen AI Chips at GTC Conference',
      summary: 'NVIDIA CEO Jensen Huang announced the new Blackwell Ultra chips, promising 4x performance improvement.',
      source: 'TechCrunch',
      url: 'https://www.techcrunch.com',
      timestamp: new Date((now - 5400) * 1000).toISOString(),
      datetime: now - 5400,
      related: ['NVDA'],
      category: 'tech',
      sentiment: 'bullish',
      impact: 'medium',
      keywords: ['nvda']
    }
  ];
}

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    const cached = await getCachedData();
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        timestamp,
        source: 'cache',
        count: cached.length
      });
    }
    
    const [generalNews, symbolNews] = await Promise.all([
      fetchFinnhubNews(),
      fetchSymbolNews(['AAPL', 'TSLA', 'NVDA', 'BTC', 'ETH'])
    ]);
    
    const allNews = [...generalNews, ...symbolNews];
    const uniqueNews = allNews.filter((item, index, self) => 
      index === self.findIndex((t) => t.headline === item.headline)
    );
    
    let processedData = processNewsItems(uniqueNews);
    
    let source = 'live';
    if (processedData.length === 0) {
      processedData = getMockData();
      source = 'fallback';
    }
    
    processedData.sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      if (impactOrder[a.impact] !== impactOrder[b.impact]) {
        return impactOrder[b.impact] - impactOrder[a.impact];
      }
      return b.datetime - a.datetime;
    });
    
    await cacheData(processedData);
    
    return NextResponse.json({
      success: true,
      data: processedData,
      timestamp,
      source,
      count: processedData.length
    });
    
  } catch (error) {
    console.error('Market screener error:', error);
    const mockData = getMockData();
    return NextResponse.json({
      success: true,
      data: mockData,
      timestamp,
      source: 'fallback',
      count: mockData.length
    });
  }
}
