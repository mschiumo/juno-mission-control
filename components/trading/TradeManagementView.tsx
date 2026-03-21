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
      {/* Ticker Bar - full width above both cards */}
      <MarketTickerBar />

      {/* Side-by-Side Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Favorites + Calculator Section - Left */}
        <div className="space-y-6">
          {/* Daily Favorites above Position Calculator */}
          <QuickWatchlist
            onSelectTicker={setSelectedTicker}
            calculatorRef={calculatorRef}
          />

          <div ref={calculatorRef} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
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

        {/* Watchlist Section - Right (fixed height matching left column) */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50 shrink-0">
            <Bookmark className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-lg font-semibold text-white">Watchlist</h3>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            <WatchlistView />
          </div>
        </div>
      </div>
    </div>
  );
}
