'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Activity, CheckCircle, Clock } from 'lucide-react';
import type { ActiveTradeWithPnL } from '@/types/active-trade';

const DEFAULT_USER_ID = 'default';

export default function ActiveTradesStrip() {
  const [trades, setTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = async () => {
    try {
      const res = await fetch(`/api/active-trades?userId=${DEFAULT_USER_ID}`);
      const result = await res.json();
      setTrades(result.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-[#0d1117] border border-[#238636]/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#238636]/10 border-b border-[#238636]/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#238636]" />
          <span className="text-sm font-semibold text-[#238636]">Active Trades</span>
          {!loading && (
            <span className="text-xs text-[#8b949e]">({trades.length})</span>
          )}
        </div>
        <button
          onClick={fetchTrades}
          className="p-1 text-[#8b949e] hover:text-white transition-colors rounded"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Strip */}
      <div className="p-3">
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shrink-0 w-56 h-32 bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <p className="text-sm text-[#8b949e] py-2">No active trades</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className={`shrink-0 w-56 rounded-lg p-4 space-y-3 transition-colors ${
                  trade.orderPlaced
                    ? 'bg-[#238636]/10 border border-[#238636] shadow-[0_0_12px_rgba(35,134,54,0.25)]'
                    : 'bg-[#161b22] border border-[#238636]/40 hover:border-[#238636]/70'
                }`}
              >
                {/* Ticker + order status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {trade.orderPlaced && (
                      <span className="w-2 h-2 rounded-full bg-[#238636] animate-pulse shrink-0" />
                    )}
                    <span className="font-bold text-white text-base tracking-wide">{trade.ticker}</span>
                  </div>
                  {trade.orderPlaced ? (
                    <div className="flex items-center gap-1.5 text-[#238636]" title="Order placed">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-semibold">Order In</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[#8b949e]" title="No order placed">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Pending</span>
                    </div>
                  )}
                </div>

                {/* Key levels */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[#8b949e] mb-1">Entry</p>
                    <p className="text-white font-semibold">${trade.actualEntry.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] mb-1">Stop</p>
                    <p className="text-[#f85149] font-semibold">${trade.plannedStop.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] mb-1">Target</p>
                    <p className="text-[#3fb950] font-semibold">${trade.plannedTarget.toFixed(2)}</p>
                  </div>
                </div>

                {/* Shares */}
                <p className="text-xs text-[#8b949e]">
                  {trade.actualShares.toLocaleString()} <span>shares</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
