import { NextResponse } from 'next/server';

// News categories with their keywords for filtering
const NEWS_CATEGORIES = {
  fed: {
    name: 'Fed & Monetary Policy',
    keywords: ['fed', 'fomc', 'federal reserve', 'interest rate', 'rate hike', 'rate cut', 'jerome powell', 'monetary policy', 'fed chair'],
    priority: 'high',
    color: '#8b5cf6' // Purple
  },
  whitehouse: {
    name: 'White House & Policy',
    keywords: ['white house', 'executive order', 'biden', 'trump', 'administration', 'policy', 'legislation', 'congress', 'senate', 'house of representatives', 'regulation'],
    priority: 'high',
    color: '#3b82f6' // Blue
  },
  mergers: {
    name: 'M&A',
    keywords: ['merger', 'acquisition', 'acquire', 'acquiring', 'buyout', 'takeover', 'merging', 'deal', 'purchased by', 'to buy', 'to acquire'],
    priority: 'high',
    color: '#f97316' // Orange
  },
  ipo: {
    name: 'IPOs',
    keywords: ['ipo', 'initial public offering', 'going public', 'public offering', 'listing', 'spac', 'direct listing'],
    priority: 'medium',
    color: '#22c55e' // Green
  },
  earnings: {
    name: 'Earnings',
    keywords: ['earnings', 'beats', 'misses', 'revenue', 'profit', 'loss', 'quarterly results', 'q1', 'q2', 'q3', 'q4', 'guidance', 'outlook'],
    priority: 'medium',
    color: '#14b8a6' // Teal
  },
  economic: {
    name: 'Economic Data',
    keywords: ['cpi', 'inflation', 'jobs report', 'unemployment', 'gdp', 'non-farm payrolls', 'nfp', 'retail sales', 'consumer confidence', 'pmi', 'economic growth'],
    priority: 'high',
    color: '#ef4444' // Red
  }
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
}

// Finnhub free tier: 60 calls/minute
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/**
 * Categorize news based on headline and summary content
 */
function categorizeNews(item: NewsItem): CategorizedNews | null {
  const text = `${item.headline} ${item.summary}`.toLowerCase();
  
  for (const [key, config] of Object.entries(NEWS_CATEGORIES)) {
    const matches = config.keywords.some(keyword => text.includes(keyword.toLowerCase()));
    
    if (matches) {
      return {
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

/**
 * Fetch general market news from Finnhub
 * Free tier: 60 calls/minute
 */
async function fetchFinnhubNews(): Promise<NewsItem[]> {
  if (!FINNHUB_API_KEY) {
    console.warn('FINNHUB_API_KEY not set, using mock data');
    return getMockNews();
  }
  
  try {
    // Get news from the last 24 hours
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fromDate = yesterday.toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 900 } } // Cache for 15 minutes
    );
    
    if (!response.ok) {
      console.warn(`Finnhub news error: ${response.status}`);
      return getMockNews();
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.warn('Finnhub news response is not an array');
      return getMockNews();
    }
    
    return data;
  } catch (error) {
    console.error('Finnhub news fetch error:', error);
    return getMockNews();
  }
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
    
    // Fetch news from Finnhub
    const rawNews = await fetchFinnhubNews();
    
    // Categorize news items
    const categorizedNews: CategorizedNews[] = [];
    const seenHeadlines = new Set<string>();
    
    for (const item of rawNews) {
      // Skip duplicates
      if (seenHeadlines.has(item.headline)) continue;
      seenHeadlines.add(item.headline);
      
      const categorized = categorizeNews(item);
      if (categorized) {
        categorizedNews.push(categorized);
      }
    }
    
    // Sort by timestamp (newest first), then by priority
    categorizedNews.sort((a, b) => {
      // High priority first
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      // Then by timestamp
      return b.timestamp - a.timestamp;
    });
    
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
        items: categorizedNews.slice(0, 50), // Return top 50 items
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
