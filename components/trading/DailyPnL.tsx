'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import type { ClosedPosition } from '@/lib/db/closed-positions';

const DEFAULT_USER_ID = 'default';

interface DailyPnLStats {
  totalPnL: number;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  bestTrade: ClosedPosition | null;
  worstTrade: ClosedPosition | null;
}

export default function DailyPnL() {
  const [stats, setStats] = useState<DailyPnLStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDailyPnL();
  }, []);

  const fetchDailyPnL = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/closed-positions?userId=${DEFAULT_USER_ID}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch closed positions');
      }
      
      const result = await response.json();
      const closedTrades: ClosedPosition[] = result.data || [];
      
      // Filter for today's trades (in EST)
      const today = getESTStartOfDay(new Date());
      const todayTrades = closedTrades.filter(trade => {
        const tradeDate = new Date(trade.closedAt || trade.createdAt);
        return getESTStartOfDay(tradeDate).getTime() === today.getTime();
      });
      
      // Calculate stats
      const totalPnL = todayTrades.reduce((sum, t) => sum + (t.netPnL || 0), 0);
      const winningTrades = todayTrades.filter(t => (t.netPnL || 0) > 0);
      const losingTrades = todayTrades.filter(t => (t.netPnL || 0) < 0);
      
      // Find best and worst trades
      const sortedByPnL = [...todayTrades].sort((a, b) => (b.netPnL || 0) - (a.netPnL || 0));
      const bestTrade = sortedByPnL[0] || null;
      const worstTrade = sortedByPnL[sortedByPnL.length - 1] || null;
      
      setStats({
        totalPnL,
        tradeCount: todayTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        bestTrade,
        worstTrade,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily P&L');
    } finally {
      setLoading(false);
    }
  };

  const getESTStartOfDay = (date: Date): Date => {
    const est = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return new Date(est.getFullYear(), est.getMonth(), est.getDate());
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });

  if (loading) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#F97316]"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
        <div className="text-center text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!stats || stats.tradeCount === 0) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
          <Calendar className="w-4 h-4 text-[#F97316]" />
          <span className="text-sm font-semibold text-white">Daily P&L</span>
          <span className="text-xs text-[#8b949e]">{today}</span>
        </div>
        <div className="p-6 text-center">
          <p className="text-[#8b949e] text-sm">No closed trades today</p>
          <p className="text-xs text-[#6e7681] mt-1">Trades closed today will appear here</p>
        </div>
      </div>
    );
  }

  const isProfitable = stats.totalPnL >= 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-[#F97316]" />
          <span className="text-sm font-semibold text-white">Daily P&L</span>
          <span className="text-xs text-[#8b949e]">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8b949e]">{stats.tradeCount} trade{stats.tradeCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Total PnL */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isProfitable ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {isProfitable ? (
                <TrendingUp className="w-5 h-5 text-green-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <p className="text-xs text-[#8b949e]">Total P&L</p>
              <p className={`text-2xl font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                {isProfitable ? '+' : ''}{formatCurrency(stats.totalPnL)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8b949e]">Win Rate</p>
            <p className="text-lg font-semibold text-white">
              {stats.tradeCount > 0 
                ? Math.round((stats.winningTrades / stats.tradeCount) * 100) 
                : 0}%
            </p>
          </div>
        </div>

        {/* Trade Breakdown */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3">
            <p className="text-xs text-green-400 mb-1">Winners</p>
            <p className="text-lg font-semibold text-white">{stats.winningTrades}</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
            <p className="text-xs text-red-400 mb-1">Losers</p>
            <p className="text-lg font-semibold text-white">{stats.losingTrades}</p>
          </div>
        </div>

        {/* Best/Worst Trades */}
        {(stats.bestTrade || stats.worstTrade) && (
          <div className="space-y-2 pt-2 border-t border-[#30363d]">
            {stats.bestTrade && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">Best Trade</span>
                <span className="text-sm font-medium text-green-400">
                  {stats.bestTrade.symbol} +{formatCurrency(stats.bestTrade.netPnL || 0)}
                </span>
              </div>
            )}
            {stats.worstTrade && stats.worstTrade !== stats.bestTrade && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">Worst Trade</span>
                <span className="text-sm font-medium text-red-400">
                  {stats.worstTrade.symbol} {formatCurrency(stats.worstTrade.netPnL || 0)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
