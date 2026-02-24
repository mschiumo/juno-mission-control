'use client';

import { useState, useEffect, useCallback } from 'react';
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
  X,
  Archive,
  Trash2,
  History
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import type { ActiveTrade, ActiveTradeWithPnL } from '@/types/active-trade';
import EditWatchlistItemModal from './EditWatchlistItemModal';
import EnterPositionModal from './EnterPositionModal';
import EditActiveTradeModal from './EditActiveTradeModal';

const WATCHLIST_KEY = 'juno:trade-watchlist';
const ACTIVE_TRADES_KEY = 'juno:active-trades';
const CLOSED_POSITIONS_KEY = 'juno:closed-positions';

// Custom event names for cross-section sync
const EVENTS = {
  WATCHLIST_UPDATED: 'juno:watchlist-updated',
  ACTIVE_TRADES_UPDATED: 'juno:active-trades-updated',
  CLOSED_POSITIONS_UPDATED: 'juno:closed-positions-updated',
} as const;

// Closed Position Type
export interface ClosedPosition {
  id: string;
  ticker: string;
  plannedEntry: number;
  plannedStop: number;
  plannedTarget: number;
  actualEntry: number;
  actualShares: number;
  // Optional exit data (can be added later)
  exitPrice?: number;
  exitDate?: string;
  pnl?: number;
  openedAt: string;
  closedAt: string;
  notes?: string;
}

