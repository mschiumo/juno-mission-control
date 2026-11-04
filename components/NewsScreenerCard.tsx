'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Newspaper, ExternalLink, RefreshCw, Bell, TrendingUp, TrendingDown, Minus, Radio } from 'lucide-react';
import {
  NEWS_CATEGORY_META,
  NEWS_CATEGORY_ORDER,
  NEWS_REFRESH_INTERVAL_MS,
  formatTimeAgo,
  type NewsCategoryId,
} from '@/lib/news/categories';

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
  // Optional so a cached pre-redesign API response can't crash the tab
  highPriority?: NewsItem[];
  latestByCategory: Record<string, NewsItem>;
  counts: Record<string, number>;
  totalScanned: number;
  categorized: number;
  generatedAt?: string;
  sourcesOk?: number;
  sourcesFailed?: number;
  failedSources?: string[];
}

interface NewsResponse {
  success: boolean;
  data: NewsData;
  timestamp: string;
  source: 'live' | 'mock';
  categories: string[];
  nextUpdate: string;
}

type NewsTab = 'high' | NewsCategoryId;

const TABS: NewsTab[] = ['high', ...NEWS_CATEGORY_ORDER];

const SENTIMENT_CONFIG = {
  bullish: { label: 'Bullish', color: '#22c55e', Icon: TrendingUp },
  bearish: { label: 'Bearish', color: '#ef4444', Icon: TrendingDown },
  neutral: { label: 'Neutral', color: '#8b949e', Icon: Minus },
} as const;

/** Re-read the cache this often when the tab is open — matches the server cron. */
const POLL_INTERVAL_MS = NEWS_REFRESH_INTERVAL_MS;
/** Coming back to the tab after this long triggers an immediate re-read. */
const STALE_ON_FOCUS_MS = 2 * 60 * 1000;

export default function NewsScreenerCard() {
  const [data, setData] = useState<NewsData | null>(null);
  const [response, setResponse] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NewsTab>('high');
  // Wall clock for the "Xm ago" labels, ticked once a minute so they stay
  // honest between polls without re-fetching.
  const [now, setNow] = useState(() => Date.now());
  const lastFetchRef = useRef(0);

  const fetchNews = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch('/api/news-screener', { cache: 'no-store' });
      const result: NewsResponse = await res.json();
      if (result.success) {
        setData(result.data);
        setResponse(result);
      }
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      lastFetchRef.current = Date.now();
      setNow(Date.now());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const poll = setInterval(() => fetchNews({ silent: true }), POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchRef.current > STALE_ON_FOCUS_MS) fetchNews({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchNews]);

  const filteredNews = useCallback(() => {
    if (!data?.items) return [];
    if (activeTab === 'high') {
      // Fall back to items (the old top-15 digest) for cached pre-redesign responses
      return data.highPriority ?? data.items;
    }
    return data.items.filter((item) => item.category === activeTab);
  }, [data, activeTab]);

  const getTabCount = (tab: NewsTab) => {
    if (!data?.counts) return 0;
    if (tab === 'high') return (data.highPriority ?? data.items).length;
    return data.counts[tab] || 0;
  };

  const newsItems = filteredNews();
  const dataSource = response?.source || 'mock';
  const generatedMs = data?.generatedAt ? Date.parse(data.generatedAt) : NaN;
  const updatedLabel = Number.isNaN(generatedMs) ? null : formatTimeAgo(Math.floor(generatedMs / 1000), now);
  const nextRefreshMin = Number.isNaN(generatedMs)
    ? null
    : Math.max(0, Math.ceil((generatedMs + NEWS_REFRESH_INTERVAL_MS - now) / 60000));

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
              Breaking headlines that move markets — Fed, geopolitics &amp; war, politics, macro data, energy, M&amp;A, earnings, AI &amp; crypto
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {updatedLabel && !loading && (
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#8b949e]" title={data?.sourcesOk ? `${data.sourcesOk} sources` : undefined}>
              <Radio className="w-3 h-3 text-[#3fb950]" />
              Updated {updatedLabel}
              {nextRefreshMin !== null && (
                <span className="text-[#484f58]">· next in {nextRefreshMin}m</span>
              )}
            </span>
          )}
          <button
            onClick={() => fetchNews()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] hover:border-[#8b949e] text-[#c9d1d9] text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F97316]' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Toolbar: breaking digest + category tabs */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-[#F97316] text-white'
                  : 'bg-[#161b22] text-[#8b949e] hover:text-white hover:bg-[#21262d] border border-[#30363d]'
              }`}
            >
              {tab === 'high' ? (
                <Bell className="w-3 h-3 flex-shrink-0" />
              ) : (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: NEWS_CATEGORY_META[tab].color }}
                ></span>
              )}
              {tab === 'high' ? 'Breaking' : NEWS_CATEGORY_META[tab].label}
              <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${
                activeTab === tab ? 'bg-white/20' : 'bg-[#30363d]'
              }`}>
                {getTabCount(tab)}
              </span>
            </button>
          ))}
        </div>

        {data && (
          <span className="text-xs text-[#8b949e] flex-shrink-0">
            <span className="text-white font-medium">{newsItems.length}</span> {newsItems.length === 1 ? 'item' : 'items'}
            {typeof data.sourcesOk === 'number' && data.sourcesOk > 0 && (
              <span className="text-[#484f58]"> · {data.sourcesOk} sources</span>
            )}
          </span>
        )}
      </div>

      {/* News grid — 5 across at xl */}
      {loading ? (
        <div className="text-center py-24 text-[#8b949e]">
          <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-3 text-[#F97316]" />
          <p className="text-sm">Scanning for market-moving news...</p>
        </div>
      ) : newsItems.length === 0 ? (
        <div className="text-center py-24 text-[#8b949e]">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No stories in this category right now</p>
          <p className="text-xs text-[#484f58] mt-1">Try another tab — the feed refreshes every 15 minutes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {newsItems.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col bg-[#161b22] rounded-lg border border-[#30363d] p-3 hover:border-[#F97316]/50 hover:bg-[#1b212a] transition-all"
            >
              {/* Top meta row */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.categoryName}
                  </span>
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
                <span className="text-[10px] text-[#8b949e] whitespace-nowrap flex-shrink-0">
                  {formatTimeAgo(item.timestamp, now)}
                </span>
              </div>

              {/* Headline */}
              <h3 className="text-[13px] font-medium text-white group-hover:text-[#F97316] transition-colors leading-snug line-clamp-3">
                {item.headline}
                <ExternalLink className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
              </h3>

              {/* Footer: source + tickers */}
              <div className="mt-auto pt-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#8b949e] truncate">{item.source}</span>
                {item.related.length > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.related.slice(0, 2).map((ticker) => (
                      <span
                        key={ticker}
                        className="px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-[10px] text-[#58a6ff] font-mono"
                      >
                        {ticker}
                      </span>
                    ))}
                    {item.related.length > 2 && (
                      <span className="text-[10px] text-[#8b949e]">+{item.related.length - 2}</span>
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
