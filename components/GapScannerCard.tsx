'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw, X, Star, Download, List, ChevronUp, ChevronDown } from 'lucide-react';

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

export default function GapScannerCard() {
  const [data, setData] = useState<GapData | null>(null);
  const [response, setResponse] = useState<GapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('gap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [toast, setToast] = useState<string | null>(null);
  const [addedTickers, setAddedTickers] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('gap-scanner-favorites') : null;
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [tickerIdMap, setTickerIdMap] = useState<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchGapData();
    fetchExistingFavorites();
    const interval = setInterval(fetchGapData, 15000);
    return () => clearInterval(interval);
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
        // Use DB as source of truth — don't merge with stale localStorage
        setAddedTickers(() => {
          const fresh = new Set<string>(tickers);
          try { localStorage.setItem('gap-scanner-favorites', JSON.stringify([...fresh])); } catch { /* ignore */ }
          return fresh;
        });
      }
    } catch { /* silent */ }
  };

  const fetchGapData = async () => {
    setLoading(true);
    try {
      let result: GapResponse | null = null;
      try {
        const res = await fetch('/api/gap-scanner-polygon');
        if (res.ok) { const j: GapResponse = await res.json(); if (j.success) result = j; }
      } catch { /* try yahoo */ }
      if (!result) {
        try {
          const res = await fetch('/api/gap-scanner-yahoo');
          if (res.ok) { const j: GapResponse = await res.json(); if (j.success) result = j; }
        } catch { /* failed */ }
      }
      if (result?.success) { setData(result.data); setResponse(result); setLastUpdated(new Date()); }
    } catch (e) { console.error('gap fetch error', e); }
    finally { setLoading(false); }
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
      // Remove
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
      // Add
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

  const allStocks = data
    ? [...data.gainers, ...data.losers].sort((a, b) => {
        let av = 0, bv = 0;
        if (sortCol === 'gap') { av = Math.abs(a.gapPercent); bv = Math.abs(b.gapPercent); }
        else if (sortCol === 'price') { av = a.price; bv = b.price; }
        else if (sortCol === 'volume') { av = a.volume; bv = b.volume; }
        else if (sortCol === 'cap') { av = a.marketCap; bv = b.marketCap; }
        return sortDir === 'desc' ? bv - av : av - bv;
      })
    : [];

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-[#F97316]" /> : <ChevronUp className="w-3 h-3 text-[#F97316]" />;
  };

  const sessionInfo: Record<string, { label: string; color: string; tooltip: string }> = {
    'pre-market': { label: 'Pre-Market', color: 'text-[#58a6ff]', tooltip: `Overnight gaps — ${response?.previousDate} close → ${response?.tradingDate} open. Opens 9:30 AM EST.` },
    'market-open': { label: 'Market Open', color: 'text-[#238636]', tooltip: `Live gaps from ${response?.tradingDate}. Closes 4:00 PM EST.` },
    'post-market': { label: 'After Hours', color: 'text-[#8b949e]', tooltip: `Post-market. Final gaps from ${response?.tradingDate}. Pre-market resumes 4:00 AM EST.` },
  };
  const session = response?.marketSession ? sessionInfo[response.marketSession] : null;

  const StockRow = ({ stock }: { stock: GapStock }) => {
    const isGainer = stock.status === 'gainer';
    const added = addedTickers.has(stock.symbol);
    return (
      <a
        href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
        target="_blank" rel="noopener noreferrer"
        title={stock.name}
        className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-2 px-3 py-[6px] hover:bg-[#21262d] group border-b border-[#21262d]/60 last:border-0 transition-colors"
      >
        {/* Symbol */}
        <div className="flex items-center gap-1.5 min-w-0">
          {isGainer
            ? <TrendingUp className="w-3 h-3 text-[#238636] flex-shrink-0" />
            : <TrendingDown className="w-3 h-3 text-[#da3633] flex-shrink-0" />
          }
          <span className="text-xs font-semibold text-white group-hover:text-[#ff6b35] transition-colors truncate">
            {stock.symbol}
          </span>
        </div>
        {/* Price */}
        <span className="text-xs text-[#8b949e] tabular-nums">{fmt(stock.price)}</span>
        {/* Volume */}
        <span className="text-xs text-[#8b949e] tabular-nums">{fmtVol(stock.volume)}</span>
        {/* Gap % */}
        <span className={`text-xs font-semibold tabular-nums w-14 text-right ${isGainer ? 'text-[#238636]' : 'text-[#da3633]'}`}>
          {isGainer ? '+' : ''}{stock.gapPercent.toFixed(2)}%
        </span>
        {/* Star */}
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
              <p className="text-[10px] text-[#8b949e] mt-0.5">2%+ gap | 1M+ vol | $50M+ cap | US</p>
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
            {isWeekend && (
              <span className="text-[10px] text-[#d29922]">Weekend</span>
            )}
            {!loading && dataSource === 'polygon' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#58a6ff]/20 text-[#58a6ff]">POLYGON</span>
            )}
            {lastUpdated && !loading && (
              <span className="text-[10px] text-[#238636]">{fmtTime()}</span>
            )}
            {data && !loading && (
              <>
                <button onClick={exportToCSV} className="p-1.5 hover:bg-[#30363d] rounded transition-colors" title="Export CSV">
                  <Download className="w-3.5 h-3.5 text-[#8b949e]" />
                </button>
                <button onClick={() => setShowModal(true)} className="p-1.5 hover:bg-[#30363d] rounded transition-colors" title="View all">
                  <List className="w-3.5 h-3.5 text-[#8b949e]" />
                </button>
              </>
            )}
            <button onClick={fetchGapData} disabled={loading} className="p-1.5 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-12 text-[#8b949e]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#F97316]" />
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-[#30363d] flex-1 min-h-0">
            {/* Gainers column */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#238636]/5 border-b border-[#30363d] flex-shrink-0">
                <TrendingUp className="w-3 h-3 text-[#238636]" />
                <span className="text-[10px] font-semibold text-[#238636] uppercase tracking-widest">Gainers</span>
                <span className="text-[10px] text-[#8b949e] ml-auto">{data?.gainers.length ?? 0}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-2 px-3 py-1.5 border-b border-[#21262d] bg-[#0d1117]/30 flex-shrink-0">
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Symbol</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Last</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Vol</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide w-14 text-right">Chg%</span>
                <span className="w-3" />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '480px' }}>
                {data?.gainers?.length
                  ? data.gainers.map(stock => <StockRow key={stock.symbol} stock={stock} />)
                  : <div className="text-center py-8 text-[#8b949e] text-xs">{isWeekend ? 'Market closed' : 'No gainers 2%+'}</div>
                }
              </div>
            </div>

            {/* Losers column */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#da3633]/5 border-b border-[#30363d] flex-shrink-0">
                <TrendingDown className="w-3 h-3 text-[#da3633]" />
                <span className="text-[10px] font-semibold text-[#da3633] uppercase tracking-widest">Losers</span>
                <span className="text-[10px] text-[#8b949e] ml-auto">{data?.losers.length ?? 0}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-2 px-3 py-1.5 border-b border-[#21262d] bg-[#0d1117]/30 flex-shrink-0">
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Symbol</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Last</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Vol</span>
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide w-14 text-right">Chg%</span>
                <span className="w-3" />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '480px' }}>
                {data?.losers?.length
                  ? data.losers.map(stock => <StockRow key={stock.symbol} stock={stock} />)
                  : <div className="text-center py-8 text-[#8b949e] text-xs">{isWeekend ? 'Market closed' : 'No losers 2%+'}</div>
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
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('gap')}>
                      <span className="flex items-center justify-end gap-1">Gap% <SortIcon col="gap" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('price')}>
                      <span className="flex items-center justify-end gap-1">Price <SortIcon col="price" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell" onClick={() => toggleSort('volume')}>
                      <span className="flex items-center justify-end gap-1">Vol <SortIcon col="volume" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell" onClick={() => toggleSort('cap')}>
                      <span className="flex items-center justify-end gap-1">Mkt Cap <SortIcon col="cap" /></span>
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
