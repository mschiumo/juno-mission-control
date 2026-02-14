'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, DollarSign, Globe } from 'lucide-react';

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

interface MarketStatus {
  name: string;
  isOpen: boolean;
  hours: string;
}

// Get market status based on current EST time
function getMarketStatus(): MarketStatus[] {
  const now = new Date();
  // Convert to EST (UTC-5)
  const estHour = (now.getUTCHours() - 5 + 24) % 24;
  const estMinute = now.getUTCMinutes();
  const estTime = estHour + estMinute / 60;
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

  const isWeekday = day >= 1 && day <= 5;

  // Asia: 7 PM - 2 AM EST (Sunday evening - Friday)
  const isAsiaOpen = isWeekday || (day === 0 && estTime >= 19);
  
  // London: 3 AM - 11:30 AM EST (Monday - Friday)
  const isLondonOpen = isWeekday && estTime >= 3 && estTime < 11.5;
  
  // New York: 9:30 AM - 4 PM EST (Monday - Friday)
  const isNYOpen = isWeekday && estTime >= 9.5 && estTime < 16;

  return [
    { name: 'Asia', isOpen: isAsiaOpen, hours: '7 PM - 2 AM EST' },
    { name: 'London', isOpen: isLondonOpen, hours: '3 AM - 11:30 AM EST' },
    { name: 'New York', isOpen: isNYOpen, hours: '9:30 AM - 4 PM EST' }
  ];
}

export default function MarketCard() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'indices' | 'stocks' | 'commodities' | 'crypto'>('indices');
  const [dataSource, setDataSource] = useState<DataSource>('fallback');
  const [marketStatus, setMarketStatus] = useState<MarketStatus[]>(getMarketStatus());

  useEffect(() => {
    fetchMarketData();
    // Update market status every minute
    const statusInterval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchMarketData, 60000);
    return () => {
      clearInterval(interval);
      clearInterval(statusInterval);
    };
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
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
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
            <h2 className="text-lg font-semibold text-white">Market</h2>
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

      {/* Market Hours */}
      <div className="mb-4 bg-[#0d1117] rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-[#8b949e]" />
          <span className="text-sm font-medium text-white">Market Hours</span>
        </div>
        <div className="space-y-2">
          {marketStatus.map((market) => (
            <div key={market.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${market.isOpen ? 'bg-[#238636] animate-pulse' : 'bg-[#da3633]'}`} />
                <span className="text-sm text-white">{market.name}</span>
              </div>
              <span className="text-xs text-[#8b949e]">{market.hours}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Market Data */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-4 text-[#8b949e]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            Loading...
          </div>
        ) : (
          currentData.map((item) => (
            <div 
              key={item.symbol}
              className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-colors"
            >
              <div>
                <div className="font-medium text-white">{item.symbol}</div>
                <div className="text-xs text-[#8b949e]">{item.name}</div>
              </div>
              
              <div className="text-right">
                <div className="font-medium text-white">{formatPrice(item.price)}</div>
                <div className={`flex items-center gap-1 text-xs ${
                  item.change >= 0 ? 'text-[#238636]' : 'text-[#da3633]'
                }`}>
                  {item.change >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>{formatChange(item.change, item.changePercent)}</span>
                </div>
              </div>
            </div>
          ))
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
