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
  Check,
  RefreshCw,
  Star
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import type { ActiveTrade, ActiveTradeWithPnL } from '@/types/active-trade';
import type { CreateTradeRequest } from '@/types/trading';
import { TradeSide, Strategy } from '@/types/trading';
import type { ClosedPosition } from '@/lib/db/closed-positions';
import EditWatchlistItemModal from './EditWatchlistItemModal';
import EnterPositionModal from './EnterPositionModal';
import EditActiveTradeModal from './EditActiveTradeModal';
import EditClosedPositionModal from './EditClosedPositionModal';

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Custom event names for cross-section sync (kept for backward compatibility)
const EVENTS = {
  WATCHLIST_UPDATED: 'juno:watchlist-updated',
  ACTIVE_TRADES_UPDATED: 'juno:active-trades-updated',
  CLOSED_POSITIONS_UPDATED: 'juno:closed-positions-updated',
} as const;

// Default user ID (can be made dynamic with auth later)
const DEFAULT_USER_ID = 'default';

export default function WatchlistView() {
  // Watchlist (Potential Trades) state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [enteringItem, setEnteringItem] = useState<WatchlistItem | null>(null);
  const [isEnterModalOpen, setIsEnterModalOpen] = useState(false);

  // Active Trades state
  const [activeTrades, setActiveTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [activeTradesLoading, setActiveTradesLoading] = useState(false);
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
  const [closedPositionsLoading, setClosedPositionsLoading] = useState(false);
  const [deletingPositionId, setDeletingPositionId] = useState<string | null>(null);
  
  // Edit Closed Position state
  const [editingClosedPosition, setEditingClosedPosition] = useState<ClosedPosition | null>(null);
  const [isEditClosedPositionModalOpen, setIsEditClosedPositionModalOpen] = useState(false);
  
  // Track which positions have been added to calendar (for UI feedback)
  const [addedToCalendarIds, setAddedToCalendarIds] = useState<Set<string>>(new Set());

  // Drag and Drop state
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'watchlist' | 'active' | 'closed' } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

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

  // Debug: Log watchlist changes
  useEffect(() => {
    console.log('[DEBUG WatchlistView] watchlist state changed:', watchlist.length, 'items');
  }, [watchlist]);

  // ===== API FUNCTIONS =====
  
  // Fetch watchlist from API
  const fetchWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error('Failed to fetch watchlist');
      const result: ApiResponse<WatchlistItem[]> = await response.json();
      if (result.success && result.data) {
        setWatchlist(result.data);
      }
    } catch (err) {
      console.error('Error fetching watchlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch watchlist');
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  // Fetch active trades from API
  const fetchActiveTrades = useCallback(async () => {
    setActiveTradesLoading(true);
    try {
      const response = await fetch(`/api/active-trades?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error('Failed to fetch active trades');
      const result: ApiResponse<ActiveTradeWithPnL[]> = await response.json();
      if (result.success && result.data) {
        setActiveTrades(result.data);
      }
    } catch (err) {
      console.error('Error fetching active trades:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch active trades');
    } finally {
      setActiveTradesLoading(false);
    }
  }, []);

  // Fetch closed positions from API
  const fetchClosedPositions = useCallback(async () => {
    setClosedPositionsLoading(true);
    try {
      const response = await fetch(`/api/closed-positions?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error('Failed to fetch closed positions');
      const result: ApiResponse<ClosedPosition[]> = await response.json();
      if (result.success && result.data) {
        setClosedPositions(result.data);
      }
    } catch (err) {
      console.error('Error fetching closed positions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch closed positions');
    } finally {
      setClosedPositionsLoading(false);
    }
  }, []);

  // Fetch calendar trades to check for duplicates
  const fetchCalendarTrades = useCallback(async () => {
    try {
      setIsLoadingCalendar(true);
      const response = await fetch('/api/trades?limit=1000');
      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.trades && Array.isArray(result.data.trades)) {
          setCalendarTrades(result.data.trades.map((t: { id: string; symbol: string; entryDate: string }) => ({
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

  // Load all data
  const loadAllData = useCallback(async () => {
    await Promise.all([
      fetchWatchlist(),
      fetchActiveTrades(),
      fetchClosedPositions(),
    ]);
  }, [fetchWatchlist, fetchActiveTrades, fetchClosedPositions]);

  // Initial load
  useEffect(() => {
    setMounted(true);
    loadAllData();
    fetchCalendarTrades();
  }, [loadAllData, fetchCalendarTrades]);

  // Listen for custom events (for backward compatibility with other components)
  useEffect(() => {
    const handleWatchlistUpdate = () => fetchWatchlist();
    const handleActiveTradesUpdate = () => fetchActiveTrades();
    const handleClosedPositionsUpdate = () => fetchClosedPositions();

    window.addEventListener(EVENTS.WATCHLIST_UPDATED, handleWatchlistUpdate);
    window.addEventListener(EVENTS.ACTIVE_TRADES_UPDATED, handleActiveTradesUpdate);
    window.addEventListener(EVENTS.CLOSED_POSITIONS_UPDATED, handleClosedPositionsUpdate);
    
    return () => {
      window.removeEventListener(EVENTS.WATCHLIST_UPDATED, handleWatchlistUpdate);
      window.removeEventListener(EVENTS.ACTIVE_TRADES_UPDATED, handleActiveTradesUpdate);
      window.removeEventListener(EVENTS.CLOSED_POSITIONS_UPDATED, handleClosedPositionsUpdate);
    };
  }, [fetchWatchlist, fetchActiveTrades, fetchClosedPositions]);

  // ===== WATCHLIST (Potential Trades) Actions =====
  const handleRemoveFromWatchlist = async (id: string) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?id=${id}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to remove from watchlist');
      
      // Refresh data
      await fetchWatchlist();
      window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item');
    } finally {
      setWatchlistLoading(false);
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

  const handleSave = async (updatedItem: WatchlistItem) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?userId=${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem),
      });
      
      if (!response.ok) throw new Error('Failed to save watchlist item');
      
      await fetchWatchlist();
      window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));
      setIsEditModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setWatchlistLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await handleRemoveFromWatchlist(id);
    setIsEditModalOpen(false);
    setEditingItem(null);
  };

  // ===== FAVORITE TOGGLE (Frontend only - no API call) =====
  const handleToggleFavorite = (item: WatchlistItem) => {
    // Update local state immediately - no API call needed
    setWatchlist(prev => 
      prev.map(i => i.id === item.id ? { ...i, isFavorite: !i.isFavorite } : i)
    );
  };
      
      await fetchWatchlist();
      window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update favorite');
    } finally {
      setWatchlistLoading(false);
    }
  };

  // ===== DRAG AND DROP HANDLERS (Frontend only - no API calls) =====
  const handleDragStart = (e: React.DragEvent, id: string, type: 'watchlist' | 'active' | 'closed') => {
    setDraggedItem({ id, type });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverItem(id);
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string, type: 'watchlist' | 'active' | 'closed') => {
    e.preventDefault();
    setDragOverItem(null);
    
    if (!draggedItem || draggedItem.type !== type || draggedItem.id === targetId) {
      setDraggedItem(null);
      return;
    }

    // Reorder locally only - no API calls
    if (type === 'watchlist') {
      const items = [...watchlist];
      const draggedIndex = items.findIndex(i => i.id === draggedItem.id);
      const targetIndex = items.findIndex(i => i.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      const [removed] = items.splice(draggedIndex, 1);
      items.splice(targetIndex, 0, removed);
      setWatchlist(items);
    } else if (type === 'active') {
      const items = [...activeTrades];
      const draggedIndex = items.findIndex(i => i.id === draggedItem.id);
      const targetIndex = items.findIndex(i => i.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      const [removed] = items.splice(draggedIndex, 1);
      items.splice(targetIndex, 0, removed);
      setActiveTrades(items);
    } else if (type === 'closed') {
      const items = [...closedPositions];
      const draggedIndex = items.findIndex(i => i.id === draggedItem.id);
      const targetIndex = items.findIndex(i => i.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      const [removed] = items.splice(draggedIndex, 1);
      items.splice(targetIndex, 0, removed);
      setClosedPositions(items);
    }
    
    setDraggedItem(null);
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

  const handleConfirmEnterPosition = async (activeTrade: ActiveTrade) => {
    console.log('[DEBUG] handleConfirmEnterPosition called', { watchlistId: activeTrade.watchlistId });

    // Check for duplicate in active trades
    const isDuplicateInActive = activeTrades.some(
      t => t.ticker.toUpperCase() === activeTrade.ticker.toUpperCase()
    );

    if (isDuplicateInActive) {
      setError(`${activeTrade.ticker} is already an active position`);
      return;
    }

    setError(null);
    setActiveTradesLoading(true);
    setWatchlistLoading(true);

    try {
      // 1. Add to active trades
      const response = await fetch(`/api/active-trades?userId=${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeTrade),
      });
      
      if (!response.ok) throw new Error('Failed to add active trade');
      
      console.log('[DEBUG] Active trade saved');

      // 2. Remove from watchlist (if watchlistId exists)
      if (activeTrade.watchlistId) {
        console.log('[DEBUG] Removing from watchlist:', activeTrade.watchlistId);
        const deleteResponse = await fetch(`/api/watchlist?id=${activeTrade.watchlistId}&userId=${DEFAULT_USER_ID}`, {
          method: 'DELETE',
        });
        
        if (!deleteResponse.ok) {
          console.warn('Failed to remove from watchlist, but trade was created');
        }
      }

      // 3. Refresh data
      await Promise.all([fetchActiveTrades(), fetchWatchlist()]);
      
      // 4. Dispatch events
      window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
      window.dispatchEvent(new CustomEvent(EVENTS.WATCHLIST_UPDATED));

      // 5. Close modal
      setIsEnterModalOpen(false);
      setEnteringItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enter position');
    } finally {
      setActiveTradesLoading(false);
      setWatchlistLoading(false);
    }
  };

  // ===== CLOSE: Active → Closed =====
  const handleEndTrade = async (trade: ActiveTrade) => {
    setActiveTradesLoading(true);
    setClosedPositionsLoading(true);
    
    try {
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
        pnl: undefined,
      };

      // 2. Add to closed positions
      const addResponse = await fetch(`/api/closed-positions?userId=${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(closedPosition),
      });
      
      if (!addResponse.ok) throw new Error('Failed to create closed position');

      // 3. Remove from active trades
      const deleteResponse = await fetch(`/api/active-trades?id=${trade.id}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });
      
      if (!deleteResponse.ok) throw new Error('Failed to remove active trade');

      // 4. Refresh data
      await Promise.all([fetchActiveTrades(), fetchClosedPositions()]);

      // 5. Dispatch events
      window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
      window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));

      // 6. Close modal
      setClosingTradeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close trade');
    } finally {
      setActiveTradesLoading(false);
      setClosedPositionsLoading(false);
    }
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

  const handleSaveTrade = async (updatedTrade: ActiveTrade) => {
    setActiveTradesLoading(true);
    try {
      const response = await fetch(`/api/active-trades?id=${updatedTrade.id}&userId=${DEFAULT_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrade),
      });
      
      if (!response.ok) throw new Error('Failed to update active trade');
      
      await fetchActiveTrades();
      window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
      setIsEditTradeModalOpen(false);
      setEditingTrade(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trade');
    } finally {
      setActiveTradesLoading(false);
    }
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

  const handleInlineEditSave = async () => {
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

    const updates: Partial<ActiveTradeWithPnL> = {
      [field]: parsedValue,
    };
    
    if (field === 'actualEntry' || field === 'actualShares') {
      updates.positionValue = newPositionValue;
    }

    setActiveTradesLoading(true);
    try {
      const response = await fetch(`/api/active-trades?id=${tradeId}&userId=${DEFAULT_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) throw new Error('Failed to update trade');
      
      await fetchActiveTrades();
      window.dispatchEvent(new CustomEvent(EVENTS.ACTIVE_TRADES_UPDATED));
      setInlineEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trade');
    } finally {
      setActiveTradesLoading(false);
    }
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

  const handleSaveClosedPosition = async (updatedPosition: ClosedPosition) => {
    setClosedPositionsLoading(true);
    try {
      const response = await fetch(`/api/closed-positions?id=${updatedPosition.id}&userId=${DEFAULT_USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPosition),
      });
      
      if (!response.ok) throw new Error('Failed to update closed position');
      
      await fetchClosedPositions();
      window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));
      setIsEditClosedPositionModalOpen(false);
      setEditingClosedPosition(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update position');
    } finally {
      setClosedPositionsLoading(false);
    }
  };

  // ===== DELETE: Closed Position (permanent) =====
  const handleDeleteClosedPosition = async (positionId: string) => {
    setClosedPositionsLoading(true);
    try {
      const response = await fetch(`/api/closed-positions?id=${positionId}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete closed position');
      
      await fetchClosedPositions();
      window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));
      setDeletingPositionId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete position');
    } finally {
      setClosedPositionsLoading(false);
    }
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
      const deleteResponse = await fetch(`/api/closed-positions?id=${position.id}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });
      
      if (deleteResponse.ok) {
        await fetchClosedPositions();
        window.dispatchEvent(new CustomEvent(EVENTS.CLOSED_POSITIONS_UPDATED));
      }

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

  // Short date format for closed positions: MM/DD
  const formatShortDate = (isoString: string) => {
    const date = new Date(isoString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
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
          <button
            onClick={fetchActiveTrades}
            disabled={activeTradesLoading}
            className="p-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${activeTradesLoading ? 'animate-spin' : ''}`} />
          </button>
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
                draggable
                onDragStart={(e) => handleDragStart(e, trade.id, 'active')}
                onDragOver={(e) => handleDragOver(e, trade.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, trade.id, 'active')}
                className={`bg-[#0F0F0F] border rounded-xl overflow-hidden hover:border-green-500/50 transition-all ${dragOverItem === trade.id ? 'border-green-500 ring-2 ring-green-500/20' : 'border-green-500/30'}`}
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
                      {(() => {
                        // Use unrealized P&L if available from API
                        if (trade.unrealizedPnL !== undefined) {
                          const isProfit = trade.unrealizedPnL >= 0;
                          return (
                            <div className={`text-sm font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(trade.unrealizedPnL)}
                            </div>
                          );
                        }
                        // Otherwise calculate potential profit at target
                        const isLong = trade.plannedTarget > trade.actualEntry;
                        const profit = isLong
                          ? (trade.plannedTarget - trade.actualEntry) * trade.actualShares
                          : (trade.actualEntry - trade.plannedTarget) * trade.actualShares;
                        return (
                          <div className="text-sm font-bold text-green-400">
                            {formatCurrency(profit)}
                          </div>
                        );
                      })()}
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
          <button
            onClick={fetchWatchlist}
            disabled={watchlistLoading}
            className="p-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${watchlistLoading ? 'animate-spin' : ''}`} />
          </button>
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
            {[...watchlist]
              .sort((a, b) => {
                // Favorites first, then by creation date
                if (a.isFavorite && !b.isFavorite) return -1;
                if (!a.isFavorite && b.isFavorite) return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              })
              .map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item.id, 'watchlist')}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item.id, 'watchlist')}
                onClick={() => handleEdit(item)}
                className={`bg-[#0F0F0F] border rounded-xl overflow-hidden hover:border-[#F97316]/50 hover:bg-[#161b22] transition-all cursor-pointer group ${dragOverItem === item.id ? 'border-[#F97316] ring-2 ring-[#F97316]/20' : 'border-[#262626]'}`}
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
                        handleToggleFavorite(item);
                      }}
                      className={`p-2 rounded-lg transition-colors ${item.isFavorite ? 'text-yellow-400 hover:text-yellow-300' : 'text-[#8b949e] hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                      title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
                    </button>
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
          <button
            onClick={fetchClosedPositions}
            disabled={closedPositionsLoading}
            className="p-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${closedPositionsLoading ? 'animate-spin' : ''}`} />
          </button>
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
                draggable
                onDragStart={(e) => handleDragStart(e, position.id, 'closed')}
                onDragOver={(e) => handleDragOver(e, position.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, position.id, 'closed')}
                className={`bg-[#0F0F0F] border rounded-xl overflow-hidden ${dragOverItem === position.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-blue-500/20'}`}
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
                      {formatShortDate(position.closedAt)}
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
                      {(() => {
                        const entry = position.actualEntry || position.plannedEntry;
                        const exit = position.exitPrice ?? position.plannedTarget;
                        const isLong = position.plannedTarget > position.plannedEntry;
                        // For LONG: (exit - entry) * shares
                        // For SHORT: (entry - exit) * shares
                        const profit = isLong
                          ? (exit - entry) * position.actualShares
                          : (entry - exit) * position.actualShares;
                        const isProfit = profit >= 0;
                        return (
                          <div className={`text-sm font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(profit)}
                          </div>
                        );
                      })()}
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
                          <div className="text-sm text-[#8b949e]">{formatShortDate(position.closedAt)}</div>
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
