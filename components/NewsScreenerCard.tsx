'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, RefreshCw, Bell, TrendingUp, TrendingDown, Minus } from 'lucide-react';

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
  sentiment?: 'bullish' | 'bearish' | 'neutral';
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

type NewsCategory = 'all' | 'fed' | 'macro' | 'mergers' | 'earnings' | 'ai' | 'crypto';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  all:      { label: 'All',     color: '#f97316' },
  fed:      { label: 'Fed',     color: '#8b5cf6' },
  macro:    { label: 'Macro',   color: '#3b82f6' },
  mergers:  { label: 'M&A',     color: '#f97316' },
  earnings: { label: 'Earnings',color: '#14b8a6' },
  ai:       { label: 'AI',      color: '#22c55e' },
  crypto:   { label: 'Crypto',  color: '#f59e0b' },
};

const SENTIMENT_CONFIG = {
  bullish: { label: 'Bullish', color: '#22c55e', Icon: TrendingUp },
  bearish: { label: 'Bearish', color: '#ef4444', Icon: TrendingDown },
  neutral: { label: 'Neutral', color: '#8b949e', Icon: Minus },
} as const;

export default function NewsScreenerCard() {
  const [data, setData] = useState<NewsData | null>(null);
  const [response, setResponse] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('all');
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);

  useEffect(() => {
    fetchNews();
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
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category === activeCategory);
    }
    if (highPriorityOnly) {
      filtered = filtered.filter(item => item.priority === 'high');
    }
    return filtered;
  }, [data, activeCategory, highPriorityOnly]);

  const getCategoryCount = (category: string) => {
    if (!data?.counts) return 0;
    return category === 'all' ? data.categorized : data.counts[category] || 0;
  };

  const newsItems = filteredNews();
  const dataSource = response?.source || 'mock';

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#F97316]/10 border border-[#F97316]/20 flex items-center justify-center flex-shrink-0">
            <Newspaper className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-white tracking-tight">Market News</h2>
              {!loading && dataSource === 'live' && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#238636]/20 text-[#3fb950] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse"></span>
                  LIVE
                </span>
              )}
              {dataSource === 'mock' && !loading && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d29922]/20 text-[#d29922] font-medium">
                  DEMO
                </span>
              )}
            </div>
            <p className="text-xs text-[#8b949e] mt-0.5">
              Market-moving headlines across Fed, macro, M&amp;A, earnings &amp; crypto · auto-refreshes every 15 min
            </p>
          </div>
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 self-start sm:self-auto bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] hover:border-[#8b949e] text-[#c9d1d9] text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F97316]' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Toolbar: category filters + high-priority */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {(['all', 'fed', 'macro', 'mergers', 'earnings', 'ai', 'crypto'] as NewsCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === cat
                  ? 'bg-[#F97316] text-white'
                  : 'bg-[#161b22] text-[#8b949e] hover:text-white hover:bg-[#21262d] border border-[#30363d]'
              }`}
            >
              {cat !== 'all' && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_CONFIG[cat].color }}
                ></span>
              )}
              {CATEGORY_CONFIG[cat].label}
              <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${
                activeCategory === cat ? 'bg-white/20' : 'bg-[#30363d]'
              }`}>
                {getCategoryCount(cat)}
              </span>
            </button>
          ))}
        </div>

        {data && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-[#8b949e]">
              <span className="text-white font-medium">{newsItems.length}</span> {newsItems.length === 1 ? 'item' : 'items'}
            </span>
            <button
              onClick={() => setHighPriorityOnly(!highPriorityOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                highPriorityOnly
                  ? 'text-[#ef4444] border-[#ef4444]/40 bg-[#ef4444]/10'
                  : 'text-[#8b949e] border-[#30363d] hover:text-white hover:border-[#8b949e]'
              }`}
            >
              <Bell className={`w-3.5 h-3.5 ${highPriorityOnly ? 'fill-current' : ''}`} />
              High priority
            </button>
          </div>
        )}
      </div>

      {/* News grid */}
      {loading ? (
        <div className="text-center py-24 text-[#8b949e]">
          <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-3 text-[#F97316]" />
          <p className="text-sm">Scanning for market-moving news...</p>
        </div>
      ) : newsItems.length === 0 ? (
        <div className="text-center py-24 text-[#8b949e]">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No news items match your filters</p>
          <p className="text-xs text-[#484f58] mt-1">Try a different category or turn off high-priority.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {newsItems.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col bg-[#161b22] rounded-xl border border-[#30363d] p-4 hover:border-[#F97316]/50 hover:bg-[#1b212a] transition-all"
            >
              {/* Top meta row */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.categoryName}
                  </span>
                  {item.priority === 'high' && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#ef4444] flex-shrink-0">
                      <Bell className="w-2.5 h-2.5" />
                      HIGH
                    </span>
                  )}
                  {item.sentiment && (() => {
                    const s = SENTIMENT_CONFIG[item.sentiment];
                    return (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold flex-shrink-0" style={{ color: s.color }}>
                        <s.Icon className="w-2.5 h-2.5" />
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
                <span className="text-[10px] text-[#8b949e] whitespace-nowrap flex-shrink-0">{item.timeAgo}</span>
              </div>

              {/* Headline */}
              <h3 className="text-sm font-medium text-white group-hover:text-[#F97316] transition-colors leading-snug line-clamp-3">
                {item.headline}
                <ExternalLink className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
              </h3>

              {/* Footer: source + tickers */}
              <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#8b949e] truncate">{item.source}</span>
                {item.related.length > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.related.slice(0, 3).map((ticker) => (
                      <span
                        key={ticker}
                        className="px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-[10px] text-[#58a6ff] font-mono"
                      >
                        {ticker}
                      </span>
                    ))}
                    {item.related.length > 3 && (
                      <span className="text-[10px] text-[#8b949e]">+{item.related.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
