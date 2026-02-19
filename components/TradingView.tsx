'use client';

import { useState } from 'react';
import { 
  LayoutDashboard, 
  List, 
  Calendar, 
  BarChart3, 
  BookOpen,
  TrendingUp,
  Newspaper,
  Calculator
} from 'lucide-react';
import MarketHoursBanner from '@/components/MarketHoursBanner';
import GapScannerCard from '@/components/GapScannerCard';
import MarketCard from '@/components/MarketCard';
import NewsScreenerCard from '@/components/NewsScreenerCard';
import TradeEntryModal from '@/components/trading/TradeEntryModal';
import DashboardStats from '@/components/trading/DashboardStats';
import CalendarView from '@/components/trading/CalendarView';
import ProfitProjectionView from '@/components/trading/ProfitProjectionView';

type TradingSubTab = 'overview' | 'trades' | 'calendar' | 'analytics' | 'journal' | 'market' | 'projection';

export default function TradingView() {
  const [activeSubTab, setActiveSubTab] = useState<TradingSubTab>('overview');
  const [showTradeModal, setShowTradeModal] = useState(false);

  const subTabs = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'market' as const, label: 'Market', icon: TrendingUp },
    { id: 'trades' as const, label: 'Trades', icon: List },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'journal' as const, label: 'Journal', icon: BookOpen },
    { id: 'projection' as const, label: 'Profit Projection', icon: Calculator },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2">
        <div className="flex flex-wrap gap-1">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  activeSubTab === tab.id
                    ? 'bg-[#F97316] text-white'
                    : 'text-[#8b949e] hover:bg-[#262626] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {activeSubTab === 'overview' && (
        <DashboardStats onAddTrade={() => setShowTradeModal(true)} />
      )}

      {activeSubTab === 'trades' && (
        <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
          <List className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Trades List</h3>
          <p className="text-[#8b949e]">Sortable, filterable trade table coming soon...</p>
        </div>
      )}

      {activeSubTab === 'calendar' && (
        <CalendarView />
      )}

      {activeSubTab === 'analytics' && (
        <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
          <BarChart3 className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Analytics</h3>
          <p className="text-[#8b949e]">Performance by day/time/symbol/strategy coming soon...</p>
        </div>
      )}

      {activeSubTab === 'journal' && (
        <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
          <BookOpen className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Trading Journal</h3>
          <p className="text-[#8b949e]">Daily journal and trade notes coming soon...</p>
        </div>
      )}

      {activeSubTab === 'market' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            <div className="lg:col-span-2 space-y-4">
              <MarketHoursBanner compact />
              <GapScannerCard />
            </div>
            <div className="lg:col-span-3">
              <MarketCard />
            </div>
          </div>
          <NewsScreenerCard />
        </div>
      )}

      {activeSubTab === 'projection' && (
        <ProfitProjectionView />
      )}

      {/* Trade Entry Modal */}
      <TradeEntryModal
        isOpen={showTradeModal}
        onClose={() => setShowTradeModal(false)}
      />
    </div>
  );
}
