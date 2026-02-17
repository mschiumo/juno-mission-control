'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, RefreshCw, Clock, Filter } from 'lucide-react';

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  summary: string;
  publishedAt: string;
  category?: string;
  image?: string;
}

interface NewsData {
  items: NewsItem[];
  lastUpdated: string;
  cached?: boolean;
  stale?: boolean;
}

type DataSource = 'live' | 'cache' | 'fallback' | 'cache-stale' | 'cache-error';

// Source badge colors
const SOURCE_COLORS: Record<string, string> = {
  'Bloomberg': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Reuters': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'CNBC': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Financial Times': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'WSJ': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Wall Street Journal': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'MarketWatch': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Investopedia': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'The Block': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'CoinDesk': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'CoinTelegraph': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'TechCrunch': 'bg-red-500/20 text-red-400 border-red-500/30',
  'The Verge': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'Ars Technica': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Yahoo Finance': 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
  'Business Insider': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'Forbes': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

// Default badge style
const DEFAULT_BADGE_STYLE = 'bg-[#30363d] text-[#8b949e] border-[#30363d]';

export default function NewsFeedCard() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>('fallback');
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchNews();
    // Auto-refresh every 15 minutes
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/news-scraper');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setDataSource(result.source || 'fallback');
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = useCallback((timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).replace(',', ' @');
  };

  const getSourceBadgeStyle = (source: string): string => {
    // Try exact match first
    if (SOURCE_COLORS[source]) {
      return SOURCE_COLORS[source];
    }
    // Try partial match
    for (const [key, style] of Object.entries(SOURCE_COLORS)) {
      if (source.toLowerCase().includes(key.toLowerCase()) || 
          key.toLowerCase().includes(source.toLowerCase())) {
        return style;
      }
    }
    return DEFAULT_BADGE_STYLE;
  };

  const getDataSourceBadge = () => {
    const configs: Record<DataSource, { label: string; className: string }> = {
      'live': { 
        label: 'LIVE', 
        className: 'bg-[#238636]/20 text-[#238636]' 
      },
      'cache': { 
        label: 'CACHED', 
        className: 'bg-[#58a6ff]/20 text-[#58a6ff]' 
      },
      'fallback': { 
        label: 'MOCK', 
        className: 'bg-[#8b949e]/20 text-[#8b949e]' 
      },
      'cache-stale': { 
        label: 'STALE', 
        className: 'bg-[#d29922]/20 text-[#d29922]' 
      },
      'cache-error': { 
        label: 'CACHED', 
        className: 'bg-[#d29922]/20 text-[#d29922]' 
      }
    };
    
    const config = configs[dataSource] || configs.fallback;
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  // Get unique sources for filter
  const uniqueSources = data?.items 
    ? [...new Set(data.items.map(item => item.source))].slice(0, 6)
    : [];

  // Filter items
  const filteredItems = filter 
    ? data?.items.filter(item => item.source === filter) || []
    : data?.items || [];

  // Show top 10 items
  const displayItems = filteredItems.slice(0, 10);

  const toggleExpand = (index: number) => {
    setExpandedItem(expandedItem === index ? null : index);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
            <Newspaper className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-lg font-semibold text-white">Market News</h2>
              {!loading && getDataSourceBadge()}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {filter ? `${displayItems.length} from ${filter}` : `${displayItems.length} headlines`}
              </p>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#238636]">
                  updated {formatLastUpdated()}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {filter && (
            <button
              onClick={() => setFilter(null)}
              className="text-xs px-2 py-1 bg-[#30363d] text-[#8b949e] hover:text-white rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
          <button 
            onClick={fetchNews}
            disabled={loading}
            className="pill p-2"
            title="Refresh news"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Source Filter */}
      {uniqueSources.length > 0 && !loading && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 p-2 bg-[#0d1117] rounded-xl">
          <Filter className="w-3 h-3 text-[#8b949e] mr-1" />
          {uniqueSources.map((source) => (
            <button
              key={source}
              onClick={() => setFilter(filter === source ? null : source)}
              className={`text-[10px] px-2 py-1 rounded-full font-medium border transition-all hover:scale-105 ${
                filter === source 
                  ? getSourceBadgeStyle(source).replace('/20', '').replace('text-', 'bg-').replace('border-', 'ring-2 ring-')
                  : getSourceBadgeStyle(source)
              } ${filter === source ? 'text-white' : ''}`}
            >
              {source}
            </button>
          ))}
        </div>
      )}

      {/* News List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p className="text-sm">Loading news...</p>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-10">
            <Newspaper className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e]">No news available</p>
            <p className="text-xs text-[#8b949e]/70 mt-1">Check back later for updates</p>
          </div>
        ) : (
          displayItems.map((item, index) => (
            <div
              key={index}
              className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#ff6b35]/30 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Header: Source & Time */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${getSourceBadgeStyle(item.source)}`}>
                      {item.source}
                    </span>
                    <span className="text-[10px] text-[#8b949e] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(item.publishedAt)}
                    </span>
                    {item.category && item.category !== 'general' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e] capitalize">
                        {item.category}
                      </span>
                    )}
                  </div>
                  
                  {/* Headline */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group/link"
                  >
                    <h3 className="text-sm font-medium text-white group-hover/link:text-[#ff6b35] transition-colors leading-snug flex items-start gap-2"
                    >
                      <span className="flex-1">{item.headline}</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover/link:opacity-50 flex-shrink-0 mt-0.5 transition-opacity" />
                    </h3>
                  </a>
                  
                  {/* Summary (expandable) */}
                  {item.summary && (
                    <div className="mt-2">
                      <p className={`text-xs text-[#8b949e] leading-relaxed ${
                        expandedItem === index ? '' : 'line-clamp-2'
                      }`}>
                        {item.summary}
                      </p>
                      {item.summary.length > 100 && (
                        <button
                          onClick={() => toggleExpand(index)}
                          className="text-[10px] text-[#ff6b35] hover:text-[#ff8c5a] mt-1 transition-colors"
                        >
                          {expandedItem === index ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {data?.lastUpdated && (
        <div className="mt-4 pt-4 border-t border-[#30363d] text-xs text-[#8b949e] text-center">
          Last updated: {new Date(data.lastUpdated).toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })} (EST)
          {data.cached && (
            <span className="ml-2 text-[#58a6ff]">(cached)</span>
          )}
          {data.stale && (
            <span className="ml-2 text-[#d29922]">(stale)</span>
          )}
        </div>
      )}
    </div>
  );
}