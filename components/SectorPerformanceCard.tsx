'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, BarChart2 } from 'lucide-react';

interface SectorItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface SectorResponse {
  success: boolean;
  data: SectorItem[];
  source: 'live' | 'fallback';
}

export default function SectorPerformanceCard() {
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [source, setSource] = useState<'live' | 'fallback'>('fallback');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSectors();
    const interval = setInterval(fetchSectors, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchSectors = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sector-performance');
      const result: SectorResponse = await res.json();
      if (result.success) {
        setSectors(result.data);
        setSource(result.source);
      }
    } catch (error) {
      console.error('Failed to fetch sector data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#111318] border border-white/[0.06] rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-[#09090b]/50">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Sectors</h2>
          {!loading && source === 'live' && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#238636]/20 text-[#238636]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#238636] animate-pulse" />
              LIVE
            </span>
          )}
          {!loading && source === 'fallback' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d29922]/20 text-[#d29922]">DEMO</span>
          )}
        </div>
        <button
          onClick={fetchSectors}
          disabled={loading}
          className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#71717a] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Horizontal scrollable sector pills */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
        {loading && sectors.length === 0
          ? Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-24 h-12 bg-[#09090b] rounded-lg border border-white/[0.06] animate-pulse" />
            ))
          : sectors.map((sector) => {
              const isUp = sector.changePercent >= 0;
              const color = isUp ? '#238636' : '#da3633';
              return (
                <a
                  key={sector.symbol}
                  href={`https://www.tradingview.com/chart/?symbol=AMEX:${sector.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 flex flex-col justify-between px-3 py-2 bg-[#09090b] border border-white/[0.06] rounded-lg hover:border-[#F97316]/50 transition-all min-w-[88px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white font-mono">{sector.symbol}</span>
                    <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
                      {isUp ? '+' : ''}{sector.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-[#71717a] mt-1 truncate">{sector.name}</span>
                </a>
              );
            })}
      </div>
    </div>
  );
}
