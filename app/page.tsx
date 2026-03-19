'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  TrendingUp,
  Calculator,
  Settings,
  Menu,
  X
} from 'lucide-react';
import MarketHoursBanner from '@/components/MarketHoursBanner';
import GapScannerCard from '@/components/GapScannerCard';
import MarketCard from '@/components/MarketCard';
import NewsScreenerCard from '@/components/NewsScreenerCard';
import TradeManagementView from '@/components/trading/TradeManagementView';
import ProfitProjectionView from '@/components/trading/ProfitProjectionView';

type TabId = 'dashboard' | 'market' | 'trade-management' | 'projection';

export default function TradingTerminal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Get tab from URL, default to 'dashboard'
  const getTabFromUrl = useCallback((): TabId => {
    const tab = searchParams.get('tab');
    if (tab === 'market' || tab === 'trade-management' || tab === 'projection') return tab;
    return 'dashboard';
  }, [searchParams]);
  
  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Update URL when tab changes
  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    setMobileMenuOpen(false);
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
    { id: 'market' as const, label: 'Market', icon: TrendingUp },
    { id: 'trade-management' as const, label: 'Trade Management', icon: Settings },
    { id: 'projection' as const, label: 'Profit Projection', icon: Calculator },
  ];

  const activeTabLabel = tabs.find(t => t.id === activeTab)?.label || 'Dashboard';
  const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon || LayoutDashboard;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#161b22]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff8c5a] flex items-center justify-center text-white font-bold text-lg md:text-xl shadow-lg">
                J
              </div>
              <div>
                <h1 className="text-lg md:text-2xl font-bold text-white">Juno Trading Terminal</h1>
                <p className="hidden sm:block text-xs md:text-sm text-[#8b949e]">Professional trading tools</p>
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

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-white"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Tab Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#ff6b35]/20 text-white'
                      : 'text-[#8b949e] hover:bg-[#262626] hover:text-white'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-[#ff6b35]' : ''}`} />
                  <span className="font-medium">{tab.label}</span>
                  {activeTab === tab.id && (
                    <div className="ml-auto w-2 h-2 bg-[#ff6b35] rounded-full" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="lg:col-span-2 space-y-4">
                <MarketHoursBanner />
                <GapScannerCard />
              </div>
              <div className="lg:col-span-3">
                <MarketCard />
              </div>
            </div>
            <NewsScreenerCard />
          </div>
        )}

        {activeTab === 'market' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="lg:col-span-2 space-y-4">
                <MarketHoursBanner />
                <GapScannerCard />
              </div>
              <div className="lg:col-span-3">
                <MarketCard />
              </div>
            </div>
            <NewsScreenerCard />
          </div>
        )}

        {activeTab === 'trade-management' && (
          <TradeManagementView />
        )}

        {activeTab === 'projection' && (
          <ProfitProjectionView />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-[#8b949e]">
            Juno Trading Terminal - Data provided by Finnhub & Polygon
          </p>
        </div>
      </footer>
    </div>
  );
}
