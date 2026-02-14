'use client';

import { useState, useEffect } from 'react';
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

type DataSource = 'live' | 'partial' | 'fallback';

export default function MarketCard() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'indices' | 'stocks' | 'commodities' | 'crypto'>('indices');
  const [dataSource, setDataSource] = useState<DataSource>('fallback');

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

  const formatChange = (change: number, changePercent: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
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

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <DollarSign className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">Market</h2>
              <MarketCountdown />
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#238636]">
                  updated {formatLastUpdated()}
                </span>
              )}
              {!loading && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  dataSource === 'live' 
                    ? 'bg-[#238636]/20 text-[#238636]' 
                    : dataSource === 'partial'
                    ? 'bg-[#d29922]/20 text-[#d29922]'
                    : 'bg-[#8b949e]/20 text-[#8b949e]'
                }`}>
                  {dataSource === 'live' ? 'LIVE' : dataSource === 'partial' ? 'PARTIAL' : 'MOCK'}
                </span>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={fetchMarketData}
          disabled={loading}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh market data"
        >
          <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[#0d1117] rounded-lg p-1">
        {(['indices', 'stocks', 'commodities', 'crypto'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab 
                ? 'bg-[#ff6b35] text-white' 
                : 'text-[#8b949e] hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Market Data - Grid Layout */}
      <div className="max-h-[500px] overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-4 text-[#8b949e]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            Loading...
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {currentData.map((item) => (
              <a
                key={item.symbol}
                href={`https://www.tradingview.com/chart/?symbol=${item.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {item.change >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-[#238636]" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-[#da3633]" />
                    )}
                    <span className="font-semibold text-white hover:text-[#ff6b35] transition-colors flex items-center gap-1">
                      {item.symbol}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${item.change >= 0 ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                    {item.change >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>
                
                <p className="text-xs text-[#8b949e] mb-2 truncate">{item.name}</p>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{formatPrice(item.price)}</span>
                  <span className={`text-xs ${item.change >= 0 ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {data?.lastUpdated && (
        <div className="mt-3 text-xs text-[#8b949e] text-center">
          Last updated: {new Date(data.lastUpdated).toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })} (EST)
        </div>
      )}
    </div>
  );
}
