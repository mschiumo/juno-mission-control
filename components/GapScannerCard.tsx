'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw, Clock, ExternalLink } from 'lucide-react';

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

interface GapResponse {
  success: boolean;
  data: GapData;
  source: 'live' | 'mock' | 'fallback';
  scanned: number;
  found: number;
  isWeekend?: boolean;
  tradingDate?: string;
  previousDate?: string;
  marketStatus?: 'open' | 'closed';
  nextMarketOpen?: string | null;
  timestamp: string;
}

export default function GapScannerCard() {
  const [data, setData] = useState<GapData | null>(null);
  const [response, setResponse] = useState<GapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
      const result: GapResponse = await response.json();
      if (result.success) {
        setData(result.data);
        setResponse(result);
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
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).replace(',', ' @');
  };

  const renderStockList = (stocks: GapStock[], type: 'gainer' | 'loser') => {
    const isGainer = type === 'gainer';
    const isWeekend = response?.isWeekend;
    
    if (stocks.length === 0) {
      return (
        <div className="text-center py-6 text-[#8b949e] text-sm">
          <p>No {isGainer ? 'gainers' : 'losers'} 5%+</p>
          <p className="text-xs mt-1">
            {isWeekend 
              ? 'Market closed — gaps resume Monday 4 AM EST' 
              : 'Low volatility or pre-market not started'}
          </p>
        </div>
      );
    }
    
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
                <a
                  href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-white hover:text-[#ff6b35] transition-colors flex items-center gap-1"
                >
                  {stock.symbol}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
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

  const dataSource = response?.source || 'mock';
  const isWeekend = response?.isWeekend;
  const scannedCount = response?.scanned || 0;
  const foundCount = response?.found || 0;

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
                5%+ gaps | Min 100K vol | $250M+ cap | No ETFs
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

      {/* Weekend/Market Status Banner */}
      {isWeekend && (
        <div className="mb-4 p-3 bg-[#d29922]/10 border border-[#d29922]/30 rounded-lg">
          <div className="flex items-center gap-2 text-[#d29922]">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Market Closed</span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Weekend mode — showing data from {response?.tradingDate}. 
            Next gap scan: Monday 4:00 AM EST
          </p>
        </div>
      )}

      {/* Scan Stats */}
      {response && dataSource === 'live' && !isWeekend && (
        <div className="mb-4 flex items-center gap-4 text-xs text-[#8b949e]">
          <span>Scanned: <span className="text-white">{scannedCount.toLocaleString()}+ stocks</span></span>
          <span>Found: <span className="text-white">{foundCount} gaps</span></span>
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-8 text-[#8b949e]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
          Scanning for gaps...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gainers - Left Column */}
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
          
          {/* Losers - Right Column */}
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
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[#30363d]">
        <p className="text-[10px] text-[#8b949e] text-center">
          Common stocks only — ETFs, warrants, preferred shares excluded • Min 5% gap • 100K+ volume • $250M+ market cap
        </p>
      </div>
    </div>
  );
}
