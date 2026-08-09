'use client';

import { useState, useRef } from 'react';
import { Calculator, Bookmark } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';
import QuickWatchlist from './QuickWatchlist';
import MarketTickerBar from './MarketTickerBar';

export default function TradeManagementView() {
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const calculatorRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4">
      <MarketTickerBar />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[1100px]">
        {/* Daily Favorites + Calculator - Left */}
        <div className="flex flex-col h-full overflow-hidden rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          {/* Daily Favorites — fixed at 360px, does not expand or move when items change */}
          <div className="flex-shrink-0 overflow-hidden p-5" style={{ height: '360px' }}>
            <QuickWatchlist
              onSelectTicker={setSelectedTicker}
              calculatorRef={calculatorRef}
            />
          </div>

          {/* Position Calculator — always fully visible, no scroll */}
          <div className="flex-1 min-h-0 overflow-hidden p-5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div ref={calculatorRef} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
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
  );
}
