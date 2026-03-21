'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Activity, CheckCircle, Clock, X, TrendingUp, TrendingDown } from 'lucide-react';
import type { ActiveTradeWithPnL } from '@/types/active-trade';

const DEFAULT_USER_ID = 'default';
const PRICE_POLL_MS = 3000;
const STOP_WARN_PCT = 0.05;

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
    window.addEventListener('juno:active-trades-updated', fetchTrades);
    return () => {
      clearInterval(id);
      window.removeEventListener('juno:active-trades-updated', fetchTrades);
    };
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
      const from = next.findIndex((t) => t.id === draggingId);
      const to = next.findIndex((t) => t.id === targetId);
      if (from === -1 || to === -1) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverId(null); };

  return (
    <>
      {/* Fills the height given by its parent (50% of Trading Mode) */}
      <div className="flex-1 min-h-0 bg-[#0d1117] border border-[#238636]/40 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#238636]/10 border-b border-[#238636]/30 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#238636]" />
            <span className="text-sm font-semibold text-[#238636]">Active Trades</span>
            {!loading && <span className="text-xs text-[#8b949e]">({trades.length})</span>}
          </div>
          <button onClick={fetchTrades} className="p-1 text-[#8b949e] hover:text-white transition-colors rounded" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card area — fills remaining height, scrolls if cards overflow */}
        <div className="flex-1 min-h-0 p-3 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-56 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-2">No active trades</p>
          ) : (
            <div className="grid grid-cols-5 xl:grid-cols-6 gap-3">
              {trades.map((trade) => {
                const currentPrice = prices[trade.ticker];
                const hasPrice = currentPrice !== undefined;
                const status: StopStatus = hasPrice
                  ? stopStatus(currentPrice, trade.plannedStop, trade.actualEntry)
                  : 'safe';
                const pnl = hasPrice
                  ? (currentPrice - trade.actualEntry) * trade.actualShares
                  : null;

                const cardClass = (() => {
                  if (status === 'danger') return 'bg-red-500/10 border border-red-500 animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.4)]';
                  if (status === 'warn') return 'bg-orange-500/10 border border-orange-400 animate-pulse shadow-[0_0_12px_rgba(251,146,60,0.3)]';
                  if (hasPrice || trade.orderPlaced) return 'bg-[#238636]/10 border border-[#238636] shadow-[0_0_10px_rgba(35,134,54,0.2)]';
                  return 'bg-[#161b22] border border-[#30363d] hover:border-[#238636]/50';
                })();

                return (
                  <div
                    key={trade.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, trade.id)}
                    onDragOver={(e) => onDragOver(e, trade.id)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, trade.id)}
                    onDragEnd={onDragEnd}
                    className={`h-56 rounded-xl p-4 flex flex-col justify-between transition-all cursor-grab active:cursor-grabbing group
                      ${cardClass}
                      ${draggingId === trade.id ? 'opacity-40 scale-95' : ''}
                      ${dragOverId === trade.id ? 'ring-2 ring-[#238636] scale-[1.02]' : ''}
                    `}
                  >
                    {/* Ticker + close */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {status === 'danger' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                        {status === 'warn'   && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />}
                        {status === 'safe'   && <span className="w-2 h-2 rounded-full bg-[#238636] animate-pulse shrink-0" />}
                        <span className="font-bold text-white text-base tracking-wide truncate">{trade.ticker}</span>
                      </div>
                      <button
                        onClick={() => setClosingTrade(trade)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1 rounded text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                        title="Close trade"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Live price + P&L */}
                    <div>
                      {hasPrice ? (
                        <>
                          <p className="text-base font-bold text-white tabular-nums">${currentPrice.toFixed(2)}</p>
                          {pnl !== null && (
                            <div className={`flex items-center gap-1 text-xs font-semibold ${pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                              {pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {formatCurrency(pnl)}
                            </div>
                          )}
                        </>
                      ) : trade.orderPlaced ? (
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
                    </div>

                    {/* Key levels — 2x2 grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
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
                      <div>
                        <p className="text-[#8b949e] text-[10px] mb-0.5">Shares</p>
                        <p className="text-[#F97316] text-xs font-semibold">{trade.actualShares.toLocaleString()}</p>
                      </div>
                    </div>
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
              <p className="text-sm text-[#8b949e] mb-6">This will move the trade to Closed Positions for your records.</p>
              <div className="flex gap-3">
                <button onClick={() => setClosingTrade(null)} disabled={closing}
                  className="flex-1 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium">
                  Cancel
                </button>
                <button onClick={handleCloseTrade} disabled={closing}
                  className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
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
