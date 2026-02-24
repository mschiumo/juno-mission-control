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
  Edit3,
  Play,
  Activity,
  CheckCircle,
  FileText,
  ArrowLeft,
  X
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import type { ActiveTrade, ActiveTradeWithPnL } from '@/types/active-trade';
import EditWatchlistItemModal from './EditWatchlistItemModal';
import EnterPositionModal from './EnterPositionModal';

const WATCHLIST_KEY = 'juno:trade-watchlist';
const ACTIVE_TRADES_KEY = 'juno:active-trades';

export default function WatchlistView() {
  // Watchlist (Potential Trades) state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [enteringItem, setEnteringItem] = useState<WatchlistItem | null>(null);
  const [isEnterModalOpen, setIsEnterModalOpen] = useState(false);

  // Active Trades state
  const [activeTrades, setActiveTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === WATCHLIST_KEY || e.key === ACTIVE_TRADES_KEY) {
        loadData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for same-tab updates
  useEffect(() => {
    const handleUpdate = () => loadData();

    window.addEventListener('juno:watchlist-updated', handleUpdate);
    window.addEventListener('juno:active-trades-updated', handleUpdate);
    return () => {
      window.removeEventListener('juno:watchlist-updated', handleUpdate);
      window.removeEventListener('juno:active-trades-updated', handleUpdate);
    };
  }, []);

  const loadData = () => {
    // Load watchlist
    try {
      const storedWatchlist = localStorage.getItem(WATCHLIST_KEY);
      if (storedWatchlist) {
        setWatchlist(JSON.parse(storedWatchlist));
      } else {
        setWatchlist([]);
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
      setWatchlist([]);
    }

    // Load active trades
    try {
      const storedActive = localStorage.getItem(ACTIVE_TRADES_KEY);
      if (storedActive) {
        setActiveTrades(JSON.parse(storedActive));
      } else {
        setActiveTrades([]);
      }
    } catch (error) {
      console.error('Error loading active trades:', error);
      setActiveTrades([]);
    }
  };

  // ===== WATCHLIST (Potential Trades) Actions =====
  const handleRemoveFromWatchlist = (id: string) => {
    const updated = watchlist.filter(item => item.id !== id);
    setWatchlist(updated);
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('juno:watchlist-updated'));
    } catch (error) {
      console.error('Error saving watchlist:', error);
    }
  };

  const handleEdit = (item: WatchlistItem) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = (updatedItem: WatchlistItem) => {
    const updated = watchlist.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
    setWatchlist(updated);
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('juno:watchlist-updated'));
    } catch (error) {
      console.error('Error saving watchlist:', error);
    }
    setIsEditModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    handleRemoveFromWatchlist(id);
    setIsEditModalOpen(false);
    setEditingItem(null);
  };

  // ===== MOVE: Potential → Active =====
  const handleStartTrade = (item: WatchlistItem) => {
    setEnteringItem(item);
    setIsEnterModalOpen(true);
  };

  const handleCloseEnterModal = () => {
    setIsEnterModalOpen(false);
    setEnteringItem(null);
    setError(null);
  };

  const handleConfirmEnterPosition = (activeTrade: ActiveTrade) => {
    // Check for duplicate in active trades
    const isDuplicateInActive = activeTrades.some(
      t => t.ticker.toUpperCase() === activeTrade.ticker.toUpperCase()
    );

    if (isDuplicateInActive) {
      setError(`${activeTrade.ticker} is already an active position`);
      return; // Don't proceed
    }

    // Clear any previous error
    setError(null);
    // 1. Add to active trades
    const updatedActive = [...activeTrades, activeTrade];
    try {
      localStorage.setItem(ACTIVE_TRADES_KEY, JSON.stringify(updatedActive));
      setActiveTrades(updatedActive);
    } catch (error) {
      console.error('Error saving active trade:', error);
    }

    // 2. Remove from potential trades (watchlist) using functional state update
    // to ensure we're always working with the latest state
    const watchlistId = activeTrade.id.replace('active-', '');
    setWatchlist(prevWatchlist => {
      const updatedPotential = prevWatchlist.filter(w => w.id !== watchlistId);
      try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updatedPotential));
      } catch (error) {
        console.error('Error saving watchlist:', error);
      }
      return updatedPotential;
    });

    // 3. Dispatch events to refresh both sections
    window.dispatchEvent(new CustomEvent('juno:active-trades-updated'));
    window.dispatchEvent(new CustomEvent('juno:watchlist-updated'));

    // 4. Close modal
    setIsEnterModalOpen(false);
    setEnteringItem(null);
  };

  // ===== CLOSE: Active Trade =====
  const handleEndTrade = (trade: ActiveTrade) => {
    // Just remove from active trades - trade is now closed
    const updated = activeTrades.filter(t => t.id !== trade.id);
    setActiveTrades(updated);
    try {
      localStorage.setItem(ACTIVE_TRADES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving active trades:', error);
    }

    // DO NOT add back to watchlist/potential
    // The trade is now closed (journal/history handles archived trades)

    // Refresh and close modal
    loadData();
    setClosingTradeId(null);
  };

  const handleClosePosition = (tradeId: string) => {
    const trade = activeTrades.find(t => t.id === tradeId);
    if (!trade) return;
    handleEndTrade(trade);
  };

  // ===== Formatters =====
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
      <div className="w-full space-y-6">
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

  return (
    <div className="w-full space-y-6">
      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="p-1.5 bg-red-500/20 rounded-full">
            <X className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-400 hover:text-red-300 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===== ACTIVE TRADES SECTION ===== */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Active Trades</h3>
              <p className="text-sm text-[#8b949e]">
                {activeTrades.length} position{activeTrades.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Active Trades List */}
        {activeTrades.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[#30363d] rounded-xl">
            <Activity className="w-10 h-10 text-[#30363d] mx-auto mb-3" />
            <p className="text-sm text-[#8b949e]">No active positions</p>
            <p className="text-xs text-[#6e7681] mt-1">Start a trade from Potential Trades below</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTrades.map((trade) => (
              <div
                key={trade.id}
                className="bg-[#0F0F0F] border border-green-500/30 rounded-xl overflow-hidden hover:border-green-500/50 transition-all"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-green-500/5">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-green-500/10 rounded-lg">
                      <span className="text-lg font-bold text-green-400">{trade.ticker}</span>
                    </div>
                    {/* Long/Short Indicator */}
                    {(() => {
                      const isLong = trade.plannedTarget > trade.plannedEntry;
                      const isShort = trade.plannedTarget < trade.plannedEntry;
                      if (!isLong && !isShort) return null;
                      return (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isLong ? '📈 LONG' : '📉 SHORT'}
                        </span>
                      );
                    })()}
                    <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(trade.openedAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => setClosingTradeId(trade.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-400 hover:text-white hover:bg-green-500 rounded-lg transition-colors"
                    title="Close trade and remove from active trades"
                  >
                    <X className="w-3.5 h-3.5" />
                    Close Trade
                  </button>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  {/* Planned vs Actual Row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Planned */}
                    <div className="bg-[#161b22] rounded-lg p-3">
                      <div className="text-xs text-[#8b949e] uppercase tracking-wide mb-2">Planned</div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Entry</span>
                          <span className="text-xs font-medium text-white">{formatCurrency(trade.plannedEntry)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-red-400">Stop</span>
                          <span className="text-xs font-medium text-white">{formatCurrency(trade.plannedStop)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-green-400">Target</span>
                          <span className="text-xs font-medium text-white">{formatCurrency(trade.plannedTarget)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actual */}
                    <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                      <div className="text-xs text-green-400 uppercase tracking-wide mb-2">Actual Position</div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Entry</span>
                          <span className="text-xs font-medium text-white">{formatCurrency(trade.actualEntry)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Shares</span>
                          <span className="text-xs font-medium text-white">{formatNumber(trade.actualShares)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Value</span>
                          <span className="text-xs font-bold text-green-400">{formatCurrency(trade.positionValue)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {trade.notes && (
                    <div className="bg-[#161b22] rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        Notes
                      </div>
                      <p className="text-sm text-white">{trade.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#30363d]"></div>

      {/* ===== POTENTIAL TRADES SECTION ===== */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F97316]/10 rounded-lg">
              <BarChart3 className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Potential Trades</h3>
              <p className="text-sm text-[#8b949e]">
                {watchlist.length} saved trade{watchlist.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Potential Trades List */}
        {watchlist.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[#30363d] rounded-xl">
            <BookmarkX className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Saved Trades</h3>
            <p className="text-[#8b949e] max-w-md mx-auto mb-4 text-sm">
              When you calculate a valid trade (2:1 risk ratio or better), you can save it here for later reference.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-[#8b949e]">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span>Use the Calculator to add trades</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
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
                    {/* Long/Short Indicator */}
                    {(() => {
                      const isLong = item.targetPrice > item.entryPrice;
                      const isShort = item.targetPrice < item.entryPrice;
                      if (!isLong && !isShort) return null;
                      return (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isLong ? '📈 LONG' : '📉 SHORT'}
                        </span>
                      );
                    })()}
                    <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(item.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartTrade(item);
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 text-sm text-green-400 hover:text-white hover:bg-green-500 rounded-lg transition-colors"
                      title="Enter position - Move to Active Trades"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Trade
                    </button>
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
                        handleRemoveFromWatchlist(item.id);
                      }}
                      className="p-2 text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      title="Remove from watchlist"
                    >
                      <BookmarkX className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4">
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
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    <div className="bg-[#161b22] rounded-lg px-3 py-2">
                      <div className="text-xs text-[#8b949e] mb-0.5">R:R</div>
                      <span className="text-sm font-semibold text-green-400">
                        {item.riskRatio.toFixed(2)}:1
                      </span>
                    </div>
                    <div className="bg-[#161b22] rounded-lg px-3 py-2">
                      <div className="text-xs text-[#8b949e] mb-0.5">Stop</div>
                      <span className="text-sm font-semibold text-white">
                        {formatCurrency(item.stopSize)}
                      </span>
                    </div>
                    <div className="bg-[#161b22] rounded-lg px-3 py-2">
                      <div className="text-xs text-[#8b949e] mb-0.5">Shares</div>
                      <span className="text-sm font-semibold text-white">
                        {formatNumber(item.shareSize)}
                      </span>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                      <div className="text-xs text-[#8b949e] mb-0.5">Profit</div>
                      <span className="text-sm font-bold text-green-400">
                        {formatCurrency(item.potentialReward)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== MODALS ===== */}

      {/* Edit Modal */}
      <EditWatchlistItemModal
        item={editingItem}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* Enter Position Modal (Potential → Active) */}
      <EnterPositionModal
        item={enteringItem}
        isOpen={isEnterModalOpen}
        onClose={handleCloseEnterModal}
        onConfirm={handleConfirmEnterPosition}
      />

      {/* Close Trade Confirmation Modal (Active → Closed) */}
      {closingTradeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <X className="w-6 h-6 text-yellow-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Close Trade?</h3>
              <p className="text-sm text-[#8b949e] mb-6">
                This will remove the trade from Active Trades. The trade will be recorded in your Trading Journal.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setClosingTradeId(null)}
                  className="flex-1 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => closingTradeId && handleClosePosition(closingTradeId)}
                  className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Close Trade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
