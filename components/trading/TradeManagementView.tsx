'use client';

import { useState } from 'react';
import { Calculator, ListTodo, BookOpen, Settings } from 'lucide-react';
import PositionCalculator from './PositionCalculator';

type TabId = 'calculator' | 'active' | 'journal' | 'settings';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'calculator', label: 'Calculator', icon: <Calculator className="w-4 h-4" /> },
  { id: 'active', label: 'Active Trades', icon: <ListTodo className="w-4 h-4" /> },
  { id: 'journal', label: 'Journal', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

export default function TradeManagementView() {
  const [activeTab, setActiveTab] = useState<TabId>('calculator');

  const renderContent = () => {
    switch (activeTab) {
      case 'calculator':
        return <PositionCalculator />;
      case 'active':
        return (
          <div className="text-center py-12">
            <ListTodo className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Active Trades</h3>
            <p className="text-[#8b949e]">No active trades. Add a trade to see it here.</p>
          </div>
        );
      case 'journal':
        return (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Trade Journal</h3>
            <p className="text-[#8b949e]">Trade journaling coming soon...</p>
          </div>
        );
      case 'settings':
        return (
          <div className="text-center py-12">
            <Settings className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Trade Settings</h3>
            <p className="text-[#8b949e]">Configure your trading preferences...</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Tab Navigation */}
      <div className="border-b border-[#30363d]">
        <div className="flex scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-[#F97316]'
                  : 'text-[#8b949e] hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {renderContent()}
      </div>
    </div>
  );
}
