'use client';

import { useState } from 'react';
import { Calculator, Bookmark, LayoutGrid, List } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';

type ViewMode = 'calculator' | 'watchlist' | 'both';

export default function TradeManagementView() {
  const [viewMode, setViewMode] = useState<ViewMode>('both');

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Trade Management</h2>
        <div className="flex items-center gap-1 bg-[#0F0F0F] rounded-lg p-1 border border-[#30363d]">
          <button
            onClick={() => setViewMode('calculator')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              viewMode === 'calculator'
                ? 'bg-[#F97316] text-white'
                : 'text-[#8b949e] hover:text-white hover:bg-[#262626]'
            }`}
            title="Show Calculator Only"
          >
            <Calculator className="w-4 h-4" />
            <span className="hidden sm:inline">Calculator</span>
          </button>
          <button
            onClick={() => setViewMode('watchlist')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              viewMode === 'watchlist'
                ? 'bg-[#F97316] text-white'
                : 'text-[#8b949e] hover:text-white hover:bg-[#262626]'
            }`}
            title="Show Watchlist Only"
          >
            <Bookmark className="w-4 h-4" />
            <span className="hidden sm:inline">Watchlist</span>
          </button>
          <button
            onClick={() => setViewMode('both')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              viewMode === 'both'
                ? 'bg-[#F97316] text-white'
                : 'text-[#8b949e] hover:text-white hover:bg-[#262626]'
            }`}
            title="Show Both"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Both</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`grid gap-6 ${
        viewMode === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
      }`}>
        {(viewMode === 'calculator' || viewMode === 'both') && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden p-6">
            <PositionCalculator />
          </div>
        )}
        {(viewMode === 'watchlist' || viewMode === 'both') && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden p-6">
            <WatchlistView />
          </div>
        )}
      </div>
    </div>
  );
}