// Helper functions for localStorage operations
const storage = {
  getWatchlist: (): WatchlistItem[] => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading watchlist:', error);
      return [];
    }
  },
  setWatchlist: (data: WatchlistItem[]): void => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving watchlist:', error);
    }
  },
  getActiveTrades: (): ActiveTradeWithPnL[] => {
    try {
      const stored = localStorage.getItem(ACTIVE_TRADES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading active trades:', error);
      return [];
    }
  },
  setActiveTrades: (data: ActiveTradeWithPnL[]): void => {
    try {
      localStorage.setItem(ACTIVE_TRADES_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving active trades:', error);
    }
  },
  getClosedPositions: (): ClosedPosition[] => {
    try {
      const stored = localStorage.getItem(CLOSED_POSITIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading closed positions:', error);
      return [];
    }
  },
  setClosedPositions: (data: ClosedPosition[]): void => {
    try {
      localStorage.setItem(CLOSED_POSITIONS_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving closed positions:', error);
    }
  },
};

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
  
  // Edit Active Trade state
  const [editingTrade, setEditingTrade] = useState<ActiveTrade | null>(null);
  const [isEditTradeModalOpen, setIsEditTradeModalOpen] = useState(false);

  // Closed Positions state
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [deletingPositionId, setDeletingPositionId] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data from localStorage - memoized to prevent unnecessary re-renders
  const loadData = useCallback(() => {
    setWatchlist(storage.getWatchlist());
    setActiveTrades(storage.getActiveTrades());
    setClosedPositions(storage.getClosedPositions());
  }, []);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, [loadData]);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === WATCHLIST_KEY || e.key === ACTIVE_TRADES_KEY || e.key === CLOSED_POSITIONS_KEY) {
        loadData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadData]);

  // Listen for same-tab updates via custom events
  useEffect(() => {
    const handleWatchlistUpdate = () => {
      setWatchlist(storage.getWatchlist());
    };
    
    const handleActiveTradesUpdate = () => {
      setActiveTrades(storage.getActiveTrades());
    };
    
    const handleClosedPositionsUpdate = () => {
      setClosedPositions(storage.getClosedPositions());
    };

    window.addEventListener(EVENTS.WATCHLIST_UPDATED, handleWatchlistUpdate);
    window.addEventListener(EVENTS.ACTIVE_TRADES_UPDATED, handleActiveTradesUpdate);
    window.addEventListener(EVENTS.CLOSED_POSITIONS_UPDATED, handleClosedPositionsUpdate);
    
    return () => {
      window.removeEventListener(EVENTS.WATCHLIST_UPDATED, handleWatchlistUpdate);
      window.removeEventListener(EVENTS.ACTIVE_TRADES_UPDATED, handleActiveTradesUpdate);
      window.removeEventListener(EVENTS.CLOSED_POSITIONS_UPDATED, handleClosedPositionsUpdate);
    };
  }, []);

  // ===== WATCHLIST (Potential Trades) Actions =====
  const handleRemoveFromWatchlist = (id: string) => {
    const current = storage.getWatchlist();
    const updated = current.filter(item => item.id !== id);
    storage.setWatchlist(updated);
    setWatchlist(updated);
    window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));
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
    const current = storage.getWatchlist();
    const updated = current.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
    storage.setWatchlist(updated);
    setWatchlist(updated);
    window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));
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
    const currentActive = storage.getActiveTrades();
    const isDuplicateInActive = currentActive.some(
      t => t.ticker.toUpperCase() === activeTrade.ticker.toUpperCase()
    );

    if (isDuplicateInActive) {
      setError(`${activeTrade.ticker} is already an active position`);
      return; // Don't proceed
    }

    // Clear any previous error
    setError(null);

    // 1. Add to active trades (update localStorage FIRST, then state)
    const updatedActive = [...currentActive, activeTrade];
    storage.setActiveTrades(updatedActive);
    setActiveTrades(updatedActive);

    // 2. Remove from potential trades (watchlist) using the watchlistId reference
    // Update localStorage FIRST, then state
    if (activeTrade.watchlistId) {
      const currentWatchlist = storage.getWatchlist();
      const updatedPotential = currentWatchlist.filter(w => w.id !== activeTrade.watchlistId);
      storage.setWatchlist(updatedPotential);
      setWatchlist(updatedPotential);
    }

    // 3. Dispatch events to refresh all sections
    // These events trigger other components (if any) to reload from localStorage
    window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
    window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));

    // 4. Close modal
    setIsEnterModalOpen(false);
    setEnteringItem(null);
  };

  // ===== CLOSE: Active → Closed =====
  const handleEndTrade = (trade: ActiveTrade) => {
    // 1. Create closed position record
    const closedPosition: ClosedPosition = {
      id: trade.id,
      ticker: trade.ticker,
      plannedEntry: trade.plannedEntry,
      plannedStop: trade.plannedStop,
      plannedTarget: trade.plannedTarget,
      actualEntry: trade.actualEntry,
      actualShares: trade.actualShares,
      openedAt: trade.openedAt,
      closedAt: new Date().toISOString(),
      notes: trade.notes,
      // P&L calculation (placeholder - can be updated with actual exit price later)
      pnl: undefined,
    };

    // 2. Add to closed positions (localStorage FIRST, then state)
    const currentClosed = storage.getClosedPositions();
    const updatedClosed = [closedPosition, ...currentClosed];
    storage.setClosedPositions(updatedClosed);
    setClosedPositions(updatedClosed);

    // 3. Remove from active trades (localStorage FIRST, then state)
    const currentActive = storage.getActiveTrades();
    const updatedActive = currentActive.filter(t => t.id !== trade.id);
    storage.setActiveTrades(updatedActive);
    setActiveTrades(updatedActive);

    // 4. Dispatch events
    window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
    window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));

    // 5. Close modal
    setClosingTradeId(null);
  };

  const handleClosePosition = (tradeId: string) => {
    const trade = activeTrades.find(t => t.id === tradeId);
    if (!trade) return;
    handleEndTrade(trade);
  };

  // ===== EDIT: Active Trade =====
  const handleEditTrade = (trade: ActiveTrade) => {
    setEditingTrade(trade);
    setIsEditTradeModalOpen(true);
  };

  const handleCloseEditTradeModal = () => {
    setIsEditTradeModalOpen(false);
    setEditingTrade(null);
  };

  const handleSaveTrade = (updatedTrade: ActiveTrade) => {
    const currentActive = storage.getActiveTrades();
    const updatedActive = currentActive.map(trade => 
      trade.id === updatedTrade.id ? { ...updatedTrade, currentPrice: trade.currentPrice, unrealizedPnL: trade.unrealizedPnL, unrealizedPnLPercent: trade.unrealizedPnLPercent } : trade
    );
    storage.setActiveTrades(updatedActive);
    setActiveTrades(updatedActive);
    window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
    setIsEditTradeModalOpen(false);
    setEditingTrade(null);
  };

  // ===== DELETE: Closed Position (permanent) =====
  const handleDeleteClosedPosition = (positionId: string) => {
    const currentClosed = storage.getClosedPositions();
    const updated = currentClosed.filter(p => p.id !== positionId);
    storage.setClosedPositions(updated);
    setClosedPositions(updated);
    window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));
    setDeletingPositionId(null);
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditTrade(trade)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:text-white hover:bg-blue-500 rounded-lg transition-colors"
                      title="Edit trade details"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => setClosingTradeId(trade.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-400 hover:text-white hover:bg-green-500 rounded-lg transition-colors"
                      title="Close trade and remove from active trades"
                    >
                      <X className="w-3.5 h-3.5" />
                      Close Trade
                    </button>
                  </div>
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

      {/* Divider */}
      <div className="border-t border-[#30363d]"></div>

      {/* ===== CLOSED POSITIONS SECTION ===== */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Archive className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Closed Positions</h3>
              <p className="text-sm text-[#8b949e]">
                {closedPositions.length} archived position{closedPositions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Closed Positions List */}
        {closedPositions.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[#30363d] rounded-xl">
            <History className="w-10 h-10 text-[#30363d] mx-auto mb-3" />
            <p className="text-sm text-[#8b949e]">No closed positions</p>
            <p className="text-xs text-[#6e7681] mt-1">Closed trades will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {closedPositions.map((position) => (
              <div
                key={position.id}
                className="bg-[#0F0F0F] border border-blue-500/20 rounded-xl overflow-hidden"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-blue-500/5">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-blue-500/10 rounded-lg">
                      <span className="text-lg font-bold text-blue-400">{position.ticker}</span>
                    </div>
                    {/* Long/Short Indicator */}
                    {(() => {
                      const isLong = position.plannedTarget > position.plannedEntry;
                      const isShort = position.plannedTarget < position.plannedEntry;
                      if (!isLong && !isShort) return null;
                      return (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isLong ? '📈 LONG' : '📉 SHORT'}
                        </span>
                      );
                    })()}
                    <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                      <Calendar className="w-3.5 h-3.5" />
                      Closed {formatDate(position.closedAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => setDeletingPositionId(position.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
                    title="Delete from history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  {/* Entry/Exit Summary Row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Entry Info */}
                    <div className="bg-[#161b22] rounded-lg p-3">
                      <div className="text-xs text-blue-400 uppercase tracking-wide mb-2">Entry</div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Price</span>
                          <span className="text-xs font-medium text-white">{formatCurrency(position.actualEntry)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Shares</span>
                          <span className="text-xs font-medium text-white">{formatNumber(position.actualShares)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#8b949e]">Date</span>
                          <span className="text-xs text-[#8b949e]">{formatDate(position.openedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Exit Info */}
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
                      <div className="text-xs text-blue-400 uppercase tracking-wide mb-2">Exit</div>
                      {position.exitPrice ? (
                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-xs text-[#8b949e]">Price</span>
                            <span className="text-xs font-medium text-white">{formatCurrency(position.exitPrice)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-[#8b949e]">P&L</span>
                            <span className={`text-xs font-bold ${(position.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {position.pnl !== undefined ? formatCurrency(position.pnl) : '--'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-xs text-[#6e7681] italic">Exit not recorded</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {position.notes && (
                    <div className="bg-[#161b22] rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        Notes
                      </div>
                      <p className="text-sm text-white">{position.notes}</p>
                    </div>
                  )}
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

      {/* Edit Active Trade Modal */}
      <EditActiveTradeModal
        trade={editingTrade}
        isOpen={isEditTradeModalOpen}
        onClose={handleCloseEditTradeModal}
        onSave={handleSaveTrade}
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
                This will move the trade to Closed Positions for your records.
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

      {/* Delete Closed Position Confirmation Modal */}
      {deletingPositionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Delete Position?</h3>
              <p className="text-sm text-[#8b949e] mb-6">
                This will permanently remove this closed position from history. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingPositionId(null)}
                  className="flex-1 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deletingPositionId && handleDeleteClosedPosition(deletingPositionId)}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
