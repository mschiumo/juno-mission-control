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
  BarChart3,
  Edit3
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import EditWatchlistItemModal from './EditWatchlistItemModal';

const STORAGE_KEY = 'juno:trade-watchlist';

export default function WatchlistView() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // Listen for same-tab updates from PositionCalculator
  useEffect(() => {
    const handleWatchlistUpdate = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setWatchlist(JSON.parse(stored));
        } else {
          setWatchlist([]);
        }
      } catch (error) {
        console.error('Error handling watchlist update:', error);
      }
    };

    window.addEventListener('juno:watchlist-updated', handleWatchlistUpdate);
    return () => window.removeEventListener('juno:watchlist-updated', handleWatchlistUpdate);
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

  const handleEdit = (item: WatchlistItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = (updatedItem: WatchlistItem) => {
    const updated = watchlist.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
    setWatchlist(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Dispatch event to refresh other components
      window.dispatchEvent(new Event('juno:watchlist-updated'));
    } catch (error) {
      console.error('Error saving watchlist:', error);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    handleRemove(id);
    setIsModalOpen(false);
    setEditingItem(null);
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
            onClick={() => handleEdit(item)}
            className="bg-[#0F0F0F] border border-[#262626] rounded-xl overflow-hidden hover:border-[#F97316]/50 hover:bg-[#161b22] transition-all cursor-pointer group"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-[#161b22] group-hover:bg-[#1c2128] transition-colors">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-[#F97316]/10 rounded-lg">
                  <span className="text-lg font-bold text-[#F97316]">{item.ticker}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(item.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(item);
                  }}
                  className="p-2 text-[#8b949e] hover:text-[#F97316] hover:bg-[#F97316]/10 rounded-lg transition-colors"
                  title="Edit trade"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item.id);
                  }}
                  className="p-2 text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title="Remove from watchlist"
                >
                  <BookmarkX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Card Body - Stack Layout */}
            <div className="p-4 space-y-2">
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

              {/* Stats Stack - Full width rows */}
              <div className="space-y-1.5">
                {/* R:R */}
                <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                    <Award className="w-4 h-4" />
                    <span>R:R</span>
                  </div>
                  <span className="text-sm font-semibold text-green-400">
                    {item.riskRatio.toFixed(2)}:1
                  </span>
                </div>

                {/* Stop Size */}
                <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                    <Shield className="w-4 h-4" />
                    <span>Stop Size</span>
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(item.stopSize)}
                  </span>
                </div>

                {/* Shares */}
                <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                    <Layers className="w-4 h-4" />
                    <span>Shares</span>
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {formatNumber(item.shareSize)}
                  </span>
                </div>

                {/* Position Value */}
                <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                    <DollarSign className="w-4 h-4" />
                    <span>Position</span>
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(item.positionValue)}
                  </span>
                </div>

                {/* Expected Profit */}
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span>Expected</span>
                  </div>
                  <span className="text-sm font-bold text-green-400">
                    {formatCurrency(item.potentialReward)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      <EditWatchlistItemModal
        item={editingItem}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
