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
    <div className="min-h-screen text-[var(--text-primary)]" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(5,7,9,0.88)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 md:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo mark */}
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #cc4e00 100%)', boxShadow: '0 2px 12px rgba(255,107,0,0.3)' }}>
                <svg viewBox="0 0 48 48" fill="none" className="w-4.5 h-4.5 md:w-5 md:h-5">
                  <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  <circle cx="24" cy="24" r="2.5" fill="white"/>
                </svg>
              </div>
              <div>
                <h1 className="text-sm md:text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Confluence</h1>
                <p className="hidden sm:block text-[10px] font-medium" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Trading Terminal</p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              {/* Desktop Tab Navigation — underline style */}
              {tabs.length > 0 && (
                <nav className="hidden md:flex items-end gap-0 h-full" style={{ borderBottom: '1px solid var(--border-subtle)', marginBottom: '-1px' }}>
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 transition-all duration-200 text-sm font-medium border-b-2 ${
                        activeTab === tab.id
                          ? 'border-[#FF6B00] text-[#FF8C38]'
                          : 'border-transparent hover:border-white/20'
                      }`}
                      style={{ color: activeTab === tab.id ? 'var(--accent-light)' : 'var(--text-secondary)', marginBottom: '-1px' }}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              )}

              {/* Desktop Widgets */}
              <div className="hidden md:flex items-center gap-2">
                <LiveClock />
                <div className="flex items-center gap-1" style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '10px' }}>
                  <Link
                    href="/profile"
                    title="Profile & Settings"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold transition-all duration-200"
                    style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)', boxShadow: '0 1px 6px rgba(255,107,0,0.25)' }}
                  >
                    {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    title="Sign out"
                    className="p-1.5 rounded-lg transition-all duration-200"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)', e.currentTarget.style.background = 'var(--border-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)', e.currentTarget.style.background = 'transparent')}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Mobile Menu Button */}
              {isOwner && <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>}
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex flex-col gap-0.5 pb-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left"
                    style={{
                      background: activeTab === tab.id ? 'var(--accent-dim)' : 'transparent',
                      color: activeTab === tab.id ? 'var(--accent-light)' : 'var(--text-secondary)',
                    }}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
              <div className="pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <LiveClock />
                <div className="flex items-center gap-1">
                  <Link
                    href="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)' }}
                  >
                    {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    title="Sign out"
                    className="p-1.5 rounded-lg transition-all duration-200"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-7">
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
            <Suspense fallback={<div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading goals...</div>}>
              <GoalsCard />
            </Suspense>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="mt-10 md:mt-14" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-center md:text-left text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              Confluence Trading © {new Date().getFullYear()}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/mschiumo/juno-mission-control"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
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
