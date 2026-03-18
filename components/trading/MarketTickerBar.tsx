'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface TickerData {
  symbol: string;
  label: string;
  price: number;
  changePercent: number;
}

const TICKERS = [
  { symbol: 'SPY', label: 'SPY' },
  { symbol: 'DIA', label: 'DOW' },
  { symbol: 'QQQ', label: 'QQQ' },
];

export default function MarketTickerBar() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchData() {
    try {
      const res = await fetch('/api/market-data');
      const json = await res.json();
      if (!json.success) return;

      const indices: { symbol: string; price: number; changePercent: number }[] = json.data?.indices ?? [];
      const result: TickerData[] = TICKERS.map(({ symbol, label }) => {
        const match = indices.find((i) => i.symbol === symbol);
        return {
          symbol,
          label,
          price: match?.price ?? 0,
          changePercent: match?.changePercent ?? 0,
        };
      });

      setTickers(result);
      setLastUpdated(new Date());
    } catch {
      // silently fail — stale data stays displayed
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl">
      {loading ? (
        <span className="text-xs text-[#8b949e] animate-pulse">Loading market data...</span>
      ) : (
        <>
          {tickers.map(({ symbol, label, price, changePercent }) => {
            const isUp = changePercent >= 0;
            return (
              <div key={symbol} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide">{label}</span>
                <span className="text-xs font-mono text-white">
                  ${price.toFixed(2)}
                </span>
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                  {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isUp ? '+' : ''}{changePercent.toFixed(2)}%
                </span>
                <span className="text-[#30363d] text-xs last:hidden">·</span>
              </div>
            );
          })}
          {lastUpdated && (
            <div className="ml-auto flex items-center gap-1 text-[10px] text-[#484f58]">
              <RefreshCw className="w-2.5 h-2.5" />
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
