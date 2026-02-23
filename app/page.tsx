'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import DailyReportsCard from "@/components/DailyReportsCard";
// import CalendarCard from "@/components/CalendarCard";
import HabitCard from "@/components/HabitCard";
import MarketCard from "@/components/MarketCard";
import MarketHoursBanner from "@/components/MarketHoursBanner";
import GapScannerCard from "@/components/GapScannerCard";
import NewsScreenerCard from "@/components/NewsScreenerCard";
import ProjectsCard from "@/components/ProjectsCard";
import ActivityLogCard from "@/components/ActivityLogCard";
import DailyCronsCard from "@/components/DailyCronsCard";
import GoalsCard from "@/components/GoalsCard";
import JunoWidget from "@/components/JunoWidget";
import LiveClock from "@/components/LiveClock";
import NotificationsBell from "@/components/NotificationsBell";
import MotivationalBanner from "@/components/MotivationalBanner";
import DocumentationCard from "@/components/DocumentationCard";
import EveningCheckinReminder from "@/components/EveningCheckinReminder";
import TradingView from "@/components/TradingView";
import UserMenu from "@/components/UserMenu";
import { LayoutDashboard, Activity, Target, TrendingUp, Menu, X, CheckSquare } from 'lucide-react';

type TabId = 'dashboard' | 'tasks' | 'trading' | 'goals' | 'activity';

// Inner component that uses searchParams
function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Get tab from URL query param, default to 'dashboard'
  const getTabFromUrl = useCallback((): TabId => {
    const tab = searchParams.get('tab');
    if (tab === 'tasks' || tab === 'trading' || tab === 'goals' || tab === 'activity') return tab;
    return 'dashboard';
  }, [searchParams]);
  
  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks' as const, label: 'Tasks', icon: CheckSquare },
    { id: 'trading' as const, label: 'Trading', icon: TrendingUp },
    { id: 'goals' as const, label: 'Goals', icon: Target },
    { id: 'activity' as const, label: 'Activity', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#161b22]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8c5a] flex items-center justify-center text-white font-bold text-lg md:text-xl shadow-lg">
                J
              </div>
              <div>
                <h1 className="text-lg md:text-2xl font-bold text-white">Juno Mission Control</h1>
                <p className="hidden sm:block text-xs md:text-sm text-[#8b949e]">Your personal command center</p>
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
                <NotificationsBell />
                <JunoWidget />
                <LiveClock />
                <UserMenu />
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
                <NotificationsBell />
                <JunoWidget />
                <LiveClock />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        {activeTab === 'dashboard' ? (
          /* Dashboard Grid - Single column for better spacing */
          <div className="space-y-4">
            <MotivationalBanner compact variant="orange" />
            <EveningCheckinReminder />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
              <HabitCard />
              <DailyReportsCard />
            </div>
          </div>
        ) : activeTab === 'tasks' ? (
          /* Tasks View - Projects and Task Management */
          <div className="max-w-6xl mx-auto">
            <ProjectsCard />
          </div>
        ) : activeTab === 'trading' ? (
          /* Trading View - New Trading Journal */
          <div className="max-w-7xl mx-auto">
            <TradingView />
          </div>
        ) : activeTab === 'goals' ? (
          /* Goals View */
          <div className="max-w-6xl mx-auto">
            <Suspense fallback={<div className="p-8 text-center text-[#8b949e]">Loading goals...</div>}>
              <GoalsCard />
            </Suspense>
          </div>
        ) : (
          /* Activity Log View */
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              <ActivityLogCard />
              <DailyCronsCard />
              <DocumentationCard className="lg:col-span-2" />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] mt-8 md:mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-center md:text-left text-xs md:text-sm text-[#8b949e]">
              Juno Mission Control © {new Date().getFullYear()}
            </p>
            <div className="flex items-center gap-4">
              <a 
                href="https://github.com/mschiumo/juno-mission-control/blob/main/docs/DOCUMENT_LIBRARY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8b949e] hover:text-[#ff6b35] transition-colors"
              >
                📚 Docs
              </a>
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
