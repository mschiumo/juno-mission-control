'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Activity, CheckCircle, Clock, X } from 'lucide-react';
import type { ActiveTradeWithPnL } from '@/types/active-trade';

const DEFAULT_USER_ID = 'default';

function getNowInEST(): string {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

export default function ActiveTradesStrip() {
  const [trades, setTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingTrade, setClosingTrade] = useState<ActiveTradeWithPnL | null>(null);
  const [closing, setClosing] = useState(false);

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

  const handleCloseTrade = async () => {
    if (!closingTrade) return;
    setClosing(true);
    try {
      const closedPosition = {
        id: closingTrade.id,
        ticker: closingTrade.ticker,
        plannedEntry: closingTrade.plannedEntry,
        plannedStop: closingTrade.plannedStop,
        plannedTarget: closingTrade.plannedTarget,
        actualEntry: closingTrade.actualEntry,
        actualShares: closingTrade.actualShares,
        openedAt: closingTrade.openedAt,
        closedAt: getNowInEST(),
        notes: closingTrade.notes,
        pnl: undefined,
      };

      await fetch(`/api/closed-positions?userId=${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(closedPosition),
      });

      await fetch(`/api/active-trades?id=${closingTrade.id}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });

      await fetchTrades();
      window.dispatchEvent(new CustomEvent('juno:active-trades-updated'));
      window.dispatchEvent(new CustomEvent('juno:closed-positions-updated'));
      setClosingTrade(null);
    } catch {
      // silently fail
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
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
        <div className="p-4">
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="shrink-0 w-52 h-52 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-2">No active trades</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-1">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className={`shrink-0 w-52 h-52 rounded-xl p-5 flex flex-col justify-between transition-colors group ${
                    trade.orderPlaced
                      ? 'bg-[#238636]/10 border border-[#238636] shadow-[0_0_12px_rgba(35,134,54,0.25)]'
                      : 'bg-[#161b22] border border-[#238636]/40 hover:border-[#238636]/70'
                  }`}
                >
                  {/* Top: ticker + close button */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {trade.orderPlaced && (
                        <span className="w-2 h-2 rounded-full bg-[#238636] animate-pulse shrink-0 mt-0.5" />
                      )}
                      <span className="font-bold text-white text-xl tracking-wide">{trade.ticker}</span>
                    </div>
                    <button
                      onClick={() => setClosingTrade(trade)}
                      className="p-1 rounded text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Close trade"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Order status */}
                  {trade.orderPlaced ? (
                    <div className="flex items-center gap-1.5 text-[#238636]">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-semibold">Order In</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[#8b949e]">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Pending</span>
                    </div>
                  )}

                  {/* Key levels */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[#8b949e] text-[10px] mb-1">Entry</p>
                      <p className="text-white text-sm font-semibold">${trade.actualEntry.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[#8b949e] text-[10px] mb-1">Stop</p>
                      <p className="text-[#f85149] text-sm font-semibold">${trade.plannedStop.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[#8b949e] text-[10px] mb-1">Target</p>
                      <p className="text-[#3fb950] text-sm font-semibold">${trade.plannedTarget.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Shares */}
                  <p className="text-xs text-[#8b949e]">
                    {trade.actualShares.toLocaleString()} shares
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Close Trade Confirmation */}
      {closingTrade && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <X className="w-6 h-6 text-yellow-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Close {closingTrade.ticker}?</h3>
              <p className="text-sm text-[#8b949e] mb-6">
                This will move the trade to Closed Positions for your records.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setClosingTrade(null)}
                  disabled={closing}
                  className="flex-1 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCloseTrade}
                  disabled={closing}
                  className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {closing ? 'Closing...' : 'Close Trade'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
