'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react';

interface GapStock {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  gapPercent: number;
  volume: number;
  marketCap: number;
  status: 'gainer' | 'loser';
}

interface GapData {
  gainers: GapStock[];
  losers: GapStock[];
}

export default function GapScannerCard() {
  const [data, setData] = useState<GapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'live' | 'mock' | 'fallback'>('mock');

  useEffect(() => {
    fetchGapData();
    // Auto-refresh every 60 seconds during pre-market hours (4-9:30 AM EST)
    const interval = setInterval(fetchGapData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchGapData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gap-scanner');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setDataSource(result.source);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch gap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(1) + 'M';
    }
    if (volume >= 1000) {
      return (volume / 1000).toFixed(1) + 'K';
    }
    return volume.toString();
  };

  const formatMarketCap = (cap: number) => {
    if (cap >= 1000000000000) {
      return (cap / 1000000000000).toFixed(1) + 'T';
    }
    if (cap >= 1000000000) {
      return (cap / 1000000000).toFixed(1) + 'B';
    }
    if (cap >= 1000000) {
      return (cap / 1000000).toFixed(1) + 'M';
    }
    return cap.toString();
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

  const renderStockList = (stocks: GapStock[], type: 'gainer' | 'loser') => {
    const isGainer = type === 'gainer';
    
    return (
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {stocks.map((stock) => (
          <div
            key={stock.symbol}
            className={`p-3 rounded-lg border transition-all hover:shadow-lg ${
              isGainer 
                ? 'bg-[#238636]/10 border-[#238636]/30 hover:border-[#238636]/60' 
                : 'bg-[#da3633]/10 border-[#da3633]/30 hover:border-[#da3633]/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {isGainer ? (
                  <TrendingUp className="w-4 h-4 text-[#238636]" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-[#da3633]" />
                )}
                <span className="font-bold text-white">{stock.symbol}</span>
              </div>
              <span className={`font-bold ${isGainer ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                {isGainer ? '+' : ''}{stock.gapPercent.toFixed(2)}%
              </span>
            </div>
            
            <p className="text-xs text-[#8b949e] mb-2 truncate">{stock.name}</p>
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-[#8b949e]">Price</p>
                <p className="text-white font-medium">{formatPrice(stock.price)}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Volume</p>
                <p className="text-white font-medium">{formatVolume(stock.volume)}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Market Cap</p>
                <p className="text-white font-medium">{formatMarketCap(stock.marketCap)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Gap Scanner</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                10%+ gaps | Min 100K vol | $100M+ cap
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
          {!loading && (
            <span className={`text-[10px] px-2 py-1 rounded ${
              dataSource === 'live' 
                ? 'bg-[#238636]/20 text-[#238636]' 
                : 'bg-[#d29922]/20 text-[#d29922]'
            }`}>
              {dataSource === 'live' ? 'LIVE' : 'MOCK'}
            </span>
          )}
          <button
            onClick={fetchGapData}
            disabled={loading}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Refresh gap data"
          >
            <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-8 text-[#8b949e]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
          Scanning for gaps...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#da3633] flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Biggest Losers
              </h3>
              <span className="text-xs text-[#8b949e] bg-[#0d1117] px-2 py-1 rounded">
                {data?.losers.length || 0}
              </span>
            </div>
            {data?.losers && renderStockList(data.losers, 'loser')}
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#238636] flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Biggest Gainers
              </h3>
              <span className="text-xs text-[#8b949e] bg-[#0d1117] px-2 py-1 rounded">
                {data?.gainers.length || 0}
              </span>
            </div>
            {data?.gainers && renderStockList(data.gainers, 'gainer')}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[#30363d]">
        <p className="text-[10px] text-[#8b949e] text-center">
          Showing stocks with 10%+ overnight gaps, minimum 100K volume, $100M+ market cap
        </p>
      </div>
    </div>
  );
}
