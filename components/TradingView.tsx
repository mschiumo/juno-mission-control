'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  Calculator,
  Settings,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';
import MarketEventsCard from '@/components/MarketEventsCard';
import GapScannerCard from '@/components/GapScannerCard';
import MarketCard from '@/components/MarketCard';
import MarketBriefingModal from '@/components/MarketBriefingModal';
import TradeEntryModal from '@/components/trading/TradeEntryModal';
import CombinedCalendarView from '@/components/trading/CombinedCalendarView';
import ProfitProjectionView from '@/components/trading/ProfitProjectionView';
import TradeManagementView from '@/components/trading/TradeManagementView';
import PerformanceView from '@/components/trading/PerformanceView';
import TradingTour from '@/components/trading/TradingTour';

type TradingSubTab = 'overview' | 'market' | 'performance' | 'projection' | 'trade-management';

export default function TradingView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get subtab from URL or default to 'overview'
  const getSubTabFromUrl = useCallback((): TradingSubTab => {
    const subtab = searchParams.get('subtab');
    if (subtab === 'market' || subtab === 'performance' || subtab === 'projection' || subtab === 'trade-management') {
      return subtab;
    }
    return 'overview';
  }, [searchParams]);

  const [activeSubTab, setActiveSubTabState] = useState<TradingSubTab>(getSubTabFromUrl);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    fetch('/api/user/prefs')
      .then((r) => r.json())
      .then((data) => {
        if (!data?.prefs?.tradingTourCompleted) {
          setShowTour(true);
        }
      })
      .catch(() => {});
  }, []);

  // Update URL when subtab changes
  const setActiveSubTab = useCallback(
    (subtab: TradingSubTab) => {
      setActiveSubTabState(subtab);
      setMobileDropdownOpen(false);
      const params = new URLSearchParams(searchParams);
      if (subtab === 'overview') {
        params.delete('subtab');
      } else {
        params.set('subtab', subtab);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  function handleTourComplete() {
    setShowTour(false);
    fetch('/api/user/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradingTourCompleted: true }),
    }).catch(() => {});
  }

  const subTabs = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'market' as const, label: 'Market', icon: TrendingUp },
    { id: 'trade-management' as const, label: 'Trade Management', icon: Settings },
    { id: 'performance' as const, label: 'Performance', icon: BarChart3 },
    { id: 'projection' as const, label: 'Profit Projection', icon: Calculator },
  ];

  const activeTabLabel = subTabs.find((t) => t.id === activeSubTab)?.label || 'Overview';
  const ActiveIcon = subTabs.find((t) => t.id === activeSubTab)?.icon || LayoutDashboard;

  return (
    <div className="space-y-6">
      {/* Sub-Navigation - Desktop: Buttons, Mobile: Dropdown */}
      <div data-tour="trading-nav" className="bg-[#111318] border border-white/[0.06] rounded-2xl shadow-xl shadow-black/20 p-2">
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
                    : 'text-[#71717a] hover:bg-[#262626] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile - Hamburger Menu */}
        <div className="md:hidden">
          {/* Hamburger Button */}
          <button
            onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-[#09090b] border border-white/[0.06] rounded-lg text-white"
          >
            <div className="flex items-center gap-2">
              <ActiveIcon className="w-5 h-5 text-[#F97316]" />
              <span className="font-medium">{activeTabLabel}</span>
            </div>
            {mobileDropdownOpen ? (
              <X className="w-5 h-5 text-[#71717a]" />
            ) : (
              <Menu className="w-5 h-5 text-[#71717a]" />
            )}
          </button>

          {/* Expanded Menu */}
          {mobileDropdownOpen && (
            <div className="mt-2 bg-[#111318] border border-white/[0.06] rounded-2xl overflow-hidden">
              {subTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                      activeSubTab === tab.id
                        ? 'bg-[#F97316]/20 text-white'
                        : 'text-[#71717a] hover:bg-[#262626] hover:text-white'
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
      {activeSubTab === 'overview' && <CombinedCalendarView />}

      {activeSubTab === 'trade-management' && <TradeManagementView />}

      {activeSubTab === 'market' && (
        <div className="space-y-6">
          <MarketEventsCard onOpenBriefing={() => setShowBriefingModal(true)} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 lg:h-[640px]">
            <div data-tour="gap-scanner" className="h-[640px] lg:h-full overflow-hidden">
              <GapScannerCard />
            </div>
            <div className="h-[640px] lg:h-full overflow-hidden">
              <MarketCard />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'performance' && <PerformanceView />}

      {activeSubTab === 'projection' && (
        <div data-tour="profit-projection">
          <ProfitProjectionView />
        </div>
      )}

      {/* Trade Entry Modal */}
      <TradeEntryModal isOpen={showTradeModal} onClose={() => setShowTradeModal(false)} />

      {/* Market Briefing Modal */}
      <MarketBriefingModal isOpen={showBriefingModal} onClose={() => setShowBriefingModal(false)} />

      {/* First-time onboarding tour */}
      {showTour && (
        <TradingTour
          activeSubTab={activeSubTab}
          onNavigate={setActiveSubTab}
          onComplete={handleTourComplete}
        />
      )}
    </div>
  );
}
