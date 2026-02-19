'use client';

import { useState, useEffect } from 'react';
import { Plus, TrendingUp, TrendingDown, DollarSign, Target, Percent } from 'lucide-react';

interface DashboardStatsProps {
  onAddTrade: () => void;
}

export default function DashboardStats({ onAddTrade }: DashboardStatsProps) {
  const [stats, setStats] = useState({
    totalTrades: 0,
    winRate: 0,
    totalPnl: 0,
    avgWinner: 0,
    avgLoser: 0,
  });

  return (
    <div className="space-y-6">
      {/* Quick Add Button */}
      <div className="flex justify-end">
        <button
          onClick={onAddTrade}
          className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Trade
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Trades"
          value={stats.totalTrades.toString()}
          icon={Target}
          color="text-blue-400"
        />
        <StatCard
          title="Win Rate"
          value={`${stats.winRate}%`}
          icon={Percent}
          color="text-green-400"
        />
        <StatCard
          title="Total P&L"
          value={`$${stats.totalPnl.toFixed(2)}`}
          icon={DollarSign}
          color={stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          title="Avg Winner"
          value={`$${stats.avgWinner.toFixed(2)}`}
          icon={TrendingUp}
          color="text-green-400"
        />
      </div>

      {/* Coming Soon Notice */}
      <div className="p-6 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <TrendingUp className="w-12 h-12 text-[#F97316] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Trading Dashboard</h3>
        <p className="text-[#8b949e]">
          Full dashboard with charts and analytics coming soon...
        </p>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { 
  title: string; 
  value: string; 
  icon: any; 
  color: string;
}) {
  return (
    <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-xl">
      <div className="flex items-center gap-3 mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-sm text-[#8b949e]">{title}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
