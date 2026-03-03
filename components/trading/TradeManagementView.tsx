'use client';

import { Calculator, Bookmark } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';

export default function TradeManagementView() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Trade Management</h2>
      </div>

      {/* Side-by-Side Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calculator Section - Left */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
            <Calculator className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-lg font-semibold text-white">Position Calculator</h3>
          </div>
          <div className="p-6">
            <PositionCalculator />
          </div>
        </div>

        {/* Watchlist Section - Right (contains Active + Potential) */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
            <Bookmark className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-lg font-semibold text-white">Watchlist</h3>
          </div>
          <div className="p-6">
            <WatchlistView />
          </div>
        </div>
      </div>
    </div>
  );
}
