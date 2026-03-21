'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Calculator, Bookmark, Maximize2, Minimize2 } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';
import QuickWatchlist from './QuickWatchlist';
import MarketTickerBar from './MarketTickerBar';

export default function TradeManagementView() {
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [tradingMode, setTradingMode] = useState(false);
  const calculatorRef = useRef<HTMLDivElement>(null);
  const tradingModeCalculatorRef = useRef<HTMLDivElement>(null);

  const exitTradingMode = useCallback(() => setTradingMode(false), []);

  useEffect(() => {
    if (!tradingMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitTradingMode(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tradingMode, exitTradingMode]);

  const sharedLayout = (inTradingMode: boolean) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Daily Favorites + Calculator - Left */}
      <div className="space-y-6">
        <QuickWatchlist
          onSelectTicker={setSelectedTicker}
          calculatorRef={inTradingMode ? tradingModeCalculatorRef : calculatorRef}
        />
        <div
          ref={inTradingMode ? tradingModeCalculatorRef : calculatorRef}
          className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden sticky top-6"
        >
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
            <Calculator className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-lg font-semibold text-white">Position Calculator</h3>
          </div>
          <div className="p-6">
            <PositionCalculator
              initialTicker={selectedTicker}
              onTickerChange={setSelectedTicker}
            />
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
  );

  return (
    <>
      {/* Normal view */}
      <div className="space-y-4">
        <MarketTickerBar />
        <div className="flex justify-end">
          <button
            onClick={() => setTradingMode(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#F97316] hover:bg-[#F97316]/10 rounded-lg transition-all"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Trading Mode
          </button>
        </div>
        {sharedLayout(false)}
      </div>

      {/* Trading Mode overlay */}
      {tradingMode && (
        <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col overflow-hidden">
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
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {sharedLayout(true)}
          </div>
        </div>
      )}
    </>
  );
}
