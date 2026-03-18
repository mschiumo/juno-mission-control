'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, RefreshCw, Clock, ExternalLink, List, X, ChevronUp, ChevronDown, Download, Star } from 'lucide-react';

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
  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());
  const [confirmTicker, setConfirmTicker] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchGapData();
    const interval = setInterval(fetchGapData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchGapData = async () => {
    setLoading(true);
    try {
      let result: GapResponse | null = null;

      try {
        const polygonRes = await fetch('/api/gap-scanner-polygon');
        if (polygonRes.ok) {
          const json: GapResponse = await polygonRes.json();
          if (json.success) result = json;
        }
      } catch {
        // Polygon unavailable — try Yahoo
      }

      if (!result) {
        try {
          const yahooRes = await fetch('/api/gap-scanner-yahoo');
          if (yahooRes.ok) {
            const json: GapResponse = await yahooRes.json();
            if (json.success) result = json;
          }
        } catch {
          // Yahoo also failed
        }
      }

      if (result && result.success) {
        setData(result.data);
        setResponse(result);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch gap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
    if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
    return volume.toString();
  };

  const formatMarketCap = (cap: number) => {
    if (cap >= 1000000000000) return (cap / 1000000000000).toFixed(1) + 'T';
    if (cap >= 1000000000) return (cap / 1000000000).toFixed(1) + 'B';
    if (cap >= 1000000) return (cap / 1000000).toFixed(1) + 'M';
    return cap.toString();
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York'
    }).replace(',', ' @');
  };

  const addToFavorites = async (symbol: string) => {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: { ticker: symbol, entryPrice: 0, stopPrice: 0, targetPrice: 0, riskRatio: 2, stopSize: 0, shareSize: 0, potentialReward: 0, positionValue: 0, isFavorite: false },
          userId: 'default',
        }),
      });
      if (res.ok) {
        setAddedTickers(prev => new Set([...prev, symbol]));
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast(`${symbol} added to your Daily Favorites!`);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
      }
    } catch {
      // silently fail
    }
  };

  const exportToCSV = () => {
    if (!data) return;
    const rows = [
      ['Type', 'Symbol', 'Name', 'Gap %', 'Price', 'Prev Close', 'Volume', 'Market Cap'],
      ...data.gainers.map(s => ['Gainer', s.symbol, s.name, s.gapPercent.toFixed(2), s.price.toFixed(2), s.previousClose.toFixed(2), s.volume, s.marketCap]),
      ...data.losers.map(s => ['Loser', s.symbol, s.name, s.gapPercent.toFixed(2), s.price.toFixed(2), s.previousClose.toFixed(2), s.volume, s.marketCap]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gap-scanner-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dataSource = response?.source || 'mock';
  const isWeekend = response?.isWeekend;
  const scannedCount = response?.scanned || 0;
  const foundCount = response?.found || 0;

  const allStocks = data
    ? [...data.gainers, ...data.losers].sort((a, b) => {
        let av = 0, bv = 0;
        if (sortCol === 'gap')    { av = Math.abs(a.gapPercent); bv = Math.abs(b.gapPercent); }
        else if (sortCol === 'price')  { av = a.price;     bv = b.price; }
        else if (sortCol === 'volume') { av = a.volume;    bv = b.volume; }
        else if (sortCol === 'cap')    { av = a.marketCap; bv = b.marketCap; }
        return sortDir === 'desc' ? bv - av : av - bv;
      })
    : [];

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-[#F97316]" />
      : <ChevronUp className="w-3 h-3 text-[#F97316]" />;
  };

  const renderStockGrid = (stocks: GapStock[], type: 'gainer' | 'loser') => {
    const isGainer = type === 'gainer';

    if (stocks.length === 0) {
      return (
        <div className="text-center py-6 text-[#8b949e] text-sm col-span-full">
          <p>No {isGainer ? 'gainers' : 'losers'} 2%+</p>
          <p className="text-xs mt-1">
            {isWeekend ? 'Market closed — gaps resume Monday 4 AM EST' : 'Low volatility or pre-market not started'}
          </p>
        </div>
      );
    }

    return stocks.map((stock) => (
      <div
        key={stock.symbol}
        className={`p-2 rounded-lg border transition-all flex flex-col gap-1 ${
          isGainer
            ? 'bg-[#238636]/10 border-[#238636]/30 hover:border-[#238636]/60'
            : 'bg-[#da3633]/10 border-[#da3633]/30 hover:border-[#da3633]/60'
        }`}
      >
        {/* Ticker + star */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            {isGainer
              ? <TrendingUp className="w-3 h-3 text-[#238636] flex-shrink-0" />
              : <TrendingDown className="w-3 h-3 text-[#da3633] flex-shrink-0" />
            }
            <a
              href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-xs text-white hover:text-[#ff6b35] transition-colors truncate"
            >
              {stock.symbol}
            </a>
          </div>
          <button
            onClick={() => !addedTickers.has(stock.symbol) && setConfirmTicker(stock.symbol)}
            title={addedTickers.has(stock.symbol) ? 'Added to Daily Favorites' : 'Add to Daily Favorites'}
            className={`flex-shrink-0 transition-colors ${
              addedTickers.has(stock.symbol) ? 'text-[#F97316] cursor-default' : 'text-[#8b949e] hover:text-[#F97316]'
            }`}
          >
            <Star className={`w-3 h-3 ${addedTickers.has(stock.symbol) ? 'fill-[#F97316]' : ''}`} />
          </button>
        </div>

        {/* Gap % */}
        <div className={`text-sm font-bold leading-none ${isGainer ? 'text-[#238636]' : 'text-[#da3633]'}`}>
          {isGainer ? '+' : ''}{stock.gapPercent.toFixed(2)}%
        </div>

        {/* Price + Volume */}
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-white">{formatPrice(stock.price)}</span>
          <span className="text-[#8b949e]">{formatVolume(stock.volume)}</span>
        </div>
      </div>
    ));
  };

  return (
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F97316]/10 rounded-lg">
              <Activity className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Gap Scanner</h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#8b949e]">2%+ gaps | 1M+ avg vol | $50M+ cap | US only | No ADRs</p>
                {lastUpdated && !loading && (
                  <span className="text-[10px] text-[#238636]">updated {formatLastUpdated()}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!loading && dataSource === 'polygon' && (
              <span className="text-[10px] px-2 py-1 rounded bg-[#58a6ff]/20 text-[#58a6ff]">POLYGON</span>
            )}
            {data && !loading && (
              <button onClick={exportToCSV} className="p-2 hover:bg-[#30363d] rounded-lg transition-colors" title="Export to CSV">
                <Download className="w-4 h-4 text-[#8b949e] hover:text-[#F97316]" />
              </button>
            )}
            {data && !loading && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-[#8b949e] hover:text-white hover:bg-[#30363d] rounded transition-colors"
                title="View full ticker list"
              >
                <List className="w-3 h-3" />
                View All ({allStocks.length})
              </button>
            )}
            <button
              onClick={fetchGapData}
              disabled={loading}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              title="Refresh gap data"
            >
              <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Weekend Banner */}
          {isWeekend && (
            <div className="mb-4 p-3 bg-[#d29922]/10 border border-[#d29922]/30 rounded-lg">
              <div className="flex items-center gap-2 text-[#d29922]">
                <div className="relative group">
                  <Clock className="w-4 h-4 cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-[#8b949e] whitespace-nowrap shadow-xl pointer-events-none">
                    Weekend mode — showing data from {response?.tradingDate}.<br />Next gap scan: Monday 4:00 AM EST
                  </div>
                </div>
                <span className="text-sm font-medium">Market Closed</span>
              </div>
            </div>
          )}

          {/* Pre-Market Banner */}
          {response?.marketSession === 'pre-market' && (
            <div className="mb-4 p-3 bg-[#58a6ff]/10 border border-[#58a6ff]/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#58a6ff]">
                  <div className="relative group">
                    <Clock className="w-4 h-4 cursor-help" />
                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-[#8b949e] whitespace-nowrap shadow-xl pointer-events-none">
                      Showing overnight gaps from {response?.previousDate} close → {response?.tradingDate} open.<br />Market opens at 9:30 AM EST.
                    </div>
                  </div>
                  <span className="text-sm font-medium">Pre-Market Active</span>
                </div>
                {lastUpdated && (
                  <span className="text-[10px] text-[#8b949e]">Last updated: {formatLastUpdated()}</span>
                )}
              </div>
            </div>
          )}

          {/* Market Open Banner */}
          {response?.marketSession === 'market-open' && (
            <div className="mb-4 p-3 bg-[#238636]/10 border border-[#238636]/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#238636]">
                  <div className="relative group">
                    <Clock className="w-4 h-4 cursor-help" />
                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-[#8b949e] whitespace-nowrap shadow-xl pointer-events-none">
                      Live gap data from {response?.tradingDate}.<br />Market closes at 4:00 PM EST.
                    </div>
                  </div>
                  <span className="text-sm font-medium">Market Open</span>
                </div>
                {lastUpdated && (
                  <span className="text-[10px] text-[#8b949e]">Last updated: {formatLastUpdated()}</span>
                )}
              </div>
            </div>
          )}

          {/* After Hours Banner */}
          {response?.marketSession === 'post-market' && (
            <div className="mb-4 p-3 bg-[#8b949e]/10 border border-[#8b949e]/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#8b949e]">
                  <div className="relative group">
                    <Clock className="w-4 h-4 cursor-help" />
                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-[#8b949e] whitespace-nowrap shadow-xl pointer-events-none">
                      Post-market session. Showing final gaps from {response?.tradingDate}.<br />Pre-market resumes at 4:00 AM EST.
                    </div>
                  </div>
                  <span className="text-sm font-medium">After Hours</span>
                </div>
                {lastUpdated && (
                  <span className="text-[10px] text-[#8b949e]">Last updated: {formatLastUpdated()}</span>
                )}
              </div>
            </div>
          )}

          {/* Scan Stats */}
          {response && (dataSource === 'live' || dataSource === 'polygon') && !isWeekend && (
            <div className="mb-4 flex items-center gap-4 text-xs text-[#8b949e]">
              <span>Scanned: <span className="text-white">{scannedCount.toLocaleString()}+ stocks</span></span>
              <span>Found: <span className="text-white">{foundCount} gaps</span></span>
            </div>
          )}

          {loading && !data ? (
            <div className="text-center py-8 text-[#8b949e]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
              Scanning for gaps...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Gainers */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[#238636] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Biggest Gainers
                  </h3>
                  <span className="text-xs text-[#8b949e] bg-[#0d1117] px-2 py-1 rounded">{data?.gainers.length || 0}</span>
                </div>
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="grid grid-cols-4 gap-1.5">
                    {data?.gainers && renderStockGrid(data.gainers, 'gainer')}
                  </div>
                </div>
              </div>

              {/* Losers */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[#da3633] flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" />
                    Biggest Losers
                  </h3>
                  <span className="text-xs text-[#8b949e] bg-[#0d1117] px-2 py-1 rounded">{data?.losers.length || 0}</span>
                </div>
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="grid grid-cols-4 gap-1.5">
                    {data?.losers && renderStockGrid(data.losers, 'loser')}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[#30363d]">
            <p className="text-[10px] text-[#8b949e] text-center">
              US-listed common stocks only • No ADRs/ETFs/warrants • Min 2% gap • 1M+ avg daily volume (90d) • $50M+ market cap
            </p>
          </div>
        </div>
      </div>

      {/* View All Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#F97316]" />
                <span className="font-semibold text-white">All Gap Stocks</span>
                <span className="text-xs text-[#8b949e] bg-[#0d1117] px-2 py-0.5 rounded">{allStocks.length} tickers</span>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0d1117] border-b border-[#30363d]">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8b949e] font-medium w-8">#</th>
                    <th className="text-left px-4 py-2.5 text-xs text-[#8b949e] font-medium">Ticker</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('gap')}>
                      <span className="flex items-center justify-end gap-1">Gap % <SortIcon col="gap" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none" onClick={() => toggleSort('price')}>
                      <span className="flex items-center justify-end gap-1">Price <SortIcon col="price" /></span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#8b949e] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell" onClick={() => toggleSort('volume')}>
                      <span className="flex items-center justify-end gap-1">Volume <SortIcon col="volume" /></span>
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
                        <a
                          href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 group"
                        >
                          {stock.status === 'gainer'
                            ? <TrendingUp className="w-3.5 h-3.5 text-[#238636] flex-shrink-0" />
                            : <TrendingDown className="w-3.5 h-3.5 text-[#da3633] flex-shrink-0" />
                          }
                          <div>
                            <span className="font-semibold text-white group-hover:text-[#ff6b35] transition-colors flex items-center gap-1">
                              {stock.symbol}
                              <ExternalLink className="w-2.5 h-2.5 opacity-40" />
                            </span>
                            {stock.name !== stock.symbol && (
                              <p className="text-[10px] text-[#8b949e] truncate max-w-[140px]">{stock.name}</p>
                            )}
                          </div>
                        </a>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${stock.status === 'gainer' ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                        {stock.status === 'gainer' ? '+' : ''}{stock.gapPercent.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right text-white">{formatPrice(stock.price)}</td>
                      <td className="px-4 py-2.5 text-right text-[#8b949e] hidden sm:table-cell">{formatVolume(stock.volume)}</td>
                      <td className="px-4 py-2.5 text-right text-[#8b949e] hidden sm:table-cell">
                        {stock.marketCap > 0 ? formatMarketCap(stock.marketCap) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Add to Favorites Modal */}
      {confirmTicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmTicker(null)}
        >
          <div
            className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-[#F97316]/10 rounded-lg">
                <Star className="w-5 h-5 text-[#F97316]" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Add to Daily Favorites?</h3>
                <p className="text-xs text-[#8b949e] mt-0.5">
                  {confirmTicker} will appear in your Daily Favorites list
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setConfirmTicker(null)}
                className="px-4 py-2 text-sm text-[#8b949e] hover:text-white hover:bg-[#30363d] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  addToFavorites(confirmTicker);
                  setConfirmTicker(null);
                }}
                className="px-4 py-2 text-sm font-medium bg-[#F97316] hover:bg-[#F97316]/80 text-white rounded-lg transition-colors"
              >
                Add {confirmTicker}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-[#161b22] border border-[#F97316]/50 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-[#F97316] fill-[#F97316]" />
          {toast}
        </div>
      )}
    </>
  );
}
