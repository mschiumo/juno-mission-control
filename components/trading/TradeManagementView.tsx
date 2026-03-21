'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Calculator, Bookmark, Maximize2, Minimize2 } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';
import QuickWatchlist from './QuickWatchlist';
import MarketTickerBar from './MarketTickerBar';
import ActiveTradesStrip from './ActiveTradesStrip';

export default function TradeManagementView() {
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [tradingMode, setTradingMode] = useState(false);
  const calculatorRef = useRef<HTMLDivElement>(null);
  const tradingModeContainerRef = useRef<HTMLDivElement>(null);

  const enterTradingMode = useCallback(async () => {
    setTradingMode(true);
    await new Promise(r => setTimeout(r, 50));
    if (tradingModeContainerRef.current?.requestFullscreen) {
      tradingModeContainerRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  const exitTradingMode = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setTradingMode(false);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setTradingMode(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <>
      {/* Normal view */}
      <div className="space-y-4">
        <MarketTickerBar />
        <div className="flex justify-end">
          <button
            onClick={enterTradingMode}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#F97316] hover:bg-[#F97316]/10 rounded-lg transition-all"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Trading Mode
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Favorites + Calculator - Left */}
          <div className="space-y-6">
            <QuickWatchlist
              onSelectTicker={setSelectedTicker}
              calculatorRef={calculatorRef}
            />
            <div ref={calculatorRef} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden sticky top-6">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
                <Calculator className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-lg font-semibold text-white">Position Calculator</h3>
              </div>
              <div className="p-6">
                <PositionCalculator initialTicker={selectedTicker} onTickerChange={setSelectedTicker} />
              </div>
            </div>
          </div>

          {/* Watchlist - Right */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50 shrink-0">
              <Bookmark className="w-5 h-5 text-[#F97316]" />
              <h3 className="text-lg font-semibold text-white">Watchlist</h3>
            </div>
            <div className="p-6 flex-1 min-h-0 overflow-y-auto">
              <WatchlistView />
            </div>
          </div>
        </div>
      </div>

      {/* Trading Mode — fullscreen */}
      {tradingMode && (
        <div
          ref={tradingModeContainerRef}
          className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col overflow-hidden"
        >
          {/* Top bar */}
          <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#30363d] bg-[#161b22]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
              <span className="text-sm font-semibold text-white tracking-wide">Trading Mode</span>
              <span className="text-xs text-[#8b949e]">Press Esc to exit</span>
            </div>
            <button
              onClick={exitTradingMode}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#f85149] hover:bg-[#f85149]/10 rounded-lg transition-all"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            {/* Row 1 — Active Trades horizontal strip */}
            <ActiveTradesStrip />

            {/* Row 2 — Calculator (1/3) + Potential Trades (2/3) */}
            <div className="grid grid-cols-3 gap-4">
              {/* Calculator */}
              <div className="col-span-1 bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
                  <Calculator className="w-4 h-4 text-[#F97316]" />
                  <h3 className="text-sm font-semibold text-white">Position Calculator</h3>
                </div>
                <div className="p-4">
                  <PositionCalculator initialTicker={selectedTicker} onTickerChange={setSelectedTicker} />
                </div>
              </div>

              {/* Potential Trades */}
              <div className="col-span-2 bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 shrink-0">
                  <Bookmark className="w-4 h-4 text-[#F97316]" />
                  <h3 className="text-sm font-semibold text-white">Potential Trades</h3>
                </div>
                <div className="p-4 flex-1 min-h-0 overflow-y-auto">
                  <WatchlistView hideActiveTrades hideClosedPositions />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
