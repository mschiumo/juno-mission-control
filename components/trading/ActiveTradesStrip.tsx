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
          <div className="flex gap-3 overflow-x-auto pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shrink-0 w-40 h-24 bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <p className="text-sm text-[#8b949e] py-2">No active trades</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="shrink-0 w-44 bg-[#161b22] border border-[#238636]/40 rounded-lg p-3 space-y-2.5 hover:border-[#238636]/70 transition-colors"
              >
                {/* Ticker + order status */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm tracking-wide">{trade.ticker}</span>
                  {trade.orderPlaced ? (
                    <div className="flex items-center gap-1 text-[#238636]" title="Order placed">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium">Order In</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[#8b949e]" title="No order placed">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Pending</span>
                    </div>
                  )}
                </div>

                {/* Key levels */}
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div>
                    <p className="text-[#8b949e] mb-0.5">Entry</p>
                    <p className="text-white font-semibold">${trade.actualEntry.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] mb-0.5">Stop</p>
                    <p className="text-[#f85149] font-semibold">${trade.plannedStop.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] mb-0.5">Target</p>
                    <p className="text-[#3fb950] font-semibold">${trade.plannedTarget.toFixed(2)}</p>
                  </div>
                </div>

                {/* Shares */}
                <p className="text-[10px] text-[#8b949e]">
                  {trade.actualShares.toLocaleString()} <span className="text-[#8b949e]">shares</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
