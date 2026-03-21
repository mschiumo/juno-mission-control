'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Activity, CheckCircle, Clock, X, TrendingUp, TrendingDown } from 'lucide-react';
import type { ActiveTradeWithPnL } from '@/types/active-trade';

const DEFAULT_USER_ID = 'default';
const PRICE_POLL_MS = 3000;
const STOP_WARN_PCT = 0.05; // within 5% of stop → warn

function getNowInEST(): string {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs.toFixed(2);
  return (n < 0 ? '-' : '+') + '$' + formatted;
}

type StopStatus = 'safe' | 'warn' | 'danger';

// Only meaningful when order is placed — stop is live
function stopStatus(current: number, stop: number, entry: number): StopStatus {
  const isLong = entry > stop;
  if (isLong) {
    if (current <= stop) return 'danger';
    if (current <= stop * (1 + STOP_WARN_PCT)) return 'warn';
  } else {
    if (current >= stop) return 'danger';
    if (current >= stop * (1 - STOP_WARN_PCT)) return 'warn';
  }
  return 'safe';
}

export default function ActiveTradesStrip() {
  const [trades, setTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [closingTrade, setClosingTrade] = useState<ActiveTradeWithPnL | null>(null);
  const [closing, setClosing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const priceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const fetchPrices = async (activeTrades: ActiveTradeWithPnL[]) => {
    const tickers = [...new Set(activeTrades.map((t) => t.ticker))];
    if (tickers.length === 0) return;
    try {
      const res = await fetch(`/api/prices?symbols=${tickers.join(',')}`);
      const data = await res.json();
      setPrices((prev) => ({ ...prev, ...data.prices }));
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
    if (trades.length === 0) return;
    fetchPrices(trades);
    priceIntervalRef.current = setInterval(() => fetchPrices(trades), PRICE_POLL_MS);
    return () => {
      if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
    };
  }, [trades]);

  const handleCloseTrade = async () => {
    if (!closingTrade) return;
    setClosing(true);
    try {
      await fetch(`/api/closed-positions?userId=${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
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

  // ── Drag handlers (local reorder only) ──────────────────────────────────
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggingId) setDragOverId(id);
  };

  const onDragLeave = () => setDragOverId(null);

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (!draggingId || draggingId === targetId) return;
    setTrades((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((t) => t.id === draggingId);
      const toIdx = next.findIndex((t) => t.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
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

        {/* Grid */}
        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-full h-52 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-2">No active trades</p>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
              {trades.map((trade) => {
                const currentPrice = prices[trade.ticker];
                const hasPrice = currentPrice !== undefined;
                // Stop-loss warnings only apply once an order is in
                const status: StopStatus = (trade.orderPlaced && hasPrice)
                  ? stopStatus(currentPrice, trade.plannedStop, trade.actualEntry)
                  : 'safe';
                const pnl = (trade.orderPlaced && hasPrice)
                  ? (currentPrice - trade.actualEntry) * trade.actualShares
                  : null;

                const cardClass = (() => {
                  if (status === 'danger')
                    return 'bg-red-500/10 border border-red-500 animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.4)]';
                  if (status === 'warn')
                    return 'bg-orange-500/10 border border-orange-400 animate-pulse shadow-[0_0_12px_rgba(251,146,60,0.3)]';
                  if (trade.orderPlaced)
                    return 'bg-[#238636]/10 border border-[#238636] shadow-[0_0_12px_rgba(35,134,54,0.25)]';
                  return 'bg-[#161b22] border border-[#238636]/40 hover:border-[#238636]/70';
                })();

                const isDragging = draggingId === trade.id;
                const isOver = dragOverId === trade.id;

                return (
                  <div
                    key={trade.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, trade.id)}
                    onDragOver={(e) => onDragOver(e, trade.id)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, trade.id)}
                    onDragEnd={onDragEnd}
                    className={`h-52 rounded-xl p-5 flex flex-col justify-between transition-all cursor-grab active:cursor-grabbing group
                      ${cardClass}
                      ${isDragging ? 'opacity-40 scale-95' : ''}
                      ${isOver ? 'ring-2 ring-[#238636] scale-[1.02]' : ''}
                    `}
                  >
                    {/* Top: ticker + close */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {status === 'danger' && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0 mt-0.5" />
                        )}
                        {status === 'warn' && (
                          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0 mt-0.5" />
                        )}
                        {status === 'safe' && trade.orderPlaced && (
                          <span className="w-2 h-2 rounded-full bg-[#238636] animate-pulse shrink-0 mt-0.5" />
                        )}
                        <span className="font-bold text-white text-xl tracking-wide">{trade.ticker}</span>
                      </div>
                      <button
                        onClick={() => setClosingTrade(trade)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1 rounded text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Close trade"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Live price + P&L (order placed) */}
                    {trade.orderPlaced ? (
                      <div>
                        {hasPrice ? (
                          <>
                            <p className="text-lg font-bold text-white tabular-nums">
                              ${currentPrice.toFixed(2)}
                            </p>
                            {pnl !== null && (
                              <div className={`flex items-center gap-1 text-sm font-semibold ${pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                                {pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                {formatCurrency(pnl)}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#238636]">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-semibold">Order In</span>
                          </div>
                        )}
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
                        <p className="text-[#8b949e] text-[10px] mb-0.5">Entry</p>
                        <p className="text-white text-xs font-semibold">${trade.actualEntry.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[#8b949e] text-[10px] mb-0.5">Stop</p>
                        <p className={`text-xs font-semibold ${status !== 'safe' ? 'text-red-400' : 'text-[#f85149]'}`}>
                          ${trade.plannedStop.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#8b949e] text-[10px] mb-0.5">Target</p>
                        <p className="text-[#3fb950] text-xs font-semibold">${trade.plannedTarget.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Shares */}
                    <p className="text-[10px] text-[#8b949e]">
                      {trade.actualShares.toLocaleString()} shares
                    </p>
                  </div>
                );
              })}
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
