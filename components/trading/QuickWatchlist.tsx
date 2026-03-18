'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  X,
  Calculator,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';

const DEFAULT_USER_ID = 'default';
const STORAGE_KEY = 'juno:daily-favorites:last-cleared';

type SortField = 'ticker' | 'addedAt' | 'premarket';
type SortDirection = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

interface QuickWatchlistProps {
  onSelectTicker?: (ticker: string) => void;
  onTickerRemoved?: (ticker: string) => void;
  calculatorRef?: React.RefObject<HTMLDivElement | null>;
}

interface SymbolResult {
  symbol: string;
  displaySymbol: string;
  name: string;
  type: string;
}

interface PremarketData {
  symbol: string;
  premarketPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down' | 'unchanged';
}

export default function QuickWatchlist({ 
  onSelectTicker, 
  onTickerRemoved,
  calculatorRef 
}: QuickWatchlistProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [tickerInput, setTickerInput] = useState('');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'addedAt', direction: 'desc' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SymbolResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Premarket data state
  const [premarketData, setPremarketData] = useState<Record<string, PremarketData>>({});

  // Fetch premarket data for watchlist items
  useEffect(() => {
    const fetchPremarketData = async () => {
      if (watchlist.length === 0) return;
      
      const data: Record<string, PremarketData> = {};
      
      await Promise.all(
        watchlist.map(async (item) => {
          try {
            const response = await fetch(`/api/premarket?symbol=${item.ticker}`);
            if (response.ok) {
              const result = await response.json();
              if (result.success) {
                data[item.ticker] = result.data;
              }
            }
          } catch (err) {
            console.error(`Error fetching premarket for ${item.ticker}:`, err);
          }
        })
      );
      
      setPremarketData(data);
    };

    fetchPremarketData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPremarketData, 60000);
    return () => clearInterval(interval);
  }, [watchlist]);

  // Search for symbols (debounced)
  useEffect(() => {
    if (tickerInput.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/symbols/search?q=${encodeURIComponent(tickerInput)}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setSuggestions(result.data);
            setShowSuggestions(result.data.length > 0);
          }
        }
      } catch (err) {
        console.error('Error searching symbols:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [tickerInput]);

  const handleSelectSuggestion = (symbol: string) => {
    setTickerInput(symbol);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[selectedIndex].symbol);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };
  useEffect(() => {
    checkAndClearIfNewDay();
    fetchWatchlist();
  }, []);

  // Check if we need to clear (new trading day)
  const checkAndClearIfNewDay = async () => {
    const lastCleared = localStorage.getItem(STORAGE_KEY);
    const now = new Date();
    const today = now.toDateString();
    
    // If never cleared or last cleared on a different day
    if (!lastCleared || lastCleared !== today) {
      // Clear after 12:00 AM (midnight has passed)
      if (now.getHours() >= 0) {
        await clearAllFavorites();
        localStorage.setItem(STORAGE_KEY, today);
      }
    }
  };

  // Clear all favorites
  const clearAllFavorites = async () => {
    try {
      // Delete all items one by one
      for (const item of watchlist) {
        await fetch(`/api/watchlist?id=${item.id}&userId=${DEFAULT_USER_ID}`, {
          method: 'DELETE',
        });
      }
      setWatchlist([]);
    } catch (err) {
      console.error('Error clearing favorites:', err);
    }
  };

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

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const ticker = tickerInput.trim().toUpperCase();
      
      if (watchlist.some(item => item.ticker === ticker)) {
        setError(`${ticker} is already in watchlist`);
        setIsLoading(false);
        return;
      }

      const newItem: Partial<WatchlistItem> = {
        ticker,
        entryPrice: 0,
        stopPrice: 0,
        targetPrice: 0,
        riskRatio: 2,
        stopSize: 0,
        shareSize: 0,
        potentialReward: 0,
        positionValue: 0,
        isFavorite: false,
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

  const handleBulkImport = async () => {
    if (!importText.trim()) return;
    setImportLoading(true);
    setImportResult(null);

    // Parse: split on whitespace, commas, newlines — keep only valid ticker-looking strings
    const tickers = importText
      .toUpperCase()
      .split(/[\s,\n\r]+/)
      .map(t => t.trim())
      .filter(t => /^[A-Z]{1,5}$/.test(t));

    const unique = [...new Set(tickers)].filter(t => !watchlist.some(w => w.ticker === t));

    if (unique.length === 0) {
      setImportResult('No new tickers to add.');
      setImportLoading(false);
      return;
    }

    let added = 0;
    for (const ticker of unique) {
      try {
        const newItem: Partial<WatchlistItem> = {
          ticker,
          entryPrice: 0,
          stopPrice: 0,
          targetPrice: 0,
          riskRatio: 2,
          stopSize: 0,
          shareSize: 0,
          potentialReward: 0,
          positionValue: 0,
          isFavorite: false,
        };
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: newItem, userId: DEFAULT_USER_ID }),
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setWatchlist(prev => [result.data, ...prev]);
            added++;
          }
        }
      } catch {
        // skip failed individual tickers
      }
    }

    setImportResult(`Added ${added} of ${unique.length} tickers.`);
    setImportText('');
    setImportLoading(false);
  };

  const handleDelete = async (id: string, ticker?: string) => {
    try {
      // Find the item to check if it's a Daily Favorite (0 prices) or Potential Trade
      const item = watchlist.find(w => w.id === id);
      
      // Safety check: Only allow deletion from Daily Favorites if it's ticker-only (0 prices)
      // Potential Trades (with prices > 0) should be deleted from WatchlistView, not here
      if (item && (item.entryPrice > 0 || item.stopPrice > 0 || item.targetPrice > 0)) {
        setError('Cannot delete Potential Trade from Daily Favorites. Use the Watchlist instead.');
        return;
      }
      
      const response = await fetch(`/api/watchlist?id=${id}&userId=${DEFAULT_USER_ID}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      setWatchlist(prev => prev.filter(item => item.id !== id));
      if (ticker) {
        onTickerRemoved?.(ticker);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleSelectTicker = (ticker: string, id: string) => {
    onSelectTicker?.(ticker);
    
    // Scroll to calculator
    if (calculatorRef?.current) {
      calculatorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Remove ticker from favorites (called when moved to potential trades)
  // Only deletes if it's a ticker-only favorite (entryPrice, stopPrice, targetPrice all = 0)
  const removeFromFavorites = useCallback(async (ticker: string) => {
    const item = watchlist.find(w => w.ticker === ticker);
    // Only delete if it's a Daily Favorite (ticker-only, no prices)
    if (item && item.entryPrice === 0 && item.stopPrice === 0 && item.targetPrice === 0) {
      await handleDelete(item.id, ticker);
    }
  }, [watchlist]);

  // Listen for watchlist updates from PositionCalculator
  useEffect(() => {
    const handleWatchlistUpdated = () => {
      fetchWatchlist();
    };
    
    const handleTickerMovedToPotential = (e: CustomEvent<string>) => {
      const ticker = e.detail;
      removeFromFavorites(ticker);
    };
    
    window.addEventListener('juno:watchlist-updated', handleWatchlistUpdated);
    window.addEventListener('juno:ticker-moved-to-potential' as any, handleTickerMovedToPotential);
    return () => {
      window.removeEventListener('juno:watchlist-updated', handleWatchlistUpdated);
      window.removeEventListener('juno:ticker-moved-to-potential' as any, handleTickerMovedToPotential);
    };
  }, [removeFromFavorites]);

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
        prev.map(w => w.id === item.id ? { ...w, isFavorite: !w.isFavorite } : w)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const filteredAndSortedWatchlist = useMemo(() => {
    let filtered = watchlist.filter(item =>
      item.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => {
      let comparison = 0;
      switch (sort.field) {
        case 'ticker': comparison = a.ticker.localeCompare(b.ticker); break;
        case 'premarket': {
          const aData = premarketData[a.ticker];
          const bData = premarketData[b.ticker];
          // Items without premarket data sort to the bottom
          if (!aData && !bData) { comparison = 0; break; }
          if (!aData) { return 1; }
          if (!bData) { return -1; }
          comparison = aData.changePercent - bData.changePercent;
          break;
        }
        case 'addedAt': default:
          comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          break;
      }
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [watchlist, searchQuery, sort, premarketData]);

  const getSortIcon = (field: SortField) => {
    if (sort.field !== field) return <ArrowUpDown className="w-3 h-3 text-[#8b949e]" />;
    return sort.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-[#F97316]" />
      : <ArrowDown className="w-3 h-3 text-[#F97316]" />;
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0d1117]/50 border-b border-[#30363d]">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <span className="text-sm font-semibold text-white">Daily Favorites</span>
          <span className="text-xs text-[#8b949e]">({watchlist.length})</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-[#8b949e]" /> : <ChevronDown className="w-4 h-4 text-[#8b949e]" />}
        </button>
        {isExpanded && (
          <button
            onClick={() => { setShowImport(v => !v); setImportResult(null); }}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${showImport ? 'bg-[#F97316]/20 text-[#F97316]' : 'text-[#8b949e] hover:text-white hover:bg-[#30363d]'}`}
          >
            Import
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Bulk Import Panel */}
          {showImport && (
            <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded-lg space-y-2">
              <p className="text-xs text-[#8b949e]">Paste tickers separated by spaces or new lines (no commas needed)</p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="AAPL TSLA NVDA&#10;MSFT GOOG"
                rows={3}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#F97316] resize-none font-mono"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkImport}
                  disabled={importLoading || !importText.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#F97316] hover:bg-[#ea580c] disabled:bg-[#30363d] disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {importLoading ? <span className="animate-spin">⟳</span> : <Plus className="w-3 h-3" />}
                  {importLoading ? 'Adding...' : 'Add All'}
                </button>
                {importResult && (
                  <span className="text-xs text-[#238636]">{importResult}</span>
                )}
              </div>
            </div>
          )}

          {/* Single row: Ticker input + Add button + Search */}
          <div className="flex gap-2">
            <form onSubmit={handleAddTicker} className="flex gap-2 flex-1 relative">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={tickerInput}
                  onChange={(e) => { setTickerInput(e.target.value.toUpperCase()); setError(null); setSelectedIndex(-1); }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onFocus={() => tickerInput.length >= 1 && suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Enter ticker"
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#F97316]"
                  disabled={isLoading}
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="animate-spin text-xs">⟳</span>
                  </div>
                )}
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.symbol}
                        type="button"
                        onClick={() => handleSelectSuggestion(suggestion.symbol)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          index === selectedIndex 
                            ? 'bg-[#F97316]/20 text-white' 
                            : 'text-[#8b949e] hover:bg-[#0d1117] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{suggestion.symbol}</span>
                          <span className="text-xs text-[#6e7681] truncate max-w-[150px]">{suggestion.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoading || !tickerInput.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-[#F97316] hover:bg-[#ea580c] disabled:bg-[#30363d] disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isLoading ? <span className="animate-spin">⟳</span> : <Plus className="w-4 h-4" />}
                Add
              </button>
            </form>
            
            {/* Search input */}
            <div className="relative w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6e7681]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#6e7681] focus:outline-none focus:border-[#F97316]"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
              <X className="w-4 h-4" /> {error}
            </div>
          )}

          {filteredAndSortedWatchlist.length > 0 ? (
            <div className="border border-[#30363d] rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0d1117] border-b border-[#30363d] text-xs">
                <button onClick={() => handleSort('ticker')} className="col-span-3 flex items-center gap-1 text-[#8b949e] hover:text-white">
                  Ticker {getSortIcon('ticker')}
                </button>
                <div className="col-span-3 text-[#8b949e]">Prev Close</div>
                <button onClick={() => handleSort('premarket')} className="col-span-3 flex items-center gap-1 text-[#8b949e] hover:text-white">
                  Pre-market {getSortIcon('premarket')}
                </button>
                <div className="col-span-3 text-right text-[#8b949e]">Actions</div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredAndSortedWatchlist.map((item) => {
                  const premarket = premarketData[item.ticker];
                  return (
                    <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-[#30363d] last:border-b-0 hover:bg-[#0d1117]/50 transition-colors items-center">
                      <div className="col-span-3 flex items-center gap-2">
                        <button onClick={() => toggleFavorite(item)} className="text-[#8b949e] hover:text-yellow-400 transition-colors">
                          <Star className={`w-3 h-3 ${item.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        </button>
                        <button 
                          onClick={() => handleSelectTicker(item.ticker, item.id)}
                          className="text-sm font-medium text-white hover:text-[#F97316] transition-colors cursor-pointer"
                          title="Click to use in calculator"
                        >
                          {item.ticker}
                        </button>
                      </div>
                      
                      {/* Previous Close */}
                      <div className="col-span-3 text-xs">
                        {premarket ? (
                          <span className="text-[#8b949e]">${premarket.previousClose.toFixed(2)}</span>
                        ) : (
                          <span className="text-[#6e7681]">-</span>
                        )}
                      </div>
                      
                      {/* Premarket Price */}
                      <div className="col-span-3 text-xs">
                        {premarket ? (
                          <div className="flex flex-col">
                            <span className={`font-medium ${premarket.status === 'up' ? 'text-green-400' : premarket.status === 'down' ? 'text-red-400' : 'text-[#8b949e]'}`}>
                              ${premarket.premarketPrice.toFixed(2)}
                            </span>
                            <span className={`text-[10px] ${premarket.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {premarket.change >= 0 ? '+' : ''}{premarket.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#6e7681]">-</span>
                        )}
                      </div>
                      
                      <div className="col-span-3 flex justify-end gap-1">
                        {onSelectTicker && (
                          <button 
                            onClick={() => handleSelectTicker(item.ticker, item.id)} 
                            className="p-1 text-[#8b949e] hover:text-[#F97316] transition-colors" 
                            title="Use in calculator"
                          >
                            <Calculator className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(item.id, item.ticker)} 
                          className="p-1 text-[#8b949e] hover:text-red-400 transition-colors" 
                          title="Remove"
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
              <p className="text-sm">No tickers</p>
              <p className="text-xs mt-1">Enter a ticker to add</p>
            </div>
          ) : (
            <div className="text-center py-6 text-[#8b949e]">
              <p className="text-sm">No matches</p>
            </div>
          )}

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
