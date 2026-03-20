'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, RefreshCw, Bell } from 'lucide-react';

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

type NewsCategory = 'all' | 'fed' | 'macro' | 'mergers' | 'earnings' | 'ai';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  all:      { label: 'All',     color: '#f97316' },
  fed:      { label: 'Fed',     color: '#8b5cf6' },
  macro:    { label: 'Macro',   color: '#3b82f6' },
  mergers:  { label: 'M&A',     color: '#f97316' },
  earnings: { label: 'Earnings',color: '#14b8a6' },
  ai:       { label: 'AI',      color: '#22c55e' },
};

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
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-[640px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">News Screener</h2>
          {!loading && dataSource === 'live' && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#238636]/20 text-[#238636]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#238636] animate-pulse"></span>
              LIVE
            </span>
          )}
          {dataSource === 'mock' && !loading && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d29922]/20 text-[#d29922]">
              DEMO
            </span>
          )}
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh news"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {(['all', 'fed', 'macro', 'mergers', 'earnings', 'ai'] as NewsCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all ${
                activeCategory === cat
                  ? 'bg-[#ff6b35] text-white'
                  : 'bg-[#0d1117] text-[#8b949e] hover:text-white hover:bg-[#30363d]'
              }`}
            >
              {cat !== 'all' && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_CONFIG[cat].color }}
                ></span>
              )}
              {CATEGORY_CONFIG[cat].label}
              <span className={`ml-0.5 px-1 rounded-full text-[9px] ${
                activeCategory === cat ? 'bg-white/20' : 'bg-[#30363d]'
              }`}>
                {getCategoryCount(cat)}
              </span>
            </button>
          ))}
        </div>

        {data && (
          <div className="flex items-center justify-between mt-2 text-[10px] text-[#8b949e]">
            <span><span className="text-white font-medium">{newsItems.length}</span> items</span>
            <button
              onClick={() => setHighPriorityOnly(!highPriorityOnly)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
                highPriorityOnly ? 'text-[#ef4444]' : 'text-[#8b949e] hover:text-white'
              }`}
            >
              <Bell className={`w-3 h-3 ${highPriorityOnly ? 'fill-current' : ''}`} />
              High priority
            </button>
          </div>
        )}
      </div>

      {/* News List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 min-h-0">
        {loading ? (
          <div className="text-center py-6 text-[#8b949e]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p className="text-xs">Scanning for market-moving news...</p>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="text-center py-6 text-[#8b949e]">
            <Newspaper className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No news items match your filters</p>
          </div>
        ) : (
          newsItems.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-all group"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-medium text-white flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.categoryName}
                  </span>
                  {item.priority === 'high' && (
                    <span className="flex items-center gap-0.5 text-[9px] font-medium text-[#ef4444] flex-shrink-0">
                      <Bell className="w-2.5 h-2.5" />
                      HIGH
                    </span>
                  )}
                  <span className="text-[9px] text-[#8b949e] truncate">{item.source}</span>
                </div>
                <span className="text-[9px] text-[#8b949e] whitespace-nowrap flex-shrink-0">{item.timeAgo}</span>
              </div>

              <h3 className="text-xs font-medium text-white group-hover:text-[#ff6b35] transition-colors line-clamp-2 leading-snug">
                {item.headline}
                <ExternalLink className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
              </h3>

              {item.related.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-1.5">
                  {item.related.slice(0, 4).map((ticker) => (
                    <span
                      key={ticker}
                      className="px-1 py-0.5 bg-[#30363d] rounded text-[9px] text-[#58a6ff] font-mono"
                    >
                      {ticker}
                    </span>
                  ))}
                  {item.related.length > 4 && (
                    <span className="text-[9px] text-[#8b949e]">+{item.related.length - 4}</span>
                  )}
                </div>
              )}
            </a>
          ))
        )}
      </div>
    </div>
  );
}
