'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw, X, Star, Download, List, ChevronUp, ChevronDown, Info, SlidersHorizontal } from 'lucide-react';

/** Simple hover tooltip — small single-line label */
function Tip({ label, children, position = 'bottom' }: { label: string; children: React.ReactNode; position?: 'top' | 'bottom' }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 hidden group-hover/tip:block z-50 pointer-events-none`}>
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-[11px] text-[#c9d1d9] whitespace-nowrap shadow-xl">
          {label}
        </div>
      </div>
    </div>
  );
}

/** Hover card showing the active scan criteria */
function CriteriaCard({ criteria, children }: {
  criteria: { label: string; value: string; detail: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="relative group/criteria">
      {children}
      <div className="absolute left-0 top-full mt-2 hidden group-hover/criteria:block z-50 pointer-events-none">
        <div className="w-72 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#0d1117]/60 border-b border-[#30363d]">
            <Activity className="w-3.5 h-3.5 text-[#F97316]" />
            <span className="text-xs font-semibold text-white">Active Scan Criteria</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {criteria.map(({ label, value, detail }) => (
              <div key={label} className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-medium text-[#8b949e] w-16 shrink-0">{label}</span>
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-white block">{value}</span>
                  <span className="text-[10px] text-[#8b949e]">{detail}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-[#30363d] bg-[#0d1117]/40">
            <p className="text-[10px] text-[#8b949e] leading-relaxed">
              Results sorted by gap % by default. Star any ticker to add it to your watchlist.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScanFilters {
  minGap: number;
  minVolume: number;
  minMarketCap: number;
  minPrice: number;
  maxPrice: number;
}

const DEFAULT_FILTERS: ScanFilters = {
  minGap: 2,
  minVolume: 1_000_000,
  minMarketCap: 50_000_000,
  minPrice: 1,
  maxPrice: 1000,
};

interface GapStock {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  gapPercent: number;
  volume: number;
  marketCap: number;
  status: 'gainer' | 'loser';
}

interface GapData {
  gainers: GapStock[];
  losers: GapStock[];
}

interface GapResponse {
  success: boolean;
  data: GapData;
  source: 'live' | 'mock' | 'fallback' | 'polygon' | 'yahoo';
  scanned: number;
  found: number;
  isWeekend?: boolean;
  tradingDate?: string;
  previousDate?: string;
  marketSession?: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  marketStatus?: 'open' | 'closed';
  isPreMarket?: boolean;
  nextMarketOpen?: string | null;
  timestamp: string;
}

type SortCol = 'gap' | 'price' | 'volume' | 'cap';

function filtersToParams(f: ScanFilters): string {
  return new URLSearchParams({
    minGap: String(f.minGap),
    minVolume: String(f.minVolume),
    minMarketCap: String(f.minMarketCap),
    minPrice: String(f.minPrice),
    maxPrice: String(f.maxPrice),
  }).toString();
}

function fmtFilterVol(v: number) {
  return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v);
}
function fmtFilterCap(c: number) {
  return c >= 1e9 ? '$' + (c / 1e9).toFixed(0) + 'B' : '$' + (c / 1e6).toFixed(0) + 'M';
}

export default function GapScannerCard() {
  const [data, setData] = useState<GapData | null>(null);
  const [response, setResponse] = useState<GapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [gainerSort, setGainerSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'gap', dir: 'desc' });
  const [loserSort, setLoserSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'gap', dir: 'desc' });
  const [modalSort, setModalSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'gap', dir: 'desc' });
  const [toast, setToast] = useState<string | null>(null);
  const [addedTickers, setAddedTickers] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('gap-scanner-favorites') : null;
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [tickerIdMap, setTickerIdMap] = useState<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Committed filters (used by auto-refresh)
  const [filters, setFilters] = useState<ScanFilters>(DEFAULT_FILTERS);
  // Draft filters (edited in the panel, applied on "Run Scan")
  const [draft, setDraft] = useState<ScanFilters>(DEFAULT_FILTERS);
  // Ref so the 15s interval always uses the latest committed filters
  const filtersRef = useRef<ScanFilters>(DEFAULT_FILTERS);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    fetchGapData();
    fetchExistingFavorites();
    const interval = setInterval(() => fetchGapData(), 120000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchExistingFavorites = async () => {
    try {
      const res = await fetch('/api/watchlist?userId=default');
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        const tickers: string[] = result.data.map((item: { ticker: string; id: string }) => item.ticker);
        const idMap: Record<string, string> = {};
        result.data.forEach((item: { ticker: string; id: string }) => { idMap[item.ticker] = item.id; });
        setTickerIdMap(idMap);
        setAddedTickers(() => {
          const fresh = new Set<string>(tickers);
          try { localStorage.setItem('gap-scanner-favorites', JSON.stringify([...fresh])); } catch { /* ignore */ }
          return fresh;
        });
      }
    } catch { /* silent */ }
  };

  const fetchGapData = async (overrideFilters?: ScanFilters) => {
    const active = overrideFilters ?? filtersRef.current;
    setLoading(true);
    try {
      let result: GapResponse | null = null;
      const qs = filtersToParams(active);
      try {
        const res = await fetch(`/api/gap-scanner-polygon?${qs}`);
        if (res.ok) { const j: GapResponse = await res.json(); if (j.success) result = j; }
      } catch { /* try yahoo */ }
      if (!result) {
        try {
          const res = await fetch(`/api/gap-scanner-yahoo?${qs}`);
          if (res.ok) { const j: GapResponse = await res.json(); if (j.success) result = j; }
        } catch { /* failed */ }
      }
      if (result?.success) { setData(result.data); setResponse(result); setLastUpdated(new Date()); }
    } catch (e) { console.error('gap fetch error', e); }
    finally { setLoading(false); }
  };

  const runScan = () => {
    setFilters(draft);
    filtersRef.current = draft;
    setShowFilters(false);
    fetchGapData(draft);
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtVol = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(v);
  const fmtCap = (c: number) => c >= 1e12 ? (c/1e12).toFixed(1)+'T' : c >= 1e9 ? (c/1e9).toFixed(1)+'B' : c >= 1e6 ? (c/1e6).toFixed(1)+'M' : String(c);
  const fmtTime = () => !lastUpdated ? '' : lastUpdated.toLocaleString('en-US', { month:'2-digit', day:'2-digit', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true, timeZone:'America/New_York' }).replace(',', ' @');

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const toggleFavorite = async (symbol: string) => {
    if (addedTickers.has(symbol)) {
      const id = tickerIdMap[symbol];
      if (!id) return;
      try {
        const res = await fetch(`/api/watchlist?id=${id}&userId=default`, { method: 'DELETE' });
        if (res.ok) {
          setAddedTickers(prev => {
            const next = new Set(prev);
            next.delete(symbol);
            try { localStorage.setItem('gap-scanner-favorites', JSON.stringify([...next])); } catch { /* ignore */ }
            return next;
          });
          setTickerIdMap(prev => { const next = { ...prev }; delete next[symbol]; return next; });
          showToast(`${symbol} was removed from your Daily Favorites`);
        }
      } catch { /* silent */ }
    } else {
      try {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { ticker: symbol, entryPrice: 0, stopPrice: 0, targetPrice: 0, riskRatio: 2, stopSize: 0, shareSize: 0, potentialReward: 0, positionValue: 0, isFavorite: false }, userId: 'default' }),
        });
        if (res.ok) {
          const result = await res.json();
          const newId: string = result.data?.id;
          setAddedTickers(prev => {
            const next = new Set([...prev, symbol]);
            try { localStorage.setItem('gap-scanner-favorites', JSON.stringify([...next])); } catch { /* ignore */ }
            return next;
          });
          if (newId) setTickerIdMap(prev => ({ ...prev, [symbol]: newId }));
          showToast(`${symbol} added to Daily Favorites!`);
        }
      } catch { /* silent */ }
    }
  };

  const exportToCSV = () => {
    if (!data) return;
    const rows = [
      ['Type','Symbol','Name','Gap %','Price','Prev Close','Volume','Market Cap'],
      ...data.gainers.map(s => ['Gainer',s.symbol,s.name,s.gapPercent.toFixed(2),s.price.toFixed(2),s.previousClose.toFixed(2),s.volume,s.marketCap]),
      ...data.losers.map(s => ['Loser',s.symbol,s.name,s.gapPercent.toFixed(2),s.price.toFixed(2),s.previousClose.toFixed(2),s.volume,s.marketCap]),
    ];
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `gaps-${new Date().toISOString().split('T')[0]}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const dataSource = response?.source || 'mock';
  const isWeekend = response?.isWeekend;

  const sortStocks = (stocks: GapStock[], sort: { col: SortCol; dir: 'asc' | 'desc' }) => [...stocks].sort((a, b) => {
    let av = 0, bv = 0;
    if (sort.col === 'gap') { av = Math.abs(a.gapPercent); bv = Math.abs(b.gapPercent); }
    else if (sort.col === 'price') { av = a.price; bv = b.price; }
    else if (sort.col === 'volume') { av = a.volume; bv = b.volume; }
    else if (sort.col === 'cap') { av = a.marketCap; bv = b.marketCap; }
    return sort.dir === 'desc' ? bv - av : av - bv;
  });

  const allStocks = data ? sortStocks([...data.gainers, ...data.losers], modalSort) : [];

  const toggleGainerSort = (col: SortCol) =>
    setGainerSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  const toggleLoserSort = (col: SortCol) =>
    setLoserSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  const toggleModalSort = (col: SortCol) =>
    setModalSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  const SortIcon = ({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: 'asc' | 'desc' } }) => {
    if (sort.col !== col) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sort.dir === 'desc' ? <ChevronDown className="w-3 h-3 text-[#F97316]" /> : <ChevronUp className="w-3 h-3 text-[#F97316]" />;
  };

  const sessionInfo: Record<string, { label: string; color: string; tooltip: string }> = {
    'pre-market': { label: 'Pre-Market', color: 'text-[#58a6ff]', tooltip: `Overnight gaps — ${response?.previousDate} close → ${response?.tradingDate} open. Opens 9:30 AM EST.` },
    'market-open': { label: 'Market Open', color: 'text-[#238636]', tooltip: `Live gaps from ${response?.tradingDate}. Closes 4:00 PM EST.` },
    'post-market': { label: 'After Hours', color: 'text-[#8b949e]', tooltip: `Post-market. Final gaps from ${response?.tradingDate}. Pre-market resumes 4:00 AM EST.` },
  };
  const session = response?.marketSession ? sessionInfo[response.marketSession] : null;

  // Dynamic criteria for the info hover card
  const activeCriteria = [
    { label: 'Gap', value: `≥ ${filters.minGap}%`, detail: 'vs previous close' },
    { label: 'Volume', value: `≥ ${fmtFilterVol(filters.minVolume)} shares`, detail: 'pre/intraday' },
    { label: 'Mkt Cap', value: `≥ ${fmtFilterCap(filters.minMarketCap)}`, detail: 'Yahoo source only' },
    { label: 'Price', value: `$${filters.minPrice} – $${filters.maxPrice}`, detail: 'filters sub-penny junk' },
    { label: 'Market', value: 'US only', detail: 'NYSE · NASDAQ · AMEX' },
    { label: 'Refresh', value: 'Every 15s', detail: 'during market hours' },
  ];

  const criteriaSubtitle = `${filters.minGap}%+ gap | ${fmtFilterVol(filters.minVolume)}+ vol | ${fmtFilterCap(filters.minMarketCap)}+ cap | $${filters.minPrice}–$${filters.maxPrice}`;

  const numInputClass = 'bg-[#21262d] border border-[#30363d] hover:border-[#8b949e] focus:border-[#F97316] focus:outline-none rounded px-1.5 py-0.5 text-xs text-white text-center transition-colors';

  const StockRow = ({ stock }: { stock: GapStock }) => {
    const isGainer = stock.status === 'gainer';
    const added = addedTickers.has(stock.symbol);
    return (
      <a
        href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
        target="_blank" rel="noopener noreferrer"
        title={stock.name}
        className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-3 py-2 hover:bg-[#21262d] group border-b border-[#30363d] last:border-0 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isGainer
            ? <TrendingUp className="w-3 h-3 text-[#238636] flex-shrink-0" />
            : <TrendingDown className="w-3 h-3 text-[#da3633] flex-shrink-0" />
          }
          <span className="text-xs font-semibold text-white group-hover:text-[#ff6b35] transition-colors truncate">
            {stock.symbol}
          </span>
        </div>
        <span className="text-xs text-[#8b949e] tabular-nums">{fmt(stock.price)}</span>
        <span className="text-xs text-[#8b949e] tabular-nums">{fmtVol(stock.volume)}</span>
        <span className={`text-xs font-semibold tabular-nums w-14 text-right ${isGainer ? 'text-[#238636]' : 'text-[#da3633]'}`}>
          {isGainer ? '+' : ''}{stock.gapPercent.toFixed(2)}%
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(stock.symbol); }}
          className={`transition-colors ${added ? 'text-[#F97316]' : 'text-transparent group-hover:text-[#8b949e] hover:!text-[#F97316]'}`}
          title={added ? 'Remove from Daily Favorites' : 'Add to Daily Favorites'}
        >
          <Star className={`w-3 h-3 ${added ? 'fill-[#F97316]' : ''}`} />
        </button>
      </a>
    );
  };

  return (
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#F97316]/10 rounded-lg">
              <Activity className="w-4 h-4 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white leading-none">Gap Scanner</h2>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[10px] text-[#8b949e]">{criteriaSubtitle}</p>
                <CriteriaCard criteria={activeCriteria}>
                  <Info className="w-3 h-3 text-[#8b949e] hover:text-[#58a6ff] cursor-help transition-colors" />
                </CriteriaCard>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {session && (
              <div className="relative group">
                <span className={`text-[10px] font-medium ${session.color} cursor-help`}>{session.label}</span>
                <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-20 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[10px] text-[#8b949e] w-56 shadow-xl pointer-events-none">
                  {session.tooltip}
                </div>
              </div>
            )}
            {isWeekend && <span className="text-[10px] text-[#d29922]">Weekend</span>}
            {!loading && dataSource === 'polygon' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#58a6ff]/20 text-[#58a6ff]">POLYGON</span>
            )}
            {lastUpdated && !loading && (
              <span className="text-[10px] text-[#238636]">{fmtTime()}</span>
            )}
            {data && !loading && (
              <>
                <Tip label="Export results to CSV" position="bottom">
                  <button onClick={exportToCSV} className="p-1.5 hover:bg-[#30363d] rounded transition-colors">
                    <Download className="w-3.5 h-3.5 text-[#8b949e]" />
                  </button>
                </Tip>
                <Tip label="View full list" position="bottom">
                  <button onClick={() => setShowModal(true)} className="p-1.5 hover:bg-[#30363d] rounded transition-colors">
                    <List className="w-3.5 h-3.5 text-[#8b949e]" />
                  </button>
                </Tip>
              </>
            )}
            <Tip label="Configure filters" position="bottom">
              <button
                onClick={() => { setDraft(filters); setShowFilters(true); }}
                className="p-1.5 hover:bg-[#30363d] rounded transition-colors text-[#8b949e]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </Tip>
            <Tip label="Refresh now" position="bottom">
              <button onClick={() => fetchGapData()} disabled={loading} className="p-1.5 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </Tip>
          </div>
        </div>

        {/* Body */}
        {loading && !data ? (
          <div className="grid grid-cols-2 divide-x divide-[#30363d] flex-1 animate-pulse">
            {['Gainers', 'Losers'].map(label => (
              <div key={label} className="flex flex-col">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#30363d]">
                  <div className="w-3 h-3 rounded-sm bg-[#30363d]" />
                  <div className="h-3 w-16 bg-[#30363d] rounded" />
                </div>
                <div className="px-3 py-1.5 border-b border-[#21262d] grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4">
                  {[40, 28, 24, 32, 12].map((w, i) => (
                    <div key={i} className="h-2.5 bg-[#30363d] rounded" style={{ width: w }} />
                  ))}
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-3 py-2.5 border-b border-[#30363d] last:border-0">
                    <div className="h-3 w-12 bg-[#30363d] rounded" />
                    <div className="h-3 w-10 bg-[#30363d] rounded" />
                    <div className="h-3 w-8 bg-[#30363d] rounded" />
                    <div className="h-3 w-10 bg-[#30363d] rounded" />
                    <div className="h-3 w-3 bg-[#30363d] rounded" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-[#30363d] flex-1 min-h-0">
            {/* Gainers column */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#238636]/5 border-b border-[#30363d] flex-shrink-0">
                <TrendingUp className="w-3 h-3 text-[#238636]" />
                <span className="text-[10px] font-semibold text-[#238636] uppercase tracking-widest">
                  Gainers <span className="text-[#8b949e] font-normal normal-case tracking-normal">({data?.gainers.length ?? 0})</span>
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-3 py-1.5 border-b border-[#21262d] bg-[#0d1117]/30 flex-shrink-0">
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Symbol</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Last</span>
                <button onClick={() => toggleGainerSort('volume')} className="flex items-center gap-0.5 text-[10px] text-[#8b949e] uppercase tracking-wide hover:text-white transition-colors">Vol <SortIcon col="volume" sort={gainerSort} /></button>
                <button onClick={() => toggleGainerSort('gap')} className="flex items-center gap-0.5 text-[10px] text-[#8b949e] uppercase tracking-wide w-14 justify-end hover:text-white transition-colors">Chg% <SortIcon col="gap" sort={gainerSort} /></button>
                <Star className="w-3 h-3 text-[#F97316] fill-[#F97316]" />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '480px' }}>
                {data?.gainers?.length
                  ? sortStocks(data.gainers, gainerSort).map(stock => <StockRow key={stock.symbol} stock={stock} />)
                  : <div className="text-center py-8 text-[#8b949e] text-xs">{isWeekend ? 'Market closed' : 'No gainers matching criteria'}</div>
                }
              </div>
            </div>

            {/* Losers column */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#da3633]/5 border-b border-[#30363d] flex-shrink-0">
                <TrendingDown className="w-3 h-3 text-[#da3633]" />
                <span className="text-[10px] font-semibold text-[#da3633] uppercase tracking-widest">
                  Losers <span className="text-[#8b949e] font-normal normal-case tracking-normal">({data?.losers.length ?? 0})</span>
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-3 py-1.5 border-b border-[#21262d] bg-[#0d1117]/30 flex-shrink-0">
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Symbol</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Last</span>
                <button onClick={() => toggleLoserSort('volume')} className="flex items-center gap-0.5 text-[10px] text-[#8b949e] uppercase tracking-wide hover:text-white transition-colors">Vol <SortIcon col="volume" sort={loserSort} /></button>
                <button onClick={() => toggleLoserSort('gap')} className="flex items-center gap-0.5 text-[10px] text-[#8b949e] uppercase tracking-wide w-14 justify-end hover:text-white transition-colors">Chg% <SortIcon col="gap" sort={loserSort} /></button>
                <Star className="w-3 h-3 text-[#F97316] fill-[#F97316]" />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '480px' }}>
                {data?.losers?.length
                  ? sortStocks(data.losers, loserSort).map(stock => <StockRow key={stock.symbol} stock={stock} />)
                  : <div className="text-center py-8 text-[#8b949e] text-xs">{isWeekend ? 'Market closed' : 'No losers matching criteria'}</div>
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* View All Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#F97316]" />
                <span className="font-semibold text-white">All Gap Stocks</span>
                <span className="text-xs text-[#8b949e] bg-[#0d1117] px-2 py-0.5 rounded">{allStocks.length} tickers</span>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0d1117] border-b border-[#30363d]">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8b949e] font-medium">#</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8b949e] font-medium">Ticker</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleModalSort('gap')}>
                      <span className="flex items-center justify-end gap-1">Gap% <SortIcon col="gap" sort={modalSort} /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleModalSort('price')}>
                      <span className="flex items-center justify-end gap-1">Price <SortIcon col="price" sort={modalSort} /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell" onClick={() => toggleModalSort('volume')}>
                      <span className="flex items-center justify-end gap-1">Vol <SortIcon col="volume" sort={modalSort} /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell" onClick={() => toggleModalSort('cap')}>
                      <span className="flex items-center justify-end gap-1">Mkt Cap <SortIcon col="cap" sort={modalSort} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allStocks.map((stock, i) => (
                    <tr key={stock.symbol} className="border-b border-[#30363d]/50 hover:bg-[#0d1117]/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-[#8b949e]">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {stock.status === 'gainer' ? <TrendingUp className="w-3.5 h-3.5 text-[#238636] flex-shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-[#da3633] flex-shrink-0" />}
                          <div>
                            <span className="font-semibold text-white text-xs">{stock.symbol}</span>
                            {stock.name !== stock.symbol && <p className="text-[10px] text-[#8b949e] truncate max-w-[140px]">{stock.name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-semibold ${stock.status === 'gainer' ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                        {stock.status === 'gainer' ? '+' : ''}{stock.gapPercent.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-white">{fmt(stock.price)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-[#8b949e] hidden sm:table-cell">{fmtVol(stock.volume)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-[#8b949e] hidden sm:table-cell">{stock.marketCap > 0 ? fmtCap(stock.marketCap) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Filter Settings Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowFilters(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-sm flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#F97316]" />
                <span className="font-semibold text-white text-sm">Scan Filters</span>
              </div>
              <button onClick={() => setShowFilters(false)} className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter fields */}
            <div className="px-5 py-4 space-y-4">
              {/* Min Gap */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Min Gap %</p>
                  <p className="text-[11px] text-[#8b949e]">vs previous close</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={0} max={100} step={0.5}
                    value={draft.minGap}
                    onChange={e => setDraft(d => ({ ...d, minGap: parseFloat(e.target.value) || 0 }))}
                    className={`${numInputClass} w-20`}
                  />
                  <span className="text-sm text-[#8b949e]">%</span>
                </div>
              </div>

              {/* Min Volume */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Min Volume</p>
                  <p className="text-[11px] text-[#8b949e]">pre/intraday shares</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={0} step={0.5}
                    value={draft.minVolume / 1e6}
                    onChange={e => setDraft(d => ({ ...d, minVolume: (parseFloat(e.target.value) || 0) * 1e6 }))}
                    className={`${numInputClass} w-20`}
                  />
                  <span className="text-sm text-[#8b949e]">M</span>
                </div>
              </div>

              {/* Min Market Cap */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Min Market Cap</p>
                  <p className="text-[11px] text-[#8b949e]">Yahoo source only</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-[#8b949e]">$</span>
                  <input
                    type="number" min={0} step={10}
                    value={draft.minMarketCap / 1e6}
                    onChange={e => setDraft(d => ({ ...d, minMarketCap: (parseFloat(e.target.value) || 0) * 1e6 }))}
                    className={`${numInputClass} w-20`}
                  />
                  <span className="text-sm text-[#8b949e]">M</span>
                </div>
              </div>

              {/* Price range */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Price Range</p>
                  <p className="text-[11px] text-[#8b949e]">filters sub-penny stocks</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-[#8b949e]">$</span>
                  <input
                    type="number" min={0} step={1}
                    value={draft.minPrice}
                    onChange={e => setDraft(d => ({ ...d, minPrice: parseFloat(e.target.value) || 0 }))}
                    className={`${numInputClass} w-16`}
                  />
                  <span className="text-sm text-[#8b949e]">–</span>
                  <span className="text-sm text-[#8b949e]">$</span>
                  <input
                    type="number" min={0} step={100}
                    value={draft.maxPrice}
                    onChange={e => setDraft(d => ({ ...d, maxPrice: parseFloat(e.target.value) || 0 }))}
                    className={`${numInputClass} w-16`}
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#30363d]">
              <button
                onClick={() => setDraft(DEFAULT_FILTERS)}
                className="text-xs text-[#8b949e] hover:text-white transition-colors"
              >
                Reset to defaults
              </button>
              <button
                onClick={runScan}
                disabled={loading}
                className="flex items-center gap-1.5 bg-[#F97316] hover:bg-[#ea6a0a] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Activity className="w-3.5 h-3.5" />
                Run Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-6 z-[100] bg-[#161b22] border border-[#F97316]/50 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-[#F97316] fill-[#F97316]" />
          {toast}
        </div>
      )}
    </>
  );
}
