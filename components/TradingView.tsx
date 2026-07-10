'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { isOwnerEmail } from '@/lib/owner';
import {
  LayoutDashboard,
  TrendingUp,
  Calculator,
  Settings,
  BarChart3,
  Target,
  BookOpen,
  Newspaper,
  Sparkles,
  Menu,
  X,
  HelpCircle,
} from 'lucide-react';
import MarketEventsCard from '@/components/MarketEventsCard';
import GapScannerCard from '@/components/GapScannerCard';
import MarketCard from '@/components/MarketCard';
import NewsScreenerCard from '@/components/NewsScreenerCard';
import MarketBriefingModal from '@/components/MarketBriefingModal';
import TradingRulesModal from '@/components/TradingRulesModal';
import TradeEntryModal from '@/components/trading/TradeEntryModal';
import CombinedCalendarView from '@/components/trading/CombinedCalendarView';
import ProfitProjectionView from '@/components/trading/ProfitProjectionView';
import TradeManagementView from '@/components/trading/TradeManagementView';
import PerformanceView from '@/components/trading/PerformanceView';
import GoalsView from '@/components/trading/GoalsView';
import TradingTour from '@/components/trading/TradingTour';
import AgentsView from '@/components/confluence/ConfluenceView';

type TradingSubTab = 'overview' | 'market' | 'market-news' | 'performance' | 'goals' | 'projection' | 'trade-management' | 'agents';

export default function TradingView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  // The Agents sub-tab is owner-only (agentic execution is billing/safety-sensitive).
  const isOwner = isOwnerEmail(session?.user?.email);

  // Get subtab from URL or default to 'overview'
  const getSubTabFromUrl = useCallback((): TradingSubTab => {
    const subtab = searchParams.get('subtab');
    if (subtab === 'agents') return isOwner ? 'agents' : 'overview';
    if (subtab === 'market' || subtab === 'market-news' || subtab === 'performance' || subtab === 'goals' || subtab === 'projection' || subtab === 'trade-management') {
      return subtab;
    }
    return 'overview';
  }, [searchParams, isOwner]);

  const [activeSubTab, setActiveSubTabState] = useState<TradingSubTab>(getSubTabFromUrl);
  const [importKey, setImportKey] = useState(0);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  // Pending agent proposals awaiting review — drives the glowing badge on the
  // Agents tab so a nightly run's output doesn't sit unnoticed. Owner-only
  // (matches the tab itself); refreshed every 5 minutes.
  const [pendingProposals, setPendingProposals] = useState(0);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    const check = () => {
      fetch('/api/confluence/proposals')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d.success || !Array.isArray(d.proposals)) return;
          setPendingProposals(d.proposals.filter((p: { status: string }) => p.status === 'pending').length);
        })
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 5 * 60 * 1000);
    // Instant sync: the Agents view broadcasts the pending count whenever
    // proposals change, so approve/reject clears the badge immediately.
    const onCount = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') setPendingProposals(detail);
    };
    window.addEventListener('confluence:pending-count', onCount);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('confluence:pending-count', onCount);
    };
  }, [isOwner]);
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

  // Session loads async; if a non-owner is on the Agents sub-tab, bounce them.
  useEffect(() => {
    if (!isOwner && activeSubTab === 'agents') {
      setActiveSubTabState('overview');
    }
  }, [isOwner, activeSubTab]);

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
    { id: 'market-news' as const, label: 'Market News', icon: Newspaper },
    { id: 'trade-management' as const, label: 'Trade Management', icon: Settings },
    { id: 'goals' as const, label: 'Goals', icon: Target },
    { id: 'performance' as const, label: 'Performance', icon: BarChart3 },
    { id: 'projection' as const, label: 'Profit Projection', icon: Calculator },
    // Agents (agentic swing-trading) is owner-only.
    ...(isOwner ? [{ id: 'agents' as const, label: 'Agents', icon: Sparkles }] : []),
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
                {tab.id === 'agents' && pendingProposals > 0 && (
                  <span
                    className="animate-pulse px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                    style={{
                      background: 'var(--warning)',
                      color: '#1a1206',
                      boxShadow: '0 0 8px var(--warning)',
                    }}
                    title={`${pendingProposals} proposal${pendingProposals === 1 ? '' : 's'} awaiting review`}
                  >
                    {pendingProposals}
                  </span>
                )}
              </button>
            );
          })}

          {/* Permanent tour relaunch — the onboarding walkthrough, available anytime */}
          <button
            onClick={() => setShowTour(true)}
            className="ml-auto shrink-0 self-center mb-1 p-1.5 rounded-full transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Replay the guided tour of the Trading tab"
            aria-label="Launch the Trading tab tutorial"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
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
                    {tab.id === 'agents' && pendingProposals > 0 && (
                      <span
                        className="animate-pulse px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                        style={{ background: 'var(--warning)', color: '#1a1206', boxShadow: '0 0 8px var(--warning)' }}
                      >
                        {pendingProposals}
                      </span>
                    )}
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                    )}
                  </button>
                );
              })}

              {/* Permanent tour relaunch (mobile) */}
              <button
                onClick={() => {
                  setMobileDropdownOpen(false);
                  setShowTour(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Take the Tour</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {activeSubTab === 'overview' && <CombinedCalendarView onImportSuccess={() => setImportKey((k) => k + 1)} />}

      {activeSubTab === 'trade-management' && <TradeManagementView />}

      {activeSubTab === 'market' && (
        <div className="space-y-6">
          <MarketEventsCard onOpenBriefing={() => setShowBriefingModal(true)} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:h-[640px]">
            <div data-tour="gap-scanner" className="lg:col-span-2 h-[640px] lg:h-full overflow-hidden">
              <GapScannerCard />
            </div>
            <div className="lg:col-span-1 h-[640px] lg:h-full overflow-hidden">
              <MarketCard />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'market-news' && <NewsScreenerCard />}

      {activeSubTab === 'performance' && <PerformanceView refreshKey={importKey} />}

      {activeSubTab === 'goals' && <GoalsView refreshKey={importKey} />}

      {activeSubTab === 'agents' && isOwner && <AgentsView />}

      {activeSubTab === 'projection' && (
        <div data-tour="profit-projection">
          <ProfitProjectionView />
        </div>
      )}

      {/* Trade Entry Modal */}
      <TradeEntryModal isOpen={showTradeModal} onClose={() => setShowTradeModal(false)} />

      {/* Market Briefing Modal */}
      <MarketBriefingModal isOpen={showBriefingModal} onClose={() => setShowBriefingModal(false)} />

      {/* Pre-market trading rules acknowledgement (fires at 9:15 AM ET) */}
      <TradingRulesModal />

      {/* First-time onboarding tour */}
      {showTour && (
        <TradingTour
          // The onboarding tour only covers the standard sub-tabs; 'agents' (owner-only)
          // isn't part of it, so present it as 'overview' to the tour's narrower type.
          activeSubTab={activeSubTab === 'agents' ? 'overview' : activeSubTab}
          onNavigate={setActiveSubTab}
          onComplete={handleTourComplete}
        />
      )}
    </div>
  );
}
