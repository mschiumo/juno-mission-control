'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import CalendarCard from "@/components/CalendarCard";
import HabitCard from "@/components/HabitCard";
import GapScannerCard from "@/components/GapScannerCard";
import NewsScreenerCard from "@/components/NewsScreenerCard";
import GoalsCard from "@/components/GoalsCard";
import LiveClock from "@/components/LiveClock";
import MotivationalBanner from "@/components/MotivationalBanner";
import EveningCheckinReminder from "@/components/EveningCheckinReminder";
import TradingView from "@/components/TradingView";
import { LayoutDashboard, Target, TrendingUp, Menu, X, LogOut } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

type TabId = 'dashboard' | 'trading' | 'goals';

const OWNER_EMAIL = 'mschiumo18@gmail.com';

// Inner component that uses searchParams
function DashboardContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isOwner = session?.user?.email === OWNER_EMAIL;

  // Get tab from URL query param; non-owners land on trading, not dashboard
  const getTabFromUrl = useCallback((): TabId => {
    const tab = searchParams.get('tab');
    if (tab === 'trading') return 'trading';
    if (tab === 'goals' && isOwner) return 'goals';
    if (isOwner) return 'dashboard';
    return 'trading';
  }, [searchParams, isOwner]);

  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect non-owners away from owner-only tabs (dashboard, goals)
  useEffect(() => {
    if (!isOwner && (activeTab === 'dashboard' || activeTab === 'goals')) {
      setActiveTab('trading');
    }
  }, [isOwner, activeTab]);
  const [habitsHeight, setHabitsHeight] = useState<number>(980);
  const habitsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = habitsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      if (h > 0) setHabitsHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab]);

  // Update URL when tab changes (using replace to avoid bloating history)
  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams);
    if (tab === 'dashboard') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const tabs = [
    ...(isOwner ? [{ id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard }] : []),
    // Trading tab hidden from nav — Trading view is the default landing for all users
    ...(isOwner ? [{ id: 'goals' as const, label: 'Goals', icon: Target }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#161b22]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#0d1117] border border-[#30363d] flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 48 48" fill="none" className="w-6 h-6 md:w-7 md:h-7">
                  <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                  <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                  <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                  <circle cx="24" cy="24" r="2.5" fill="white"/>
                </svg>
              </div>
              <div>
                <h1 className="text-lg md:text-2xl font-bold text-white">Confluence Trading</h1>
                <p className="hidden sm:block text-xs md:text-sm text-[#8b949e]">Your disciplined trading command center</p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              {/* Desktop Tab Navigation */}
              <div className="hidden md:flex items-center gap-1 bg-[#0d1117] rounded-lg p-1 border border-[#30363d]">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#ff6b35] text-white'
                        : 'text-[#8b949e] hover:text-white hover:bg-[#30363d]'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Desktop Widgets */}
              <div className="hidden md:flex items-center gap-4">
                <LiveClock />
                <div className="flex items-center gap-2 border-l border-[#30363d] pl-4">
                  {session?.user?.name && (
                    <span className="text-xs text-[#8b949e]">{session.user.name}</span>
                  )}
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    title="Sign out"
                    className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e] hover:text-white"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 hover:bg-[#30363d] rounded-lg"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-white" />
                ) : (
                  <Menu className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pt-4 border-t border-[#30363d]">
              <div className="flex flex-col gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#ff6b35] text-white'
                        : 'text-[#8b949e] hover:text-white hover:bg-[#30363d]'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-[#30363d] flex items-center justify-between">
                <LiveClock />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        {activeTab === 'dashboard' ? (
          /* Dashboard Grid - Single column for better spacing */
          <div className="space-y-4">
            <MotivationalBanner compact variant="orange" />
            <EveningCheckinReminder />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 xl:items-start">
              <div ref={habitsRef}>
                <HabitCard />
              </div>
              <div className="grid gap-4 overflow-hidden" style={{ gridTemplateRows: '360px 1fr', height: habitsHeight }}>
                <CalendarCard />
                <NewsScreenerCard />
              </div>
            </div>
          </div>
        ) : activeTab === 'trading' ? (
          /* Trading View - New Trading Journal */
          <div className="max-w-[1600px] mx-auto">
            <TradingView />
          </div>
        ) : activeTab === 'goals' ? (
          /* Goals View */
          <div className="max-w-[1600px] mx-auto">
            <Suspense fallback={<div className="p-8 text-center text-[#8b949e]">Loading goals...</div>}>
              <GoalsCard />
            </Suspense>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] mt-8 md:mt-12">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-center md:text-left text-xs md:text-sm text-[#8b949e]">
              Confluence Trading © {new Date().getFullYear()}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/mschiumo/juno-mission-control"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8b949e] hover:text-[#ff6b35] transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Main component with Suspense boundary
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1117] flex items-center justify-center"><div className="text-[#8b949e]">Loading...</div></div>}>
      <DashboardContent />
    </Suspense>
  );
}
