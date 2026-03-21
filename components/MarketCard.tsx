'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, RefreshCw, DollarSign, ExternalLink, X, Plus } from 'lucide-react';
import MarketCountdown from './MarketCountdown';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down';
}

interface MarketData {
  indices: MarketItem[];
  stocks: MarketItem[];
  commodities: MarketItem[];
  crypto: MarketItem[];
  forex: MarketItem[];
  lastUpdated: string;
}

type MarketTab = 'indices' | 'stocks' | 'commodities' | 'crypto' | 'forex' | 'sectors';

interface TabCustomization {
  hidden: string[];
  custom: MarketItem[];
}

interface SymbolResult {
  symbol: string;
  displaySymbol: string;
  name: string;
  type: string;
}

type Customization = Record<MarketTab, TabCustomization>;

const defaultCustomization = (): Customization => ({
  indices: { hidden: [], custom: [] },
  stocks: { hidden: [], custom: [] },
  commodities: { hidden: [], custom: [] },
  crypto: { hidden: [], custom: [] },
  forex: { hidden: [], custom: [] },
  sectors: { hidden: [], custom: [] },
});

function loadCustomization(): Customization {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('market-card-customization') : null;
    if (saved) return { ...defaultCustomization(), ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return defaultCustomization();
}

function saveCustomization(c: Customization) {
  try { localStorage.setItem('market-card-customization', JSON.stringify(c)); } catch { /* ignore */ }
}

export default function MarketCard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const getTabFromUrl = useCallback((): MarketTab => {
    const tab = searchParams.get('marketTab');
    if (tab === 'stocks' || tab === 'commodities' || tab === 'crypto' || tab === 'forex' || tab === 'sectors') return tab;
    return 'indices';
  }, [searchParams]);

  const [data, setData] = useState<MarketData | null>(null);
  const [sectorsData, setSectorsData] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTabState] = useState<MarketTab>(getTabFromUrl);
  const [customization, setCustomization] = useState<Customization>(loadCustomization);
  const [showAddInput, setShowAddInput] = useState(false);
  const [addingSymbol, setAddingSymbol] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);
  const [addingError, setAddingError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SymbolResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const addInputRef = useRef<HTMLInputElement>(null);

  const setActiveTab = (tab: MarketTab) => {
    setActiveTabState(tab);
    setShowAddInput(false);
    setAddingSymbol('');
    setAddingError(null);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'indices') {
      params.delete('marketTab');
    } else {
      params.set('marketTab', tab);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    setActiveTabState(getTabFromUrl());
  }, [getTabFromUrl]);

  useEffect(() => {
    fetchMarketData();
    fetchSectorData();
    const interval = setInterval(() => { fetchMarketData(); fetchSectorData(); }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showAddInput) addInputRef.current?.focus();
  }, [showAddInput]);

  // Debounced symbol search
  useEffect(() => {
    if (addingSymbol.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const id = setTimeout(async () => {
      setIsSearching(true);
      try {
        const typeParam = activeTab === 'crypto' ? '&type=crypto' : '';
        const res = await fetch(`/api/symbols/search?q=${encodeURIComponent(addingSymbol)}${typeParam}`);
        if (res.ok) {
          const result = await res.json();
          if (result.success) {
            setSuggestions(result.data);
            setShowSuggestions(result.data.length > 0);
          }
        }
      } catch { /* silent */ } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [addingSymbol]);

  const handleSelectSuggestion = (symbol: string) => {
    setAddingSymbol(symbol);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    addInputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, -1)); return; }
      if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); handleSelectSuggestion(suggestions[selectedIndex].symbol); return; }
      if (e.key === 'Escape') { setShowSuggestions(false); setSelectedIndex(-1); return; }
    }
    if (e.key === 'Enter') addTicker();
    if (e.key === 'Escape') { setShowAddInput(false); setAddingSymbol(''); setAddingError(null); }
  };

  const fetchMarketData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/market-data');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch market data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSectorData = async () => {
    try {
      const res = await fetch('/api/sector-performance');
      const result = await res.json();
      if (result.success) {
        setSectorsData(result.data.map((s: { symbol: string; name: string; price: number; change: number; changePercent: number }) => ({
          ...s,
          status: s.changePercent >= 0 ? 'up' as const : 'down' as const,
        })));
      }
    } catch { /* silent */ }
  };

  const updateCustomization = (updated: Customization) => {
    setCustomization(updated);
    saveCustomization(updated);
  };

  const removeTicker = (symbol: string) => {
    const tabCust = customization[activeTab];
    const isCustom = tabCust.custom.some(c => c.symbol === symbol);
    updateCustomization({
      ...customization,
      [activeTab]: {
        hidden: isCustom ? tabCust.hidden : [...tabCust.hidden, symbol],
        custom: isCustom ? tabCust.custom.filter(c => c.symbol !== symbol) : tabCust.custom,
      },
    });
  };

  const addTicker = async () => {
    const symbol = addingSymbol.trim().toUpperCase();
    if (!symbol) return;
    const tabCust = customization[activeTab];
    const baseItems = activeTab === 'sectors' ? sectorsData : (data?.[activeTab] || []);
    const apiItems = baseItems.filter((i: MarketItem) => !tabCust.hidden.includes(i.symbol));
    const alreadyExists =
      apiItems.some((i: MarketItem) => i.symbol === symbol) ||
      tabCust.custom.some(c => c.symbol === symbol);
    if (alreadyExists) {
      setAddingError(`${symbol} is already in this list`);
      return;
    }
    setAddingLoading(true);
    setAddingError(null);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const result = await res.json();
      if (!result.success || !result.data) {
        setAddingError(result.error || `No data found for "${symbol}"`);
        return;
      }
      updateCustomization({
        ...customization,
        [activeTab]: { ...tabCust, custom: [...tabCust.custom, result.data] },
      });
      setAddingSymbol('');
      setShowAddInput(false);
    } catch {
      setAddingError('Failed to fetch quote. Try again.');
    } finally {
      setAddingLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    // Forex rates (EUR/USD ~1.08, USD/JPY ~149) need 4 decimal places for rates < 10
    const decimals = activeTab === 'forex' ? (price < 10 ? 4 : 2) : (price < 100 ? 2 : 0);
    return new Intl.NumberFormat('en-US', {
      style: activeTab === 'forex' ? 'decimal' : 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(price);
  };

  // Strip -USD suffix (from CoinGecko-sourced custom symbols, e.g. "LINK-USD" → "LINK")
  const cleanCryptoSymbol = (symbol: string) => symbol.replace(/-USD$/, '');

  const getTradingViewSymbol = (symbol: string) => {
    if (activeTab === 'crypto') return `BINANCE:${cleanCryptoSymbol(symbol)}USDT`;
    if (activeTab === 'forex') {
      if (symbol === 'DXY') return 'TVC:DXY';
      return `FX:${symbol.replace('/', '')}`;
    }
    if (activeTab === 'sectors') return `AMEX:${symbol}`;
    return symbol;
  };

  const displaySymbol = (symbol: string) => cleanCryptoSymbol(symbol);

  const tabCust = customization[activeTab];
  const baseItems = activeTab === 'sectors' ? sectorsData : (data?.[activeTab] || []);
  const apiItems = baseItems.filter((i: MarketItem) => !tabCust.hidden.includes(i.symbol));
  const currentData = [...apiItems, ...tabCust.custom];
  const upCount = currentData.filter(i => i.change >= 0).length;
  const downCount = currentData.filter(i => i.change < 0).length;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-lg">
            <DollarSign className="w-5 h-5 text-[#F97316]" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Market</h2>
            <MarketCountdown />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="text-[10px] text-[#8b949e]">
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          )}
          <button
            onClick={fetchMarketData}
            disabled={loading}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Refresh market data"
          >
            <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col min-h-0">
        {/* Tabs + Add button */}
        <div className="flex items-center gap-1 mb-5 flex-shrink-0">
          {(['indices', 'stocks', 'commodities', 'crypto', 'forex', 'sectors'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-[#F97316] text-white'
                  : 'text-[#8b949e] hover:bg-[#30363d] hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          {activeTab !== 'sectors' && <button
            onClick={() => { setShowAddInput(v => !v); setAddingSymbol(''); setAddingError(null); }}
            className={`ml-1 p-1.5 rounded-lg transition-all ${showAddInput ? 'bg-[#F97316] text-white' : 'bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316]/20'}`}
            title="Add ticker"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>}
        </div>

        {/* Inline add input with autocomplete */}
        {showAddInput && (
          <div className="flex flex-col gap-1.5 mb-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={addInputRef}
                  type="text"
                  value={addingSymbol}
                  onChange={e => { setAddingSymbol(e.target.value.toUpperCase()); setAddingError(null); setSelectedIndex(-1); }}
                  onKeyDown={handleInputKeyDown}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onFocus={() => addingSymbol.length >= 1 && suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Search ticker (e.g. AAPL, SPY...)"
                  className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-[#30363d] focus:border-[#F97316]/60 rounded-lg text-white placeholder-[#8b949e] focus:outline-none transition-colors"
                />
                {isSearching && (
                  <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b949e] animate-spin" />
                )}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button
                        key={s.symbol}
                        type="button"
                        onMouseDown={() => handleSelectSuggestion(s.symbol)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          i === selectedIndex
                            ? 'bg-[#F97316]/20 text-white'
                            : 'text-[#8b949e] hover:bg-[#0d1117] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-white">{s.symbol}</span>
                          <span className="text-xs text-[#6e7681] truncate">{s.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={addTicker}
                disabled={addingLoading || !addingSymbol.trim()}
                className="px-3 py-2 text-sm font-medium bg-[#F97316] hover:bg-[#F97316]/80 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center"
              >
                {addingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
              </button>
            </div>
            {addingError && <p className="text-xs text-[#da3633] px-1">{addingError}</p>}
          </div>
        )}

        {/* Stats */}
        {currentData.length > 0 && (
          <div className="flex items-center justify-between mb-4 px-1 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#238636]" />
                <span className="text-xs text-[#8b949e]">{upCount} Up</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#da3633]" />
                <span className="text-xs text-[#8b949e]">{downCount} Down</span>
              </div>
            </div>
            <span className="text-xs text-[#8b949e]">{currentData.length} symbols</span>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="text-center py-8 text-[#8b949e]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#F97316]" />
              <p className="text-sm">Loading market data...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {currentData.map((item) => (
                  <div key={item.symbol} className="relative group/card">
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=${getTradingViewSymbol(item.symbol)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#F97316]/50 transition-all block min-w-0"
                    >
                      <div className="flex items-center justify-between mb-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {item.change >= 0 ? (
                            <TrendingUp className="w-3 h-3 text-[#238636] flex-shrink-0" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-[#da3633] flex-shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-white flex items-center gap-0.5 flex-shrink-0">
                            {displaySymbol(item.symbol)}
                            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${
                          item.change >= 0
                            ? 'bg-[#238636]/20 text-[#238636]'
                            : 'bg-[#da3633]/20 text-[#da3633]'
                        }`}>
                          {item.change >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-[10px] text-[#8b949e] mb-1.5 truncate">{item.name}</p>
                      <div className="flex items-baseline justify-between min-w-0">
                        <span className="text-base font-bold text-white tabular-nums truncate">{formatPrice(item.price)}</span>
                        <span className={`text-[10px] font-medium flex-shrink-0 ml-1 ${item.change >= 0 ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                          {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}
                        </span>
                      </div>
                    </a>
                    {/* Remove button */}
                    <button
                      onClick={() => removeTicker(item.symbol)}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#da3633] text-white items-center justify-center hidden group-hover/card:flex transition-all hover:bg-[#b91c1c]"
                      title={`Remove ${item.symbol}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
