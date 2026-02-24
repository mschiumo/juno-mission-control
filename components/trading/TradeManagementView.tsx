'use client';

import { Calculator, Bookmark } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';

export default function TradeManagementView() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Trade Management</h2>
      </div>

      {/* Content - Always side-by-side on desktop */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden p-6">
          <PositionCalculator />
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden p-6">
          <WatchlistView />
        </div>
      </div>
    </div>
  );
}
