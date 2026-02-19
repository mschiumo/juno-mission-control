'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  List, 
  BarChart3, 
  BookOpen,
  TrendingUp,
  Newspaper,
  Calculator,
  Settings,
  ChevronDown
} from 'lucide-react';
import MarketHoursBanner from '@/components/MarketHoursBanner';
import GapScannerCard from '@/components/GapScannerCard';
import MarketCard from '@/components/MarketCard';
import NewsScreenerCard from '@/components/NewsScreenerCard';
import TradeEntryModal from '@/components/trading/TradeEntryModal';
import CalendarView from '@/components/trading/CalendarView';
import ProfitProjectionView from '@/components/trading/ProfitProjectionView';
import TradeManagementView from '@/components/trading/TradeManagementView';
import TradesListView from '@/components/trading/TradesListView';
import AnalyticsView from '@/components/trading/AnalyticsView';
import JournalView from '@/components/trading/JournalView';

type TradingSubTab = 'overview' | 'trades' | 'analytics' | 'journal' | 'market' | 'projection' | 'trade-management';

export default function TradingView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Get subtab from URL or default to 'overview'
  const getSubTabFromUrl = useCallback((): TradingSubTab => {
    const subtab = searchParams.get('subtab');
    if (subtab === 'market' || subtab === 'trades' || 
        subtab === 'analytics' || subtab === 'journal' || subtab === 'projection' ||
        subtab === 'trade-management') {
      return subtab;
    }
    return 'overview';
  }, [searchParams]);
  
  const [activeSubTab, setActiveSubTabState] = useState<TradingSubTab>(getSubTabFromUrl);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);

  // Update URL when subtab changes
  const setActiveSubTab = (subtab: TradingSubTab) => {
    setActiveSubTabState(subtab);
    setMobileDropdownOpen(false);
    const params = new URLSearchParams(searchParams);
    if (subtab === 'overview') {
      params.delete('subtab');
    } else {
      params.set('subtab', subtab);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const subTabs = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'market' as const, label: 'Market', icon: TrendingUp },
    { id: 'trades' as const, label: 'Trades', icon: List },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'journal' as const, label: 'Journal', icon: BookOpen },
    { id: 'trade-management' as const, label: 'Trade Management', icon: Settings },
    { id: 'projection' as const, label: 'Profit Projection', icon: Calculator },
  ];

  const activeTabLabel = subTabs.find(t => t.id === activeSubTab)?.label || 'Overview';
  const ActiveIcon = subTabs.find(t => t.id === activeSubTab)?.icon || LayoutDashboard;

  return (
    <div className="space-y-6">
      {/* Sub-Navigation - Desktop: Buttons, Mobile: Dropdown */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2">
        {/* Desktop - Button Grid */}
        <div className="hidden md:flex flex-wrap gap-1">
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

        {/* Mobile - Dropdown */}
        <div className="md:hidden relative">
          <button
            onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-white"
          >
            <div className="flex items-center gap-2">
              <ActiveIcon className="w-5 h-5 text-[#F97316]" />
              <span className="font-medium">{activeTabLabel}</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-[#8b949e] transition-transform ${mobileDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {mobileDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#161b22] border border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden">
              {subTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                      activeSubTab === tab.id
                        ? 'bg-[#F97316]/20 text-white'
                        : 'text-[#8b949e] hover:bg-[#262626] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${activeSubTab === tab.id ? 'text-[#F97316]' : ''}`} />
                    <span className="font-medium">{tab.label}</span>
                    {activeSubTab === tab.id && (
                      <div className="ml-auto w-2 h-2 bg-[#F97316] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {activeSubTab === 'overview' && (
        <CalendarView />
      )}

      {activeSubTab === 'trades' && (
        <TradesListView />
      )}

      {activeSubTab === 'analytics' && (
        <AnalyticsView />
      )}

      {activeSubTab === 'journal' && (
        <JournalView />
      )}

      {activeSubTab === 'trade-management' && (
        <TradeManagementView />
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
