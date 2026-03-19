'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, RefreshCw, DollarSign, ExternalLink } from 'lucide-react';
import MarketCountdown from './MarketCountdown';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

interface MarketData {
  indices: MarketItem[];
  stocks: MarketItem[];
  commodities: MarketItem[];
  crypto: MarketItem[];
  lastUpdated: string;
}

type MarketTab = 'indices' | 'stocks' | 'commodities' | 'crypto';
type DataSource = 'live' | 'partial' | 'fallback';

export default function MarketCard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get tab from URL query param, default to 'indices'
  const getTabFromUrl = useCallback((): MarketTab => {
    const tab = searchParams.get('marketTab');
    if (tab === 'stocks' || tab === 'commodities' || tab === 'crypto') return tab;
    return 'indices';
  }, [searchParams]);

  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTabState] = useState<MarketTab>(getTabFromUrl);
  const [dataSource, setDataSource] = useState<DataSource>('fallback');

  // Update URL when tab changes (using replace to avoid bloating history)
  const setActiveTab = (tab: MarketTab) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'indices') {
      params.delete('marketTab');
    } else {
      params.set('marketTab', tab);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Sync state with URL on mount and when URL changes
  useEffect(() => {
    setActiveTabState(getTabFromUrl());
  }, [getTabFromUrl]);

  useEffect(() => {
    fetchMarketData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchMarketData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchMarketData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/market-data');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setDataSource(result.source || 'fallback');
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch market data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: price < 100 ? 2 : 0,
      maximumFractionDigits: price < 100 ? 2 : 0
    }).format(price);
  };

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

  const currentData = data?.[activeTab] || [];

  // Strip -USD suffix added by CoinGecko search (e.g. "LINK-USD" → "LINK")
  const cleanCryptoSymbol = (symbol: string) => symbol.replace(/-USD$/, '');

  const getTradingViewSymbol = (symbol: string, isCrypto: boolean) => {
    if (isCrypto) {
      return `BINANCE:${cleanCryptoSymbol(symbol)}USDT`;
    }
    return symbol;
  };

  // Calculate market stats
  const upCount = currentData.filter(item => item.change >= 0).length;
  const downCount = currentData.filter(item => item.change < 0).length;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-lg">
            <DollarSign className="w-5 h-5 text-[#F97316]" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Market</h2>
            <MarketCountdown />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="text-[10px] text-[#8b949e]">
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          )}
          <button
            onClick={fetchMarketData}
            disabled={loading}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Refresh market data"
          >
            <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6">
      {/* Segmented Control Tabs - Mobile Responsive */}
      <div className="segmented-control mb-5 overflow-x-auto scrollbar-hide">
        {(['indices', 'stocks', 'commodities', 'crypto'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`segmented-btn whitespace-nowrap ${activeTab === tab ? 'active' : ''}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Market Stats */}
      {currentData.length > 0 && (
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#238636]"></div>
              <span className="text-xs text-[#8b949e]">{upCount} Up</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#da3633]"></div>
              <span className="text-xs text-[#8b949e]">{downCount} Down</span>
            </div>
          </div>
          <span className="text-xs text-[#8b949e]">{currentData.length} symbols</span>
        </div>
      )}

      {/* Market Data - Grid Layout */}
      <div className="max-h-[500px] overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#F97316]" />
            <p className="text-sm">Loading market data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {currentData.map((item) => (
              <a
                key={item.symbol}
                href={`https://www.tradingview.com/chart/?symbol=${getTradingViewSymbol(item.symbol, activeTab === 'crypto')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 sm:p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#F97316]/50 transition-all block group min-w-0"
              >
                <div className="flex items-center justify-between mb-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {item.change >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-[#238636] flex-shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-[#da3633] flex-shrink-0" />
                    )}
                    <span className="font-semibold text-white group-hover:text-[#F97316] transition-colors flex items-center gap-1 truncate">
                      <span className="truncate">{activeTab === 'crypto' ? cleanCryptoSymbol(item.symbol) : item.symbol}</span>
                      <ExternalLink className="w-3 h-3 opacity-50 flex-shrink-0" />
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                    item.change >= 0
                      ? 'bg-[#238636]/20 text-[#238636]'
                      : 'bg-[#da3633]/20 text-[#da3633]'
                  }`}>
                    {item.change >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>

                <p className="text-xs text-[#8b949e] mb-3 truncate">{item.name}</p>

                <div className="flex items-baseline justify-between min-w-0">
                  <span className="metric-value text-lg sm:text-xl truncate">{formatPrice(item.price)}</span>
                  <span className={`text-xs font-medium flex-shrink-0 ml-2 ${item.change >= 0 ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
