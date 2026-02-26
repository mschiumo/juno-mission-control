/**
 * useTradesStorage Hook
 * 
 * Custom hook for managing trades storage via API instead of localStorage.
 * Replaces localStorage-based storage with Redis-backed API calls.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WatchlistItem } from '@/types/watchlist';
import { ActiveTradeWithPnL } from '@/types/active-trade';
import { ClosedPosition } from '@/lib/db/closed-positions';

interface UseTradesStorageOptions {
  userId?: string;
  pollInterval?: number | null; // ms, null to disable polling
}

interface UseTradesStorageReturn {
  // Watchlist
  watchlist: WatchlistItem[];
  watchlistLoading: boolean;
  watchlistError: string | null;
  addWatchlistItem: (item: Omit<WatchlistItem, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
  updateWatchlistItem: (item: WatchlistItem) => Promise<void>;
  removeWatchlistItem: (id: string) => Promise<void>;
  
  // Active Trades
  activeTrades: ActiveTradeWithPnL[];
  activeTradesLoading: boolean;
  activeTradesError: string | null;
  addActiveTrade: (trade: Omit<ActiveTradeWithPnL, 'id' | 'openedAt'> & { id?: string }) => Promise<void>;
  updateActiveTrade: (id: string, updates: Partial<ActiveTradeWithPnL>) => Promise<void>;
  removeActiveTrade: (id: string) => Promise<void>;
  
  // Closed Positions
  closedPositions: ClosedPosition[];
  closedPositionsLoading: boolean;
  closedPositionsError: string | null;
  addClosedPosition: (position: Omit<ClosedPosition, 'id' | 'closedAt'> & { id?: string }) => Promise<void>;
  updateClosedPosition: (id: string, updates: Partial<ClosedPosition>) => Promise<void>;
  removeClosedPosition: (id: string) => Promise<void>;
  
  // Refresh
  refresh: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useTradesStorage(options: UseTradesStorageOptions = {}): UseTradesStorageReturn {
  const { userId = 'default', pollInterval = null } = options;
  
  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  
  // Active trades state
  const [activeTrades, setActiveTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [activeTradesLoading, setActiveTradesLoading] = useState(false);
  const [activeTradesError, setActiveTradesError] = useState<string | null>(null);
  
  // Closed positions state
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [closedPositionsLoading, setClosedPositionsLoading] = useState(false);
  const [closedPositionsError, setClosedPositionsError] = useState<string | null>(null);
  
  // Track if component is mounted
  const isMounted = useRef(true);
  
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Fetch all data
  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return;
    
    setWatchlistLoading(true);
    setActiveTradesLoading(true);
    setClosedPositionsLoading(true);
    
    try {
      // Fetch watchlist
      const watchlistRes = await fetch(`/api/watchlist?userId=${userId}`);
      if (watchlistRes.ok) {
        const watchlistData = await watchlistRes.json();
        if (isMounted.current) {
          setWatchlist(watchlistData.data || []);
        }
      } else {
        throw new Error('Failed to fetch watchlist');
      }
      
      // Fetch active trades
      const activeTradesRes = await fetch(`/api/active-trades?userId=${userId}`);
      if (activeTradesRes.ok) {
        const activeTradesData = await activeTradesRes.json();
        if (isMounted.current) {
          setActiveTrades(activeTradesData.data || []);
        }
      } else {
        throw new Error('Failed to fetch active trades');
      }
      
      // Fetch closed positions
      const closedPositionsRes = await fetch(`/api/closed-positions?userId=${userId}`);
      if (closedPositionsRes.ok) {
        const closedPositionsData = await closedPositionsRes.json();
        if (isMounted.current) {
          setClosedPositions(closedPositionsData.data || []);
        }
      } else {
        throw new Error('Failed to fetch closed positions');
      }
      
      if (isMounted.current) {
        setWatchlistError(null);
        setActiveTradesError(null);
        setClosedPositionsError(null);
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch data';
        setWatchlistError(errorMsg);
        setActiveTradesError(errorMsg);
        setClosedPositionsError(errorMsg);
      }
    } finally {
      if (isMounted.current) {
        setWatchlistLoading(false);
        setActiveTradesLoading(false);
        setClosedPositionsLoading(false);
      }
    }
  }, [userId]);
  
  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  
  // Polling
  useEffect(() => {
    if (!pollInterval) return;
    
    const interval = setInterval(fetchAll, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAll, pollInterval]);
  
  // Watchlist operations
  const addWatchlistItem = useCallback(async (item: Omit<WatchlistItem, 'id' | 'createdAt'> & { id?: string }) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add watchlist item');
      }
      
      // Refresh to get updated list
      await fetchAll();
    } catch (err) {
      setWatchlistError(err instanceof Error ? err.message : 'Failed to add item');
      throw err;
    } finally {
      setWatchlistLoading(false);
    }
  }, [userId, fetchAll]);
  
  const updateWatchlistItem = useCallback(async (item: WatchlistItem) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update watchlist item');
      }
      
      await fetchAll();
    } catch (err) {
      setWatchlistError(err instanceof Error ? err.message : 'Failed to update item');
      throw err;
    } finally {
      setWatchlistLoading(false);
    }
  }, [userId, fetchAll]);
  
  const removeWatchlistItem = useCallback(async (id: string) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?id=${id}&userId=${userId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove watchlist item');
      }
      
      await fetchAll();
    } catch (err) {
      setWatchlistError(err instanceof Error ? err.message : 'Failed to remove item');
      throw err;
    } finally {
      setWatchlistLoading(false);
    }
  }, [userId, fetchAll]);
  
  // Active trades operations
  const addActiveTrade = useCallback(async (trade: Omit<ActiveTradeWithPnL, 'id' | 'openedAt'> & { id?: string }) => {
    setActiveTradesLoading(true);
    try {
      const response = await fetch(`/api/active-trades?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add active trade');
      }
      
      await fetchAll();
    } catch (err) {
      setActiveTradesError(err instanceof Error ? err.message : 'Failed to add trade');
      throw err;
    } finally {
      setActiveTradesLoading(false);
    }
  }, [userId, fetchAll]);
  
  const updateActiveTrade = useCallback(async (id: string, updates: Partial<ActiveTradeWithPnL>) => {
    setActiveTradesLoading(true);
    try {
      const response = await fetch(`/api/active-trades?id=${id}&userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update active trade');
      }
      
      await fetchAll();
    } catch (err) {
      setActiveTradesError(err instanceof Error ? err.message : 'Failed to update trade');
      throw err;
    } finally {
      setActiveTradesLoading(false);
    }
  }, [userId, fetchAll]);
  
  const removeActiveTrade = useCallback(async (id: string) => {
    setActiveTradesLoading(true);
    try {
      const response = await fetch(`/api/active-trades?id=${id}&userId=${userId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove active trade');
      }
      
      await fetchAll();
    } catch (err) {
      setActiveTradesError(err instanceof Error ? err.message : 'Failed to remove trade');
      throw err;
    } finally {
      setActiveTradesLoading(false);
    }
  }, [userId, fetchAll]);
  
  // Closed positions operations
  const addClosedPosition = useCallback(async (position: Omit<ClosedPosition, 'id' | 'closedAt'> & { id?: string }) => {
    setClosedPositionsLoading(true);
    try {
      const response = await fetch(`/api/closed-positions?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(position),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add closed position');
      }
      
      await fetchAll();
    } catch (err) {
      setClosedPositionsError(err instanceof Error ? err.message : 'Failed to add position');
      throw err;
    } finally {
      setClosedPositionsLoading(false);
    }
  }, [userId, fetchAll]);
  
  const updateClosedPosition = useCallback(async (id: string, updates: Partial<ClosedPosition>) => {
    setClosedPositionsLoading(true);
    try {
      const response = await fetch(`/api/closed-positions?id=${id}&userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update closed position');
      }
      
      await fetchAll();
    } catch (err) {
      setClosedPositionsError(err instanceof Error ? err.message : 'Failed to update position');
      throw err;
    } finally {
      setClosedPositionsLoading(false);
    }
  }, [userId, fetchAll]);
  
  const removeClosedPosition = useCallback(async (id: string) => {
    setClosedPositionsLoading(true);
    try {
      const response = await fetch(`/api/closed-positions?id=${id}&userId=${userId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove closed position');
      }
      
      await fetchAll();
    } catch (err) {
      setClosedPositionsError(err instanceof Error ? err.message : 'Failed to remove position');
      throw err;
    } finally {
      setClosedPositionsLoading(false);
    }
  }, [userId, fetchAll]);
  
  return {
    // Watchlist
    watchlist,
    watchlistLoading,
    watchlistError,
    addWatchlistItem,
    updateWatchlistItem,
    removeWatchlistItem,
    
    // Active Trades
    activeTrades,
    activeTradesLoading,
    activeTradesError,
    addActiveTrade,
    updateActiveTrade,
    removeActiveTrade,
    
    // Closed Positions
    closedPositions,
    closedPositionsLoading,
    closedPositionsError,
    addClosedPosition,
    updateClosedPosition,
    removeClosedPosition,
    
    // Refresh
    refresh: fetchAll,
    isLoading: watchlistLoading || activeTradesLoading || closedPositionsLoading,
    error: watchlistError || activeTradesError || closedPositionsError,
  };
}
