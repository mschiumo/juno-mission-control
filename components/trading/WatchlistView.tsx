'use client';

import { useState, useEffect } from 'react';
import { 
  BookmarkX, 
  TrendingUp, 
  DollarSign, 
  Target, 
  Shield,
  Calendar,
  Layers,
  Award,
  BarChart3
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';

const STORAGE_KEY = 'juno:trade-watchlist';

export default function WatchlistView() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load watchlist from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    }
  }, []);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          const stored = e.newValue;
          if (stored) {
            setWatchlist(JSON.parse(stored));
          } else {
            setWatchlist([]);
          }
        } catch (error) {
          console.error('Error handling storage change:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleRemove = (id: string) => {
    const updated = watchlist.filter(item => item.id !== id);
    setWatchlist(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving watchlist:', error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="w-full">
        <div className="text-center py-12">
          <div className="animate-pulse">
            <div className="w-12 h-12 bg-[#262626] rounded-lg mx-auto mb-4" />
            <div className="h-6 bg-[#262626] rounded w-48 mx-auto mb-2" />
            <div className="h-4 bg-[#262626] rounded w-64 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F97316]/10 rounded-lg">
              <BookmarkX className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Trade Watchlist</h3>
              <p className="text-sm text-[#8b949e]">Saved valid trades from calculator</p>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="text-center py-12 border border-dashed border-[#30363d] rounded-xl">
          <BookmarkX className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Saved Trades</h3>
          <p className="text-[#8b949e] max-w-md mx-auto mb-4">
            When you calculate a valid trade (2:1 risk ratio or better), you can save it to your watchlist for later reference.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-[#8b949e]">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span>Go to Calculator tab to add trades</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-lg">
            <BarChart3 className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Trade Watchlist</h3>
            <p className="text-sm text-[#8b949e]">{watchlist.length} saved trade{watchlist.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Watchlist Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {watchlist.map((item) => (
          <div
            key={item.id}
            className="bg-[#0F0F0F] border border-[#262626] rounded-xl overflow-hidden hover:border-[#30363d] transition-colors"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-[#161b22]">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-[#F97316]/10 rounded-lg">
                  <span className="text-lg font-bold text-[#F97316]">{item.ticker}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(item.createdAt)}
                </div>
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="p-2 text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                title="Remove from watchlist"
              >
                <BookmarkX className="w-4 h-4" />
              </button>
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-4">
              {/* Price Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#161b22] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    Entry
                  </div>
                  <p className="text-base font-semibold text-white">
                    {formatCurrency(item.entryPrice)}
                  </p>
                </div>
                <div className="bg-[#161b22] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-red-400 mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    Stop
                  </div>
                  <p className="text-base font-semibold text-white">
                    {formatCurrency(item.stopPrice)}
                  </p>
                </div>
                <div className="bg-[#161b22] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-green-400 mb-1">
                    <Target className="w-3.5 h-3.5" />
                    Target
                  </div>
                  <p className="text-base font-semibold text-white">
                    {formatCurrency(item.targetPrice)}
                  </p>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="bg-[#161b22] rounded-lg p-2 min-w-0">
                  <div className="flex items-center gap-1 text-xs text-[#8b949e] mb-1">
                    <Award className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">R:R</span>
                  </div>
                  <p className="text-sm font-semibold text-green-400 truncate">
                    {item.riskRatio.toFixed(2)}:1
                  </p>
                </div>
                <div className="bg-[#161b22] rounded-lg p-2 min-w-0">
                  <div className="flex items-center gap-1 text-xs text-[#8b949e] mb-1">
                    <Shield className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">Stop</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">
                    {formatCurrency(item.stopSize)}
                  </p>
                </div>
                <div className="bg-[#161b22] rounded-lg p-2 min-w-0">
                  <div className="flex items-center gap-1 text-xs text-[#8b949e] mb-1">
                    <Layers className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">Shares</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">
                    {formatNumber(item.shareSize)}
                  </p>
                </div>
                <div className="bg-[#161b22] rounded-lg p-2 min-w-0">
                  <div className="flex items-center gap-1 text-xs text-[#8b949e] mb-1">
                    <DollarSign className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">Position</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">
                    {formatCurrency(item.positionValue)}
                  </p>
                </div>
              </div>

              {/* Reward Row */}
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-[#8b949e]">Expected Profit</span>
                  </div>
                  <span className="text-lg font-bold text-green-400">
                    {formatCurrency(item.potentialReward)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
