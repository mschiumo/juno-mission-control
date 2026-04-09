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
            data-tour="trading-mode"
            onClick={enterTradingMode}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all btn-ghost"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Trading Mode
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[960px]">
          {/* Daily Favorites + Calculator - Left */}
          <div className="flex flex-col h-full overflow-hidden rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
            {/* Daily Favorites — fixed at 50% height, does not expand or move when items change */}
            <div className="flex-shrink-0 overflow-hidden p-5" style={{ height: '50%' }}>
              <QuickWatchlist
                onSelectTicker={setSelectedTicker}
                calculatorRef={calculatorRef}
              />
            </div>

            {/* Position Calculator — always visible, occupies remaining space */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div ref={calculatorRef} data-tour="position-calculator" className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.01)' }}>
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: 'var(--accent-dim)' }}>
                    <Calculator className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Position Calculator</h3>
                </div>
                <div className="p-5">
                  <PositionCalculator initialTicker={selectedTicker} onTickerChange={setSelectedTicker} />
                </div>
              </div>
            </div>
          </div>

          {/* Watchlist - Right */}
          <div className="rounded-xl overflow-hidden flex flex-col h-full" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.01)' }}>
              <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: 'var(--accent-dim)' }}>
                <Bookmark className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Watchlist</h3>
            </div>
            <div className="p-5 flex-1 min-h-0 overflow-y-auto">
              <WatchlistView />
            </div>
          </div>
        </div>
      </div>

      {/* Trading Mode — fullscreen */}
      {tradingMode && (
        <div
          ref={tradingModeContainerRef}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden"
          style={{ background: 'var(--bg-base)' }}
        >
          {/* Top bar */}
          <div className="shrink-0 flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
              <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>Trading Mode</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Press Esc to exit</span>
            </div>
            <button
              onClick={exitTradingMode}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 flex flex-col gap-4 p-5 overflow-hidden">
            <div className="flex-[3] min-h-0 flex flex-col">
              <ActiveTradesStrip />
            </div>
            <div className="flex-[2] min-h-0 rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <WatchlistView hideActiveTrades hideClosedPositions cardColumns={4} emptyMessage="Add trades to your Watchlist to see them here" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
