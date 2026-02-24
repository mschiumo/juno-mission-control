'use client';

import { Calculator, Bookmark, Activity } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';
import ActiveTradesView from './ActiveTradesView';

export default function TradeManagementView() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Trade Management</h2>
      </div>

      {/* Active Trades Section */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
          <Activity className="w-5 h-5 text-[#F97316]" />
          <h3 className="text-lg font-semibold text-white">Active Trades</h3>
        </div>
        <div className="p-6">
          <ActiveTradesView 
            onTradeClosed={() => {
              console.log('Trade closed');
            }}
          />
        </div>
      </div>

      {/* Calculator Section */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
          <Calculator className="w-5 h-5 text-[#F97316]" />
          <h3 className="text-lg font-semibold text-white">Calculator</h3>
        </div>
        <div className="p-6">
          <PositionCalculator />
        </div>
      </div>

      {/* Watchlist Section */}
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
  );
}
