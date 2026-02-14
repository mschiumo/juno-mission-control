'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import DailyReportsCard from "@/components/DailyReportsCard";
// import CalendarCard from "@/components/CalendarCard";
import HabitCard from "@/components/HabitCard";
import MarketCard from "@/components/MarketCard";
import MarketHoursBanner from "@/components/MarketHoursBanner";
import GapScannerCard from "@/components/GapScannerCard";
import ProjectsCard from "@/components/ProjectsCard";
import ActivityLogCard from "@/components/ActivityLogCard";
import GoalsCard from "@/components/GoalsCard";
import JunoWidget from "@/components/JunoWidget";
import LiveClock from "@/components/LiveClock";
import MotivationalBanner from "@/components/MotivationalBanner";
import { LayoutDashboard, Activity, Target, TrendingUp, Menu, X } from 'lucide-react';

type TabId = 'dashboard' | 'trading' | 'goals' | 'activity';

// Inner component that uses searchParams
function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Get tab from URL query param, default to 'dashboard'
  const getTabFromUrl = useCallback((): TabId => {
    const tab = searchParams.get('tab');
    if (tab === 'trading' || tab === 'goals' || tab === 'activity') return tab;
    return 'dashboard';
  }, [searchParams]);
  
  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Update URL when tab changes
  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams);
    if (tab === 'dashboard') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
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
                <JunoWidget />
                <LiveClock />
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
          /* Dashboard Grid */
          <div className="space-y-4">
            <MotivationalBanner compact variant="orange" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <DailyReportsCard />
              <HabitCard />
              <ProjectsCard />
            </div>
          </div>
        ) : activeTab === 'trading' ? (
          /* Trading View - Sidebar Layout */
          <div className="max-w-7xl mx-auto">
            {/* Two Column Layout: Sidebar (2/5) + Market (3/5) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              {/* Left Sidebar: Market Hours + Gap Scanner (wider) */}
              <div className="lg:col-span-2 space-y-4">
                <MarketHoursBanner compact />
                <GapScannerCard />
              </div>
              
              {/* Right Column: Market Card (spans 3 columns) */}
              <div className="lg:col-span-3">
                <MarketCard />
              </div>
            </div>
          </div>
        ) : activeTab === 'goals' ? (
          /* Goals View */
          <div className="max-w-6xl mx-auto">
            <GoalsCard />
          </div>
        ) : (
          /* Activity Log View */
          <div className="max-w-4xl mx-auto">
            <ActivityLogCard />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] mt-8 md:mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4">
          <p className="text-center text-xs md:text-sm text-[#8b949e]">
            Juno Mission Control © {new Date().getFullYear()}
          </p>
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
