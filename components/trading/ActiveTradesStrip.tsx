'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
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

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="shrink-0 w-44 h-28 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[#161b22] border border-[#30363d] rounded-xl text-sm text-[#8b949e]">
        <TrendingUp className="w-4 h-4 shrink-0" />
        No active trades
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {trades.map((trade) => {
        const pnl = trade.unrealizedPnL ?? 0;
        const pnlPct = trade.unrealizedPnLPercent ?? 0;
        const isUp = pnl > 0;
        const isDown = pnl < 0;

        return (
          <div
            key={trade.id}
            className={`shrink-0 w-48 bg-[#161b22] border rounded-xl p-3 space-y-2 ${
              isUp ? 'border-[#238636]/50' : isDown ? 'border-[#da3633]/50' : 'border-[#30363d]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">{trade.ticker}</span>
              {isUp ? (
                <TrendingUp className="w-3.5 h-3.5 text-[#238636]" />
              ) : isDown ? (
                <TrendingDown className="w-3.5 h-3.5 text-[#da3633]" />
              ) : (
                <Minus className="w-3.5 h-3.5 text-[#8b949e]" />
              )}
            </div>

            <div className={`text-base font-bold tabular-nums ${isUp ? 'text-[#238636]' : isDown ? 'text-[#da3633]' : 'text-[#8b949e]'}`}>
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              <span className="text-xs font-normal ml-1 opacity-80">
                ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div>
                <p className="text-[#8b949e]">Entry</p>
                <p className="text-white font-medium">${trade.actualEntry.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Shares</p>
                <p className="text-white font-medium">{trade.actualShares.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Stop</p>
                <p className="text-white font-medium">${trade.plannedStop.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Target</p>
                <p className="text-white font-medium">${trade.plannedTarget.toFixed(2)}</p>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={fetchTrades}
        className="shrink-0 flex flex-col items-center justify-center w-10 text-[#8b949e] hover:text-white transition-colors"
        title="Refresh"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  );
}
