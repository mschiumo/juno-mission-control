'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  Calculator,
  Settings,
  BarChart3,
  BookOpen,
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
    { id: 'overview' as const, label: 'Journal', icon: BookOpen },
    { id: 'market' as const, label: 'Market', icon: TrendingUp },
    { id: 'trade-management' as const, label: 'Trade Management', icon: Settings },
    { id: 'performance' as const, label: 'Performance', icon: BarChart3 },
    { id: 'projection' as const, label: 'Profit Projection', icon: Calculator },
  ];

  const activeTabLabel = subTabs.find((t) => t.id === activeSubTab)?.label || 'Journal';
  const ActiveIcon = subTabs.find((t) => t.id === activeSubTab)?.icon || BookOpen;

  return (
    <div className="space-y-5">
      {/* Sub-Navigation — Desktop: underline tabs, Mobile: dropdown */}
      <div data-tour="trading-nav">
        {/* Desktop */}
        <div className="hidden md:flex tab-underline-nav">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`tab-underline flex items-center gap-2 ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile - Dropdown */}
        <div className="md:hidden">
          <button
            onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl transition-all"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            <div className="flex items-center gap-2">
              <ActiveIcon className="w-4 h-4" style={{ color: 'var(--accent)' } as React.CSSProperties} />
              <span className="text-sm font-medium">{activeTabLabel}</span>
            </div>
            {mobileDropdownOpen ? (
              <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            ) : (
              <Menu className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            )}
          </button>

          {mobileDropdownOpen && (
            <div className="mt-1 rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
              {subTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{
                      background: isActive ? 'var(--accent-dim)' : 'transparent',
                      color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ color: isActive ? 'var(--accent)' : 'inherit' } as React.CSSProperties} />
                    <span className="text-sm font-medium">{tab.label}</span>
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
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
