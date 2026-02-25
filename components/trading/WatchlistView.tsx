'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  BookmarkX, 
  TrendingUp, 
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
  History,
  Plus,
  Check
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import type { ActiveTrade, ActiveTradeWithPnL } from '@/types/active-trade';
import type { CreateTradeRequest } from '@/types/trading';
import { TradeSide, Strategy } from '@/types/trading';
import EditWatchlistItemModal from './EditWatchlistItemModal';
import EnterPositionModal from './EnterPositionModal';
import EditActiveTradeModal from './EditActiveTradeModal';
import EditClosedPositionModal from './EditClosedPositionModal';

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

  // Debug: Log watchlist changes
  useEffect(() => {
    console.log('[DEBUG WatchlistView] watchlist state changed:', watchlist.length, 'items');
  }, [watchlist]);

  // Active Trades state
  const [activeTrades, setActiveTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  
  // Edit Active Trade state
  const [editingTrade, setEditingTrade] = useState<ActiveTrade | null>(null);
  const [isEditTradeModalOpen, setIsEditTradeModalOpen] = useState(false);

  // Inline edit state for Active Trades
  const [inlineEditing, setInlineEditing] = useState<{
    tradeId: string;
    field: 'actualEntry' | 'plannedStop' | 'plannedTarget' | 'actualShares' | 'notes';
    value: string;
  } | null>(null);

  // Closed Positions state
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [deletingPositionId, setDeletingPositionId] = useState<string | null>(null);
  
  // Edit Closed Position state
  const [editingClosedPosition, setEditingClosedPosition] = useState<ClosedPosition | null>(null);
  const [isEditClosedPositionModalOpen, setIsEditClosedPositionModalOpen] = useState(false);
  
  // Track which positions have been added to calendar (for UI feedback)
  const [addedToCalendarIds, setAddedToCalendarIds] = useState<Set<string>>(new Set());

  // Calendar trades for duplicate checking
  const [calendarTrades, setCalendarTrades] = useState<Array<{ id: string; symbol: string; entryDate: string }>>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // Confirmation modal state for Add to Calendar
  const [confirmingAddToCalendar, setConfirmingAddToCalendar] = useState<ClosedPosition | null>(null);
  
  // Editable calendar form state
  const [calendarFormData, setCalendarFormData] = useState<{
    entryPrice: string;
    exitPrice: string;
    shares: string;
    takeProfit: string;
  } | null>(null);

  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load data from localStorage - memoized to prevent unnecessary re-renders
  const loadData = useCallback(() => {
    setWatchlist(storage.getWatchlist());
    setActiveTrades(storage.getActiveTrades());
    setClosedPositions(storage.getClosedPositions());
  }, []);

  // Fetch calendar trades to check for duplicates
  const fetchCalendarTrades = useCallback(async () => {
    try {
      setIsLoadingCalendar(true);
      const response = await fetch('/api/trades?limit=1000');
      if (response.ok) {
        const result = await response.json();
        if (result.data && Array.isArray(result.data)) {
          setCalendarTrades(result.data.map((t: { id: string; symbol: string; entryDate: string }) => ({
            id: t.id,
            symbol: t.symbol,
            entryDate: t.entryDate,
          })));
        }
      }
    } catch (err) {
      console.error('Error fetching calendar trades:', err);
    } finally {
      setIsLoadingCalendar(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadData();
    fetchCalendarTrades();
  }, [loadData, fetchCalendarTrades]);

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
    console.log('[DEBUG] handleConfirmEnterPosition called', { watchlistId: activeTrade.watchlistId });

    // Check for duplicate in active trades
    const currentActive = storage.getActiveTrades();
    const isDuplicateInActive = currentActive.some(
      t => t.ticker.toUpperCase() === activeTrade.ticker.toUpperCase()
    );

    if (isDuplicateInActive) {
      setError(`${activeTrade.ticker} is already an active position`);
      return;
    }

    setError(null);

    // 1. Add to active trades
    const updatedActive = [...currentActive, activeTrade];
    storage.setActiveTrades(updatedActive);
    console.log('[DEBUG] Active trades saved:', updatedActive.length);

    // 2. Remove from watchlist (if watchlistId exists)
    if (activeTrade.watchlistId) {
      const currentWatchlist = storage.getWatchlist();
      console.log('[DEBUG] Watchlist before:', currentWatchlist.length, 'items');
      console.log('[DEBUG] Looking for id:', activeTrade.watchlistId);
      
      const updatedPotential = currentWatchlist.filter(w => w.id !== activeTrade.watchlistId);
      console.log('[DEBUG] Watchlist after:', updatedPotential.length, 'items');
      
      storage.setWatchlist(updatedPotential);
      
      // Direct state update - immediate
      setWatchlist(updatedPotential);
    }

    // 3. Update active trades state
    setActiveTrades(updatedActive);

    // 4. Sync from localStorage to ensure consistency
    loadData();

    // 5. Dispatch events for other components
    window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
    window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));

    // 6. Close modal
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

  // ===== INLINE EDIT: Active Trade =====
  const handleInlineEditStart = (trade: ActiveTrade, field: 'actualEntry' | 'plannedStop' | 'plannedTarget' | 'actualShares' | 'notes') => {
    const value = trade[field]?.toString() || '';
    setInlineEditing({ tradeId: trade.id, field, value });
  };

  const handleInlineEditChange = (value: string) => {
    if (!inlineEditing) return;
    setInlineEditing({ ...inlineEditing, value });
  };

  const handleInlineEditSave = () => {
    if (!inlineEditing) return;

    const { tradeId, field, value } = inlineEditing;
    const trade = activeTrades.find(t => t.id === tradeId);
    if (!trade) {
      setInlineEditing(null);
      return;
    }

    let parsedValue: number | string | undefined;
    let numericValue: number | undefined;
    
    if (field === 'notes') {
      parsedValue = value.trim() || undefined;
    } else {
      numericValue = parseFloat(value);
      if (isNaN(numericValue) || numericValue <= 0) {
        // Invalid value, cancel edit
        setInlineEditing(null);
        return;
      }
      parsedValue = numericValue;
    }

    // Recalculate position value if entry or shares changed
    let newPositionValue = trade.positionValue;
    if ((field === 'actualEntry' || field === 'actualShares') && numericValue !== undefined) {
      const entryPrice = field === 'actualEntry' ? numericValue : (trade.actualEntry || 0);
      const shares = field === 'actualShares' ? numericValue : (trade.actualShares || 0);
      newPositionValue = entryPrice * shares;
    }

    const updatedTrade: ActiveTrade = {
      ...trade,
      [field]: parsedValue,
      positionValue: newPositionValue
    };

    handleSaveTrade(updatedTrade);
    setInlineEditing(null);
  };

  const handleInlineEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInlineEditSave();
    } else if (e.key === 'Escape') {
      setInlineEditing(null);
    }
  };

  // ===== EDIT: Closed Position =====
  const handleEditClosedPosition = (position: ClosedPosition) => {
    setEditingClosedPosition(position);
    setIsEditClosedPositionModalOpen(true);
  };

  const handleCloseEditClosedPositionModal = () => {
    setIsEditClosedPositionModalOpen(false);
    setEditingClosedPosition(null);
  };

  const handleSaveClosedPosition = (updatedPosition: ClosedPosition) => {
    const currentClosed = storage.getClosedPositions();
    const updated = currentClosed.map(position => 
      position.id === updatedPosition.id ? updatedPosition : position
    );
    storage.setClosedPositions(updated);
    setClosedPositions(updated);
    window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));
    setIsEditClosedPositionModalOpen(false);
    setEditingClosedPosition(null);
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

  // ===== CALENDAR HELPERS =====
  // Check if a position is already in the calendar
  const isPositionInCalendar = useCallback((position: ClosedPosition): boolean => {
    // Check session-based additions first
    if (addedToCalendarIds.has(position.id)) return true;
    
    // Check against fetched calendar trades
    const positionDate = position.closedAt.split('T')[0];
    return calendarTrades.some(
      t => t.symbol.toUpperCase() === position.ticker.toUpperCase() && 
           t.entryDate?.split('T')[0] === positionDate
    );
  }, [addedToCalendarIds, calendarTrades]);

  // ===== ADD TO CALENDAR: Closed Position → Calendar Trade =====
  const handleAddToCalendarClick = (position: ClosedPosition) => {
    setConfirmingAddToCalendar(position);
    // Initialize form data with position values
    setCalendarFormData({
      entryPrice: (position.actualEntry || position.plannedEntry).toString(),
      exitPrice: (position.exitPrice || position.plannedTarget).toString(),
      shares: position.actualShares.toString(),
      takeProfit: position.plannedTarget.toString(),
    });
  };

  // Calculate P&L for calendar form
  const calculateCalendarPnL = useCallback(() => {
    if (!confirmingAddToCalendar || !calendarFormData) return 0;
    
    const entryPrice = parseFloat(calendarFormData.entryPrice) || 0;
    const exitPrice = parseFloat(calendarFormData.exitPrice) || 0;
    const shares = parseFloat(calendarFormData.shares) || 0;
    const isLong = confirmingAddToCalendar.plannedTarget > confirmingAddToCalendar.plannedEntry;
    
    if (isLong) {
      return (exitPrice - entryPrice) * shares;
    } else {
      return (entryPrice - exitPrice) * shares;
    }
  }, [confirmingAddToCalendar, calendarFormData]);

  const handleCalendarFormChange = (field: 'entryPrice' | 'exitPrice' | 'shares' | 'takeProfit', value: string) => {
    setCalendarFormData(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleConfirmAddToCalendar = async () => {
    if (!confirmingAddToCalendar || !calendarFormData) return;

    const position = confirmingAddToCalendar;

    try {
      // Use editable form values
      const entryPrice = parseFloat(calendarFormData.entryPrice) || position.actualEntry;
      const exitPrice = parseFloat(calendarFormData.exitPrice) || position.exitPrice || position.plannedTarget;
      const shares = parseFloat(calendarFormData.shares) || position.actualShares;
      const takeProfit = parseFloat(calendarFormData.takeProfit) || position.plannedTarget;
      const isLong = position.plannedTarget > position.plannedEntry;

      // Calculate P&L from editable values
      let pnl = 0;
      if (isLong) {
        pnl = (exitPrice - entryPrice) * shares;
      } else {
        pnl = (entryPrice - exitPrice) * shares;
      }

      // Extract the original trade date for calendar display
      const displayDate = new Date(position.closedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      // Create trade request with EDITABLE VALUES from form
      const tradeRequest: CreateTradeRequest = {
        symbol: position.ticker,
        side: isLong ? TradeSide.LONG : TradeSide.SHORT,
        strategy: Strategy.DAY_TRADE, // Default strategy
        entryDate: position.openedAt, // Original entry date
        entryPrice: entryPrice, // Use edited entry price
        shares: shares, // Use edited shares
        entryNotes: `Transferred from Closed Positions. ${position.notes || ''} [Source: closed-position-transfer]`,
        stopLoss: position.plannedStop,
        takeProfit: takeProfit, // Use edited take profit
      };

      // POST to API to create the trade
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add trade to calendar');
      }

      const result = await response.json();

      // Now update the trade with exit info (close it) to match the original closed position
      if (result.data?.id) {
        const updateResponse = await fetch(`/api/trades/${result.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exitDate: position.closedAt, // ORIGINAL close date - ensures calendar shows correct date
            exitPrice: exitPrice,
            exitNotes: `Closed position transferred from watchlist. P&L: ${formatCurrency(pnl)}`,
            status: 'CLOSED',
            // BUG FIX #2: Pass explicit P&L to prevent API recalculation discrepancy
            grossPnL: pnl,
            netPnL: pnl, // Use same value for net (fees already accounted for if applicable)
          }),
        });

        if (!updateResponse.ok) {
          console.warn('Trade created but exit info update failed');
        }
      }

      // Show success feedback with the date
      setAddedToCalendarIds(prev => new Set(prev).add(position.id));

      // Remove from closed positions (NEW - PR #156)
      const updatedClosed = closedPositions.filter(p => p.id !== position.id);
      setClosedPositions(updatedClosed);
      localStorage.setItem(CLOSED_POSITIONS_KEY, JSON.stringify(updatedClosed));
      window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));

      // Close modal and show success
      setConfirmingAddToCalendar(null);
      setCalendarFormData(null); // Reset form data
      setSuccessMessage(`Added to ${displayDate} calendar and removed from Closed Positions`);

      // Refresh calendar trades to update button states
      await fetchCalendarTrades();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);

      // Dispatch event to refresh calendar if needed
      window.dispatchEvent(new CustomEvent('juno:calendar-trades-updated'));

    } catch (err) {
      console.error('Error adding to calendar:', err);
      setError(err instanceof Error ? err.message : 'Failed to add to calendar');

      // Close modal on error
      setConfirmingAddToCalendar(null);

      // Clear error after 5 seconds
      setTimeout(() => {
        setError(null);
      }, 5000);
    }
  };

  // ===== ADD TO CALENDAR: Closed Position → Calendar Trade (legacy, replaced by confirmation flow) =====
  const handleAddToCalendar = async (position: ClosedPosition) => {
    try {
      // Calculate P&L dynamically from trade parameters (PR #156: Fix P&L calculation)
      // DO NOT use stored position.pnl - always calculate from entry/exit/shares/side
      const entryPrice = position.actualEntry;
      const exitPrice = position.exitPrice || position.plannedTarget;
      const shares = position.actualShares;
      const isLong = position.plannedTarget > position.plannedEntry;
      
      // Calculate P&L dynamically based on side (Long/Short)
      let pnl = 0;
      if (isLong) {
        // For LONG trades: pnl = (exitPrice - entryPrice) * shares
        pnl = (exitPrice - entryPrice) * shares;
      } else {
        // For SHORT trades: pnl = (entryPrice - exitPrice) * shares
        pnl = (entryPrice - exitPrice) * shares;
      }

      // Extract the original trade date for calendar display
      // Use closedAt date to ensure trade appears on correct day
      const displayDate = new Date(position.closedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      // Create trade request with ORIGINAL TRADE DATE
      const tradeRequest: CreateTradeRequest = {
        symbol: position.ticker,
        side: isLong ? TradeSide.LONG : TradeSide.SHORT,
        strategy: Strategy.DAY_TRADE, // Default strategy
        entryDate: position.openedAt, // Original entry date
        entryPrice: position.actualEntry,
        shares: position.actualShares,
        entryNotes: `Transferred from Closed Positions. ${position.notes || ''} [Source: closed-position-transfer]`,
        stopLoss: position.plannedStop,
        takeProfit: position.plannedTarget,
      };

      // POST to API to create the trade
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add trade to calendar');
      }

      const result = await response.json();
      
      // Now update the trade with exit info (close it) to match the original closed position
      if (result.data?.id) {
        const updateResponse = await fetch(`/api/trades/${result.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exitDate: position.closedAt, // ORIGINAL close date - ensures calendar shows correct date
            exitPrice: exitPrice,
            exitNotes: `Closed position transferred from watchlist. P&L: ${formatCurrency(pnl)}`,
            status: 'CLOSED',
            // BUG FIX #2: Pass explicit P&L to prevent API recalculation discrepancy
            grossPnL: pnl,
            netPnL: pnl, // Use same value for net (fees already accounted for if applicable)
          }),
        });

        if (!updateResponse.ok) {
          console.warn('Trade created but exit info update failed');
        }
      }

      // Show success feedback with the date
      setAddedToCalendarIds(prev => new Set(prev).add(position.id));
      setSuccessMessage(`Added to ${displayDate} calendar`);
      
      // Refresh calendar trades to update button states
      await fetchCalendarTrades();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);

      // Dispatch event to refresh calendar if needed
      window.dispatchEvent(new CustomEvent('juno:calendar-trades-updated'));

    } catch (err) {
      console.error('Error adding to calendar:', err);
      setError(err instanceof Error ? err.message : 'Failed to add to calendar');
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setError(null);
      }, 5000);
    }
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
      {/* Error & Success Display */}
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
      
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="p-1.5 bg-green-500/20 rounded-full">
            <CheckCircle className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-sm text-green-400 flex-1">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-green-400 hover:text-green-300 underline"
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
                  {/* Unified Stats Row - All States */}
                  <div className="grid grid-cols-6 gap-2">
                    {/* Entry Price - Inline Editable */}
                    <div className="cursor-pointer hover:bg-[#262626] rounded-lg px-1 -mx-1 transition-colors"
                         onClick={() => handleInlineEditStart(trade, 'actualEntry')}>
                      <div className="text-xs text-[#8b949e]">Entry</div>
                      {inlineEditing?.tradeId === trade.id && inlineEditing?.field === 'actualEntry' ? (
                        <input
                          type="number"
                          step="0.01"
                          value={inlineEditing.value}
                          onChange={(e) => handleInlineEditChange(e.target.value)}
                          onBlur={handleInlineEditSave}
                          onKeyDown={handleInlineEditKeyDown}
                          autoFocus
                          className="w-full px-1 py-0.5 bg-[#161b22] border border-blue-500 rounded text-sm font-semibold text-white focus:outline-none"
                        />
                      ) : (
                        <div className="text-sm font-semibold">{formatCurrency(trade.actualEntry)}</div>
                      )}
                    </div>

                    {/* Stop Price - Inline Editable */}
                    <div className="cursor-pointer hover:bg-[#262626] rounded-lg px-1 -mx-1 transition-colors"
                         onClick={() => handleInlineEditStart(trade, 'plannedStop')}>
                      <div className="text-xs text-red-400">Stop</div>
                      {inlineEditing?.tradeId === trade.id && inlineEditing?.field === 'plannedStop' ? (
                        <input
                          type="number"
                          step="0.01"
                          value={inlineEditing.value}
                          onChange={(e) => handleInlineEditChange(e.target.value)}
                          onBlur={handleInlineEditSave}
                          onKeyDown={handleInlineEditKeyDown}
                          autoFocus
                          className="w-full px-1 py-0.5 bg-[#161b22] border border-blue-500 rounded text-sm font-semibold text-white focus:outline-none"
                        />
                      ) : (
                        <div className="text-sm font-semibold">{formatCurrency(trade.plannedStop)}</div>
                      )}
                    </div>

                    {/* Target Price - Inline Editable */}
                    <div className="cursor-pointer hover:bg-[#262626] rounded-lg px-1 -mx-1 transition-colors"
                         onClick={() => handleInlineEditStart(trade, 'plannedTarget')}>
                      <div className="text-xs text-green-400">Target</div>
                      {inlineEditing?.tradeId === trade.id && inlineEditing?.field === 'plannedTarget' ? (
                        <input
                          type="number"
                          step="0.01"
                          value={inlineEditing.value}
                          onChange={(e) => handleInlineEditChange(e.target.value)}
                          onBlur={handleInlineEditSave}
                          onKeyDown={handleInlineEditKeyDown}
                          autoFocus
                          className="w-full px-1 py-0.5 bg-[#161b22] border border-blue-500 rounded text-sm font-semibold text-white focus:outline-none"
                        />
                      ) : (
                        <div className="text-sm font-semibold">{formatCurrency(trade.plannedTarget)}</div>
                      )}
                    </div>

                    {/* Profit */}
                    <div>
                      <div className="text-xs text-[#8b949e]">Profit</div>
                      <div className="text-sm font-bold text-green-400">{formatCurrency((trade.plannedTarget - trade.actualEntry) * trade.actualShares)}</div>
                    </div>

                    {/* Risk Amount */}
                    <div>
                      <div className="text-xs text-red-400 font-medium">Risk</div>
                      <div className="text-sm font-bold text-red-400">
                        {(() => {
                          const riskAmount = Math.abs(trade.actualEntry - trade.plannedStop) * trade.actualShares;
                          return formatCurrency(riskAmount);
                        })()}
                      </div>
                    </div>

                    {/* Shares - Inline Editable */}
                    <div className="cursor-pointer hover:bg-[#262626] rounded-lg px-1 -mx-1 transition-colors"
                         onClick={() => handleInlineEditStart(trade, 'actualShares')}>
                      <div className="text-xs text-[#8b949e]">Shares</div>
                      {inlineEditing?.tradeId === trade.id && inlineEditing?.field === 'actualShares' ? (
                        <input
                          type="number"
                          step="1"
                          value={inlineEditing.value}
                          onChange={(e) => handleInlineEditChange(e.target.value)}
                          onBlur={handleInlineEditSave}
                          onKeyDown={handleInlineEditKeyDown}
                          autoFocus
                          className="w-full px-1 py-0.5 bg-[#161b22] border border-blue-500 rounded text-sm font-semibold text-white focus:outline-none"
                        />
                      ) : (
                        <div className="text-sm font-semibold">{formatNumber(trade.actualShares)}</div>
                      )}
                    </div>
                  </div>

                  {/* Notes - Inline Editable */}
                  {trade.notes ? (
                    <div className="bg-[#161b22] rounded-lg p-4 cursor-pointer hover:bg-[#1c2128] transition-colors"
                         onClick={() => handleInlineEditStart(trade, 'notes')}>
                      {inlineEditing?.tradeId === trade.id && inlineEditing?.field === 'notes' ? (
                        <textarea
                          value={inlineEditing.value}
                          onChange={(e) => handleInlineEditChange(e.target.value)}
                          onBlur={handleInlineEditSave}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.metaKey) {
                              handleInlineEditSave();
                            } else if (e.key === 'Escape') {
                              setInlineEditing(null);
                            }
                          }}
                          autoFocus
                          rows={3}
                          className="w-full px-2 py-1 bg-[#0F0F0F] border border-blue-500 rounded text-sm text-white focus:outline-none resize-none"
                          placeholder="Add notes..."
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-2">
                            <FileText className="w-3.5 h-3.5" />
                            Notes (click to edit)
                          </div>
                          <p className="text-sm text-white">{trade.notes}</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInlineEditStart(trade, 'notes')}
                      className="w-full text-left text-xs text-[#8b949e] hover:text-blue-400 flex items-center gap-1.5 py-2"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      + Add notes
                    </button>
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
                  {/* Unified Stats Row - All States */}
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <div className="text-xs text-[#8b949e]">Entry</div>
                      <div className="text-sm font-semibold">{formatCurrency(item.entryPrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-red-400">Stop</div>
                      <div className="text-sm font-semibold">{formatCurrency(item.stopPrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-green-400">Target</div>
                      <div className="text-sm font-semibold">{formatCurrency(item.targetPrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#8b949e]">Profit</div>
                      <div className="text-sm font-bold text-green-400">{formatCurrency(item.potentialReward)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#8b949e]">Value</div>
                      <div className="text-sm font-semibold">{formatCurrency(item.entryPrice * item.shareSize)}</div>
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
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-blue-500/5 gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                    <div className="px-3 py-1 bg-blue-500/10 rounded-lg shrink-0">
                      <span className="text-lg font-bold text-blue-400">{position.ticker}</span>
                    </div>
                    {/* Long/Short Indicator */}
                    {(() => {
                      const isLong = position.plannedTarget > position.plannedEntry;
                      const isShort = position.plannedTarget < position.plannedEntry;
                      if (!isLong && !isShort) return null;
                      return (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isLong ? '📈 LONG' : '📉 SHORT'}
                        </span>
                      );
                    })()}
                    <div className="flex items-center gap-1.5 text-xs text-[#8b949e] whitespace-nowrap shrink-0">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Closed </span>
                      {formatDate(position.closedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {!isPositionInCalendar(position) && (
                      <>
                        <button
                          onClick={() => handleAddToCalendarClick(position)}
                          className="flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs text-blue-400 hover:text-white hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
                          title="Add to Calendar"
                        >
                          <Plus className="w-3 h-3" />
                          <span className="hidden sm:inline">Add</span>
                        </button>
                        <button
                          onClick={() => handleEditClosedPosition(position)}
                          className="flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs text-blue-400 hover:text-white hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
                          title="Edit position details"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setDeletingPositionId(position.id)}
                      className="flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap"
                      title="Delete from history"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  {/* Unified Stats Row - All States */}
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <div className="text-xs text-[#8b949e]">Entry</div>
                      <div className="text-sm font-semibold">{formatCurrency(position.actualEntry || position.plannedEntry)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-red-400">Stop</div>
                      <div className="text-sm font-semibold">{formatCurrency(position.plannedStop)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-green-400">Target</div>
                      <div className="text-sm font-semibold">{formatCurrency(position.plannedTarget)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#8b949e]">Profit</div>
                      <div className="text-sm font-bold text-green-400">
                        {(() => {
                          const entry = position.actualEntry || position.plannedEntry;
                          const target = position.plannedTarget;
                          const isLong = position.plannedTarget > position.plannedEntry;
                          // For LONG: (target - entry) * shares
                          // For SHORT: (entry - target) * shares (absolute value)
                          const profit = isLong
                            ? (target - entry) * position.actualShares
                            : (entry - target) * position.actualShares;
                          return formatCurrency(profit);
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#8b949e]">Value</div>
                      <div className="text-sm font-semibold">{formatCurrency((position.actualEntry || position.plannedEntry) * position.actualShares)}</div>
                    </div>
                  </div>

                  {/* Exit Info - kept separate for closed positions */}
                  {position.exitPrice && (
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-4">
                      <div className="text-xs text-blue-400 uppercase tracking-wide mb-2">Exit Info</div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-[#8b949e]">Exit Price</div>
                          <div className="text-sm font-semibold">{formatCurrency(position.exitPrice)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#8b949e]">Actual P&L</div>
                          {(() => {
                            // Calculate P&L dynamically (PR #156)
                            const entryPrice = position.actualEntry || position.plannedEntry;
                            const exitPrice = position.exitPrice || position.plannedTarget;
                            const shares = position.actualShares;
                            const isLong = position.plannedTarget > position.plannedEntry;
                            const pnl = isLong
                              ? (exitPrice - entryPrice) * shares
                              : (entryPrice - exitPrice) * shares;
                            return (
                              <div className={`text-sm font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatCurrency(pnl)}
                              </div>
                            );
                          })()}
                        </div>
                        <div>
                          <div className="text-xs text-[#8b949e]">Closed</div>
                          <div className="text-sm text-[#8b949e]">{formatDate(position.closedAt)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {position.notes && (
                    <div className="bg-[#161b22] rounded-lg p-4">
                      <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-2">
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

      {/* Edit Closed Position Modal */}
      <EditClosedPositionModal
        position={editingClosedPosition}
        isOpen={isEditClosedPositionModalOpen}
        onClose={handleCloseEditClosedPositionModal}
        onSave={handleSaveClosedPosition}
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

      {/* Add to Calendar Confirmation Modal */}
      {confirmingAddToCalendar && calendarFormData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-md p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">Add Trade to Calendar</h3>
              <p className="text-sm text-[#8b949e]">
                {confirmingAddToCalendar.ticker} • Edit values before adding
              </p>
            </div>

            {/* Editable Fields */}
            <div className="space-y-4 mb-6">
              {/* Entry Price */}
              <div>
                <label className="block text-xs text-[#8b949e] mb-1.5">Entry Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={calendarFormData.entryPrice}
                  onChange={(e) => handleCalendarFormChange('entryPrice', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Exit Price */}
              <div>
                <label className="block text-xs text-[#8b949e] mb-1.5">Exit Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={calendarFormData.exitPrice}
                  onChange={(e) => handleCalendarFormChange('exitPrice', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Shares */}
              <div>
                <label className="block text-xs text-[#8b949e] mb-1.5">Shares</label>
                <input
                  type="number"
                  step="1"
                  value={calendarFormData.shares}
                  onChange={(e) => handleCalendarFormChange('shares', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Take Profit Level */}
              <div>
                <label className="block text-xs text-[#8b949e] mb-1.5">
                  Take Profit Level <span className="text-[#6e7681]">(optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={calendarFormData.takeProfit}
                  onChange={(e) => handleCalendarFormChange('takeProfit', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Target price"
                />
              </div>

              {/* Live P&L Display */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                <div className="text-xs text-[#8b949e] mb-1">Calculated P&L</div>
                {(() => {
                  const pnl = calculateCalendarPnL();
                  return (
                    <div className={`text-2xl font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(pnl)}
                    </div>
                  );
                })()}
                <div className="text-xs text-[#6e7681] mt-1">
                  Based on edited values above
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmingAddToCalendar(null);
                  setCalendarFormData(null);
                }}
                className="flex-1 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAddToCalendar}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Add to Calendar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
