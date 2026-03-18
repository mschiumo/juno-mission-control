'use client';

import { useEffect, useRef, useState } from 'react';
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
  { symbol: 'GLD', label: 'GOLD' },
  { symbol: 'BTC', label: 'BTC' },
];

export default function MarketTickerBar() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [flashing, setFlashing] = useState<Record<string, 'up' | 'down'>>({});
  const prevValues = useRef<Record<string, number>>({});

  async function fetchData() {
    try {
      const res = await fetch('/api/market-data');
      const json = await res.json();
      if (!json.success) return;

      const allItems = [
        ...(json.data?.indices ?? []),
        ...(json.data?.commodities ?? []),
        ...(json.data?.crypto ?? []),
      ] as { symbol: string; price: number; changePercent: number }[];

      const result: TickerData[] = TICKERS.map(({ symbol, label }) => {
        const match = allItems.find((i) => i.symbol === symbol);
        return {
          symbol,
          label,
          price: match?.price ?? 0,
          changePercent: match?.changePercent ?? 0,
        };
      });

      // Detect changed values and trigger flash animation
      const newFlashing: Record<string, 'up' | 'down'> = {};
      result.forEach(({ symbol, changePercent }) => {
        const prev = prevValues.current[symbol];
        if (prev !== undefined && prev !== changePercent) {
          newFlashing[symbol] = changePercent > prev ? 'up' : 'down';
        }
        prevValues.current[symbol] = changePercent;
      });

      if (Object.keys(newFlashing).length > 0) {
        setFlashing(newFlashing);
        setTimeout(() => setFlashing({}), 900);
      }

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

  const TickerItem = ({ symbol, label, price, changePercent }: TickerData) => {
    const isUp = changePercent >= 0;
    const flash = flashing[symbol];
    return (
      <div className="flex items-center gap-2 px-5 shrink-0">
        <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide">{label}</span>
        <span
          className="text-xs font-mono text-white"
          style={flash ? {
            color: flash === 'up' ? '#4ade80' : '#f87171',
            transition: 'color 0.15s ease',
          } : { transition: 'color 0.6s ease' }}
        >
          ${price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : price.toFixed(2)}
        </span>
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-green-400' : 'text-red-400'}`}
          style={flash ? {
            textShadow: flash === 'up' ? '0 0 10px #4ade80' : '0 0 10px #f87171',
            transition: 'text-shadow 0.15s ease',
          } : { textShadow: 'none', transition: 'text-shadow 0.6s ease' }}
        >
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
        <span className="text-[#30363d] text-xs">·</span>
      </div>
    );
  };

  return (
    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden h-10">
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {loading ? (
        <span className="text-xs text-[#8b949e] animate-pulse px-4">Loading market data...</span>
      ) : (
        <div className="relative flex items-center flex-1 overflow-hidden">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0d1117] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-16 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0d1117] to-transparent z-10 pointer-events-none" />

          {/* Scrolling marquee — two copies for seamless loop */}
          <div
            className="flex items-center"
            style={{ animation: 'ticker-scroll 28s linear infinite', willChange: 'transform' }}
          >
            {tickers.map((t) => <TickerItem key={t.symbol} {...t} />)}
            {tickers.map((t) => <TickerItem key={`${t.symbol}-2`} {...t} />)}
          </div>

          {/* Timestamp pinned to right */}
          {lastUpdated && (
            <div className="absolute right-2 z-10 flex items-center gap-1 text-[10px] text-[#484f58] bg-[#0d1117] pl-2">
              <RefreshCw className="w-2.5 h-2.5" />
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
