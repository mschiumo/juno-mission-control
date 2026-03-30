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
import LandingPage from "@/components/landing/LandingPage";
import Link from 'next/link';
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

  const tabs = isOwner
    ? [
        { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'trading' as const, label: 'Trading', icon: TrendingUp },
        { id: 'goals' as const, label: 'Goals', icon: Target },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-[#F97316] to-[#ea580c] flex items-center justify-center shadow-lg shadow-[#F97316]/20">
                <svg viewBox="0 0 48 48" fill="none" className="w-5 h-5 md:w-6 md:h-6">
                  <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                  <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                  <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                  <circle cx="24" cy="24" r="2.5" fill="white"/>
                </svg>
              </div>
              <div>
                <h1 className="text-base md:text-xl font-semibold tracking-tight text-white">Confluence</h1>
                <p className="hidden sm:block text-[11px] text-[#71717a]">Trading Command Center</p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              {/* Desktop Tab Navigation */}
              {tabs.length > 0 && <div className="hidden md:flex items-center gap-0.5 bg-white/[0.03] rounded-xl p-1 border border-white/[0.06]">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-[#F97316] text-white shadow-md shadow-[#F97316]/25'
                        : 'text-[#71717a] hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>}

              {/* Desktop Widgets */}
              <div className="hidden md:flex items-center gap-3">
                <LiveClock />
                <div className="flex items-center gap-2 border-l border-white/[0.06] pl-3">
                  <Link
                    href="/profile"
                    title="Profile & Settings"
                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F97316] to-[#ea580c] flex items-center justify-center text-white text-sm font-semibold hover:shadow-md hover:shadow-[#F97316]/25 transition-all duration-200"
                  >
                    {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    title="Sign out"
                    className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-all duration-200 text-[#71717a] hover:text-white"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Menu Button */}
              {isOwner && <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-white" />
                ) : (
                  <Menu className="w-5 h-5 text-white" />
                )}
              </button>}
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t border-white/[0.06]">
              <div className="flex flex-col gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-[#F97316] text-white shadow-lg shadow-[#F97316]/20'
                        : 'text-[#71717a] hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                <LiveClock />
                <div className="flex items-center gap-2">
                  <Link
                    href="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F97316] to-[#ea580c] flex items-center justify-center text-white text-sm font-semibold hover:shadow-md hover:shadow-[#F97316]/25 transition-all duration-200"
                  >
                    {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    title="Sign out"
                    className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-all duration-200 text-[#71717a] hover:text-white"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8">
        {activeTab === 'dashboard' ? (
          /* Dashboard Grid */
          <div className="space-y-5 animate-fade-up">
            <MotivationalBanner compact variant="orange" />
            <EveningCheckinReminder />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 md:gap-6 xl:items-start">
              <div ref={habitsRef}>
                <HabitCard />
              </div>
              <div className="grid gap-5 overflow-hidden" style={{ gridTemplateRows: '360px 1fr', height: habitsHeight }}>
                <CalendarCard />
                <NewsScreenerCard />
              </div>
            </div>
          </div>
        ) : activeTab === 'trading' ? (
          /* Trading View */
          <div className="max-w-[1600px] mx-auto">
            <TradingView />
          </div>
        ) : activeTab === 'goals' ? (
          /* Goals View */
          <div className="max-w-[1600px] mx-auto">
            <Suspense fallback={<div className="p-8 text-center text-[#71717a]">Loading goals...</div>}>
              <GoalsCard />
            </Suspense>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] mt-8 md:mt-12">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-center md:text-left text-xs text-[#52525b]">
              Confluence Trading © {new Date().getFullYear()}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/mschiumo/juno-mission-control"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#52525b] hover:text-[#F97316] transition-colors"
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

// Session-aware router — landing for guests, dashboard for auth'd users
function HomeRouter() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-[#71717a]">Loading…</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LandingPage />;
  }

  return <DashboardContent />;
}

// Main component with Suspense boundary (required for useSearchParams inside DashboardContent)
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b] flex items-center justify-center"><div className="text-[#71717a]">Loading…</div></div>}>
      <HomeRouter />
    </Suspense>
  );
}
