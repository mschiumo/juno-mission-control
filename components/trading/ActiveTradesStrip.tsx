'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  const [priceFlash, setPriceFlash] = useState<Record<string, { dir: 'up' | 'down'; n: number }>>({});
  const prevPricesRef = useRef<Record<string, number>>({});
  const [closingTrade, setClosingTrade] = useState<ActiveTradeWithPnL | null>(null);
  const [closing, setClosing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const fetchTrades = async () => {
    try {
      const res = await fetch(`/api/active-trades?userId=${DEFAULT_USER_ID}`);
      const result = await res.json();
      const newTrades: ActiveTradeWithPnL[] = result.data || [];
      setTrades(newTrades);
      // REST snapshot immediately — SSE will stream live updates on top
      fetchPrices(newTrades);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 30_000);
    window.addEventListener('ct:active-trades-updated', fetchTrades);
    return () => {
      clearInterval(id);
      window.removeEventListener('ct:active-trades-updated', fetchTrades);
    };
  }, []);

  // Live price feed via SSE → Finnhub WebSocket. Falls back to REST polling if unavailable.
  useEffect(() => {
    // Tear down previous connection
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }

    if (trades.length === 0) return;

    const tickers = [...new Set(trades.map((t) => t.ticker))];
    const es = new EventSource(`/api/prices/stream?symbols=${tickers.join(',')}`);
    esRef.current = es;

    es.onopen = () => {
      // SSE connected — cancel polling fallback if it was running
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    es.onmessage = (event) => {
      try {
        const updates: Record<string, number> = JSON.parse(event.data);
        setPrices((prev) => ({ ...prev, ...updates }));
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      // SSE dropped or unavailable — run polling until it recovers
      if (!pollIntervalRef.current) {
        fetchPrices(trades);
        pollIntervalRef.current = setInterval(() => fetchPrices(trades), PRICE_POLL_MS);
      }
    };

    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    };
  }, [trades]);

  // Detect price direction changes and trigger flash animation
  useEffect(() => {
    const updates: Record<string, { dir: 'up' | 'down'; n: number }> = {};
    let changed = false;
    for (const [symbol, price] of Object.entries(prices)) {
      const prev = prevPricesRef.current[symbol];
      if (prev !== undefined && prev !== price) {
        updates[symbol] = { dir: price > prev ? 'up' : 'down', n: (priceFlash[symbol]?.n ?? 0) + 1 };
        changed = true;
      }
      prevPricesRef.current[symbol] = price;
    }
    if (changed) setPriceFlash((prev) => ({ ...prev, ...updates }));
  }, [prices]);

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
      window.dispatchEvent(new CustomEvent('ct:active-trades-updated'));
      window.dispatchEvent(new CustomEvent('ct:closed-positions-updated'));
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

  const totalPnL = useMemo(() => {
    let sum = 0;
    let hasAny = false;
    for (const trade of trades) {
      const currentPrice = prices[trade.ticker];
      if (currentPrice === undefined) continue;
      const isLong = trade.plannedTarget > trade.plannedEntry;
      sum += isLong
        ? (currentPrice - trade.actualEntry) * trade.actualShares
        : (trade.actualEntry - currentPrice) * trade.actualShares;
      hasAny = true;
    }
    return hasAny ? sum : null;
  }, [trades, prices]);

  return (
    <>
      <style>{`
        @keyframes price-flash-up {
          0%   { background-color: rgba(35, 134, 54, 0.55); border-radius: 3px; }
          100% { background-color: transparent; }
        }
        @keyframes price-flash-down {
          0%   { background-color: rgba(248, 81, 73, 0.45); border-radius: 3px; }
          100% { background-color: transparent; }
        }
      `}</style>
      {/* Fills the height given by its parent (50% of Trading Mode) */}
      <div className="flex-1 min-h-0 bg-[#0d1117] border border-[#238636]/40 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#238636]/10 border-b border-[#238636]/30 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#238636]" />
            <span className="text-sm font-semibold text-[#238636]">Active Trades</span>
            {!loading && <span className="text-xs text-[#8b949e]">({trades.length})</span>}
            {totalPnL !== null && (
              <div className="flex items-center gap-1.5 ml-3 px-2.5 py-1 rounded-md bg-[#0d1117] border border-[#30363d]">
                {totalPnL >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-[#3fb950]" /> : <TrendingDown className="w-3.5 h-3.5 text-[#f85149]" />}
                <span className={`text-xs font-bold tabular-nums ${totalPnL >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                  Total: {formatCurrency(totalPnL)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#484f58] italic">prices may be a few seconds delayed</span>
            <button onClick={fetchTrades} className="p-1 text-[#8b949e] hover:text-white transition-colors rounded" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card area — fills remaining height, scrolls if cards overflow */}
        <div className="flex-1 min-h-0 p-3 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-2">No active trades</p>
          ) : (
            <div className="grid grid-cols-5 xl:grid-cols-6 gap-3">
              {trades.map((trade) => {
                const currentPrice = prices[trade.ticker];
                const hasPrice = currentPrice !== undefined;
                // Stop-loss warning only fires when orderPlaced — avoids false red pulses on pending trades
                const status: StopStatus = (trade.orderPlaced && hasPrice)
                  ? stopStatus(currentPrice, trade.plannedStop, trade.actualEntry)
                  : 'safe';
                // P&L shows for all trades with a live price
                const isLong = trade.plannedTarget > trade.plannedEntry;
                const pnl = hasPrice
                  ? isLong
                    ? (currentPrice - trade.actualEntry) * trade.actualShares
                    : (trade.actualEntry - currentPrice) * trade.actualShares
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
                    className={`h-64 rounded-xl p-4 flex flex-col justify-between transition-all cursor-grab active:cursor-grabbing group
                      ${cardClass}
                      ${draggingId === trade.id ? 'opacity-40 scale-95' : ''}
                      ${dragOverId === trade.id ? 'ring-2 ring-[#238636] scale-[1.02]' : ''}
                    `}
                  >
                    {/* Ticker */}
                    <div className="flex items-center gap-2 min-w-0">
                      {status === 'danger' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                      {status === 'warn'   && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />}
                      {status === 'safe'   && <span className="w-2 h-2 rounded-full bg-[#238636] animate-pulse shrink-0" />}
                      <span className="font-bold text-white text-base tracking-wide truncate">{trade.ticker}</span>
                    </div>

                    {/* Live price + Profit side by side */}
                    {hasPrice ? (
                      <div className="flex gap-4">
                        <div>
                          <p className="text-[#8b949e] text-[10px] mb-0.5">Price</p>
                          {(() => {
                            const flash = priceFlash[trade.ticker];
                            return (
                              <p
                                key={flash ? `${trade.ticker}-${flash.n}` : trade.ticker}
                                className="text-sm font-bold text-white tabular-nums px-1 -mx-1"
                                style={flash ? { animation: `price-flash-${flash.dir} 0.6s ease-out forwards` } : {}}
                              >
                                ${currentPrice.toFixed(2)}
                              </p>
                            );
                          })()}
                        </div>
                        {pnl !== null && (
                          <div>
                            <p className="text-[#8b949e] text-[10px] mb-0.5">Profit</p>
                            <p className={`text-sm font-bold tabular-nums ${pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                              {formatCurrency(pnl)}
                            </p>
                          </div>
                        )}
                      </div>
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


                    {/* Key levels + close */}
                    <div className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
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
                      <button
                        onClick={() => setClosingTrade(trade)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-red-400/70 hover:text-red-400 bg-red-500/5 hover:bg-red-400/15 border border-red-500/20 hover:border-red-400/40 transition-colors text-[11px] font-medium"
                      >
                        <X className="w-3 h-3" />
                        Close Trade
                      </button>
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
