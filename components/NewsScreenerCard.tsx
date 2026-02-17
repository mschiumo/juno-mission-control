'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, RefreshCw, Filter, Bell, TrendingUp, AlertCircle } from 'lucide-react';

interface NewsItem {
  id: string;
  category: string;
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

interface NewsData {
  items: NewsItem[];
  latestByCategory: Record<string, NewsItem>;
  counts: Record<string, number>;
  totalScanned: number;
  categorized: number;
}

interface NewsResponse {
  success: boolean;
  data: NewsData;
  timestamp: string;
  source: 'live' | 'mock';
  categories: string[];
  nextUpdate: string;
}

type NewsCategory = 'all' | 'fed' | 'whitehouse' | 'mergers' | 'ipo' | 'earnings' | 'economic';

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  all: { label: 'All News', color: '#f97316', icon: <Newspaper className="w-4 h-4" /> },
  fed: { label: 'Fed', color: '#8b5cf6', icon: <TrendingUp className="w-4 h-4" /> },
  whitehouse: { label: 'Policy', color: '#3b82f6', icon: <AlertCircle className="w-4 h-4" /> },
  mergers: { label: 'M&A', color: '#f97316', icon: <TrendingUp className="w-4 h-4" /> },
  ipo: { label: 'IPOs', color: '#22c55e', icon: <TrendingUp className="w-4 h-4" /> },
  earnings: { label: 'Earnings', color: '#14b8a6', icon: <TrendingUp className="w-4 h-4" /> },
  economic: { label: 'Economic', color: '#ef4444', icon: <AlertCircle className="w-4 h-4" /> }
};

export default function NewsScreenerCard() {
  const [data, setData] = useState<NewsData | null>(null);
  const [response, setResponse] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('all');
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);

  useEffect(() => {
    fetchNews();
    // Auto-refresh every 15 minutes
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/news-screener');
      const result: NewsResponse = await res.json();
      if (result.success) {
        setData(result.data);
        setResponse(result);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredNews = useCallback(() => {
    if (!data?.items) return [];
    
    let filtered = data.items;
    
    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category === activeCategory);
    }
    
    // Filter by priority
    if (highPriorityOnly) {
      filtered = filtered.filter(item => item.priority === 'high');
    }
    
    return filtered;
  }, [data, activeCategory, highPriorityOnly]);

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getCategoryCount = (category: string) => {
    if (!data?.counts) return 0;
    return category === 'all' 
      ? data.categorized 
      : data.counts[category] || 0;
  };

  const newsItems = filteredNews();
  const dataSource = response?.source || 'mock';

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
            <Newspaper className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-lg font-semibold text-white">News Screener</h2>
              {!loading && dataSource === 'live' && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#238636]/20 text-[#238636]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#238636] animate-pulse"></span>
                  LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#238636]">
                  updated {formatLastUpdated()}
                </span>
              )}
              {dataSource === 'mock' && !loading && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#d29922]/20 text-[#d29922]">
                  DEMO
                </span>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={fetchNews}
          disabled={loading}
          className="pill p-2"
          title="Refresh news"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Category Filters */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-[#8b949e]" />
          <span className="text-xs text-[#8b949e]">Filter by category</span>
        </div>
        
        {/* Category Pills - Scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {(['all', 'fed', 'whitehouse', 'mergers', 'ipo', 'earnings', 'economic'] as NewsCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === cat
                  ? 'bg-[#ff6b35] text-white'
                  : 'bg-[#0d1117] text-[#8b949e] hover:text-white hover:bg-[#30363d]'
              }`}
            >
              {cat !== 'all' && (
                <span 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: CATEGORY_CONFIG[cat].color }}
                ></span>
              )}
              {CATEGORY_CONFIG[cat].label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                activeCategory === cat ? 'bg-white/20' : 'bg-[#30363d]'
              }`}>
                {getCategoryCount(cat)}
              </span>
            </button>
          ))}
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setHighPriorityOnly(!highPriorityOnly)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              highPriorityOnly
                ? 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'
                : 'bg-[#0d1117] text-[#8b949e] border border-[#30363d] hover:text-white'
            }`}
          >
            <Bell className={`w-3.5 h-3.5 ${highPriorityOnly ? 'fill-current' : ''}`} />
            High Priority Only
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {data && (
        <div className="flex items-center justify-between mb-4 px-1 text-xs text-[#8b949e]">
          <span>Showing <span className="text-white font-medium">{newsItems.length}</span> of {data.categorized} items</span>
          <span>Scanned {data.totalScanned} sources</span>
        </div>
      )}

      {/* News List */}
      <div className="max-h-[500px] overflow-y-auto pr-1 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p className="text-sm">Scanning for market-moving news...</p>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No news items match your filters</p>
            <p className="text-xs mt-1">Try adjusting your category or priority filters</p>
          </div>
        ) : (
          newsItems.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#ff6b35]/50 transition-all group"
            >
              {/* Header Row */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Category Badge */}
                  <span 
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.categoryName}
                  </span>
                  
                  {/* Priority Badge */}
                  {item.priority === 'high' && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#ef4444]/20 text-[#ef4444]">
                      <Bell className="w-3 h-3" />
                      HIGH
                    </span>
                  )}
                  
                  {/* Source */}
                  <span className="text-[10px] text-[#8b949e]">
                    {item.source}
                  </span>
                </div>
                
                {/* Time */}
                <span className="text-[10px] text-[#8b949e] whitespace-nowrap">
                  {item.timeAgo}
                </span>
              </div>
              
              {/* Headline */}
              <h3 className="text-sm font-medium text-white group-hover:text-[#ff6b35] transition-colors mb-2 line-clamp-2">
                {item.headline}
                <ExternalLink className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
              </h3>
              
              {/* Summary */}
              <p className="text-xs text-[#8b949e] line-clamp-2 mb-3">
                {item.summary}
              </p>
              
              {/* Related Tickers */}
              {item.related.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-[#8b949e]">Related:</span>
                  {item.related.slice(0, 5).map((ticker) => (
                    <span 
                      key={ticker}
                      className="px-1.5 py-0.5 bg-[#30363d] rounded text-[10px] text-[#58a6ff] font-mono"
                    >
                      {ticker}
                    </span>
                  ))}
                  {item.related.length > 5 && (
                    <span className="text-[10px] text-[#8b949e]">
                      +{item.related.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </a>
          ))
        )}
      </div>

      {/* Footer */}
      {data && (
        <div className="mt-4 pt-4 border-t border-[#30363d]">
          <div className="flex items-center justify-between text-[10px] text-[#8b949e]">
            <span>Categories: Fed, Policy, M&A, IPOs, Earnings, Economic</span>
            <span>Updates every 15 min</span>
          </div>
        </div>
      )}
    </div>
  );
}
