'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Star,
  TrendingUp,
  TrendingDown,
  X,
  Calculator
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';

const DEFAULT_USER_ID = 'default';

type SortField = 'ticker' | 'entryPrice' | 'targetPrice' | 'addedAt';
type SortDirection = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

interface QuickWatchlistProps {
  onSelectTicker?: (ticker: string) => void;
}

export default function QuickWatchlist({ onSelectTicker }: QuickWatchlistProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [tickerInput, setTickerInput] = useState('');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'addedAt', direction: 'desc' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch watchlist on mount
  useEffect(() => {
    fetchWatchlist();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const response = await fetch(`/api/watchlist?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error('Failed to fetch watchlist');
      const result = await response.json();
      setWatchlist(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlist');
    }
  };

  // Add new ticker
  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const ticker = tickerInput.trim().toUpperCase();
      
      // Check for duplicates
      if (watchlist.some(item => item.ticker === ticker)) {
        setError(`${ticker} is already in watchlist`);
        setIsLoading(false);
        return;
      }

      // Create new watchlist item with default values
      const newItem: Partial<WatchlistItem> = {
        ticker,
        entryPrice: 0,
        stopPrice: 0,
        targetPrice: 0,
        strategy: 'DAY_TRADE',
        isFavorite: false,
        notes: '',
      };

      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: newItem, userId: DEFAULT_USER_ID }),
      });

      if (!response.ok) throw new Error('Failed to add ticker');
      
      const result = await response.json();
      if (result.success) {
        setWatchlist(prev => [result.data, ...prev]);
        setTickerInput('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add ticker');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete item
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/watchlist?id=${id}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');
      
      setWatchlist(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // Toggle favorite
  const toggleFavorite = async (item: WatchlistItem) => {
    try {
      const response = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          updates: { isFavorite: !item.isFavorite },
          userId: DEFAULT_USER_ID,
        }),
      });

      if (!response.ok) throw new Error('Failed to update');
      
      setWatchlist(prev =>
        prev.map(w =>
          w.id === item.id ? { ...w, isFavorite: !w.isFavorite } : w
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  // Handle sort
  const handleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Filtered and sorted watchlist
  const filteredAndSortedWatchlist = useMemo(() => {
    let filtered = watchlist.filter(item =>
      item.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sort.field) {
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
        case 'entryPrice':
          comparison = (a.entryPrice || 0) - (b.entryPrice || 0);
          break;
        case 'targetPrice':
          comparison = (a.targetPrice || 0) - (b.targetPrice || 0);
          break;
        case 'addedAt':
        default:
          comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          break;
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [watchlist, searchQuery, sort]);

  const getSortIcon = (field: SortField) => {
    if (sort.field !== field) return <ArrowUpDown className="w-3 h-3 text-[#8b949e]" />;
    return sort.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-[#F97316]" />
      : <ArrowDown className="w-3 h-3 text-[#F97316]" />;
  };

  // Determine trade side
  const getTradeSide = (item: WatchlistItem): 'long' | 'short' | 'neutral' => {
    if (!item.targetPrice || !item.entryPrice) return 'neutral';
    return item.targetPrice > item.entryPrice ? 'long' : 'short';
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0d1117]/50 border-b border-[#30363d] hover:bg-[#0d1117] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Daily Favorites</span>
          <span className="text-xs text-[#8b949e]">({watchlist.length})</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-[#8b949e]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#8b949e]" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Add Ticker Form */}
          <form onSubmit={handleAddTicker} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => {
                  setTickerInput(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="Enter ticker (e.g., AAPL)"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#F97316]"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !tickerInput.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-[#F97316] hover:bg-[#ea580c] disabled:bg-[#30363d] disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isLoading ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
              <X className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e7681]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search watchlist..."
              className="w-full pl-9 pr-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#F97316]"
            />
          </div>

          {/* Watchlist Table */}
          {filteredAndSortedWatchlist.length > 0 ? (
            <div className="border border-[#30363d] rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0d1117] border-b border-[#30363d] text-xs">
                <button
                  onClick={() => handleSort('ticker')}
                  className="col-span-3 flex items-center gap-1 text-[#8b949e] hover:text-white transition-colors"
                >
                  Ticker {getSortIcon('ticker')}
                </button>
                <button
                  onClick={() => handleSort('entryPrice')}
                  className="col-span-2 flex items-center gap-1 text-[#8b949e] hover:text-white transition-colors"
                >
                  Entry {getSortIcon('entryPrice')}
                </button>
                <button
                  onClick={() => handleSort('targetPrice')}
                  className="col-span-2 flex items-center gap-1 text-[#8b949e] hover:text-white transition-colors"
                >
                  Target {getSortIcon('targetPrice')}
                </button>
                <div className="col-span-2 text-[#8b949e]">Side</div>
                <div className="col-span-3 text-right text-[#8b949e]">Actions</div>
              </div>

              {/* Table Body */}
              <div className="max-h-64 overflow-y-auto">
                {filteredAndSortedWatchlist.map((item) => {
                  const side = getTradeSide(item);
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-[#30363d] last:border-b-0 hover:bg-[#0d1117]/50 transition-colors"
                    >
                      {/* Ticker with Favorite */}
                      <div className="col-span-3 flex items-center gap-1">
                        <button
                          onClick={() => toggleFavorite(item)}
                          className="text-[#8b949e] hover:text-yellow-400 transition-colors"
                        >
                          <Star
                            className={`w-3 h-3 ${
                              item.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''
                            }`}
                          />
                        </button>
                        <span className="text-sm font-medium text-white">
                          {item.ticker}
                        </span>
                      </div>

                      {/* Entry Price */}
                      <div className="col-span-2 text-sm text-[#8b949e]">
                        {item.entryPrice > 0 ? `$${item.entryPrice.toFixed(2)}` : '-'}
                      </div>

                      {/* Target Price */}
                      <div className="col-span-2 text-sm text-[#8b949e]">
                        {item.targetPrice > 0 ? `$${item.targetPrice.toFixed(2)}` : '-'}
                      </div>

                      {/* Side */}
                      <div className="col-span-2">
                        {side === 'long' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded">
                            <TrendingUp className="w-3 h-3" />
                            Long
                          </span>
                        )}
                        {side === 'short' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded">
                            <TrendingDown className="w-3 h-3" />
                            Short
                          </span>
                        )}
                        {side === 'neutral' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#30363d] text-[#8b949e] text-xs rounded">
                            -
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-3 flex justify-end gap-1">
                        {onSelectTicker && (
                          <button
                            onClick={() => onSelectTicker(item.ticker)}
                            className="p-1 text-[#8b949e] hover:text-[#F97316] transition-colors"
                            title="Use in calculator"
                          >
                            <Calculator className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 text-[#8b949e] hover:text-red-400 transition-colors"
                          title="Remove from watchlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="text-center py-6 text-[#8b949e]">
              <p className="text-sm">No tickers in watchlist</p>
              <p className="text-xs mt-1">Enter a ticker above to add</p>
            </div>
          ) : (
            <div className="text-center py-6 text-[#8b949e]">
              <p className="text-sm">No matches found</p>
            </div>
          )}

          {/* Summary */}
          {watchlist.length > 0 && (
            <div className="flex items-center justify-between text-xs text-[#8b949e] pt-2 border-t border-[#30363d]">
              <span>Total: {watchlist.length}</span>
              <span>Favorites: {watchlist.filter(i => i.isFavorite).length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
