'use client';

import { useState } from 'react';
import { Calculator, Bookmark, Activity } from 'lucide-react';
import PositionCalculator from './PositionCalculator';
import WatchlistView from './WatchlistView';
import ActiveTradesView from './ActiveTradesView';

type Tab = 'calculator' | 'watchlist' | 'active';

export default function TradeManagementView() {
  const [activeTab, setActiveTab] = useState<Tab>('calculator');

  const tabs = [
    { id: 'calculator' as Tab, label: 'Calculator', icon: Calculator },
    { id: 'watchlist' as Tab, label: 'Watchlist', icon: Bookmark },
    { id: 'active' as Tab, label: 'Active Trades', icon: Activity },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Trade Management</h2>
        
        {/* Tabs */}
        <div className="flex items-center bg-[#161b22] border border-[#30363d] rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#F97316] text-white'
                    : 'text-[#8b949e] hover:text-white hover:bg-[#262626]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {activeTab === 'calculator' && (
          <div className="p-6">
            <PositionCalculator />
          </div>
        )}
        
        {activeTab === 'watchlist' && (
          <div className="p-6">
            <WatchlistView />
          </div>
        )}
        
        {activeTab === 'active' && (
          <div className="p-6">
            <ActiveTradesView 
              onTradeClosed={() => {
                // Optionally show a notification or refresh data
                console.log('Trade closed');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
