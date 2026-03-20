'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, BarChart2, ExternalLink } from 'lucide-react';

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

  // Max absolute % change — used to scale the bar widths
  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.changePercent)), 0.01);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
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
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d29922]/20 text-[#d29922]">
              DEMO
            </span>
          )}
        </div>
        <button
          onClick={fetchSectors}
          disabled={loading}
          className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh sectors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Sector List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        {loading && sectors.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F97316]" />
            <p className="text-xs">Loading sectors...</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sectors.map((sector) => {
              const isUp = sector.changePercent >= 0;
              const barWidth = Math.round((Math.abs(sector.changePercent) / maxAbs) * 100);
              const color = isUp ? '#238636' : '#da3633';
              const bgColor = isUp ? '#238636' : '#da3633';

              return (
                <a
                  key={sector.symbol}
                  href={`https://www.tradingview.com/chart/?symbol=AMEX:${sector.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3 py-2 rounded-lg hover:bg-[#0d1117] transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono font-semibold text-[#8b949e] flex-shrink-0 w-9">
                        {sector.symbol}
                      </span>
                      <span className="text-xs text-white truncate group-hover:text-[#F97316] transition-colors flex items-center gap-1">
                        {sector.name}
                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 flex-shrink-0 transition-opacity" />
                      </span>
                    </div>
                    <span
                      className="text-xs font-bold flex-shrink-0 tabular-nums"
                      style={{ color }}
                    >
                      {isUp ? '+' : ''}{sector.changePercent.toFixed(2)}%
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="h-1 bg-[#30363d] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%`, backgroundColor: bgColor, opacity: 0.7 }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — best / worst */}
      {sectors.length > 0 && !loading && (
        <div className="px-4 py-2 border-t border-[#30363d] flex-shrink-0 flex items-center justify-between text-[10px] text-[#8b949e]">
          <span>
            Best: <span className="text-[#238636] font-medium">{sectors[0]?.symbol} {sectors[0]?.changePercent >= 0 ? '+' : ''}{sectors[0]?.changePercent.toFixed(2)}%</span>
          </span>
          <span>
            Worst: <span className="text-[#da3633] font-medium">{sectors[sectors.length - 1]?.symbol} {sectors[sectors.length - 1]?.changePercent.toFixed(2)}%</span>
          </span>
        </div>
      )}
    </div>
  );
}
