'use client';

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Minus } from 'lucide-react';

interface TickerData {
  symbol: string;
  label: string;
  price: number;
  changePercent: number;
}

interface FearGreed {
  score: number;
  rating: string;
}

const TICKERS = [
  { symbol: 'SPY', label: 'SPY' },
  { symbol: 'DIA', label: 'DOW' },
  { symbol: 'QQQ', label: 'QQQ' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: 'GLD', label: 'GOLD' },
  { symbol: 'BTC', label: 'BTC' },
  { symbol: 'ETH', label: 'ETH' },
];

function fngColor(score: number): string {
  if (score <= 25) return 'text-red-500';
  if (score <= 45) return 'text-orange-400';
  if (score <= 55) return 'text-yellow-400';
  if (score <= 75) return 'text-green-400';
  return 'text-green-300';
}

function fngLabel(rating: string): string {
  // Shorten for the bar
  if (rating.toLowerCase().includes('extreme fear')) return 'Ext. Fear';
  if (rating.toLowerCase().includes('extreme greed')) return 'Ext. Greed';
  return rating;
}

export default function MarketTickerBar() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
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
      if (json.data?.fearAndGreed) setFearGreed(json.data.fearAndGreed);
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

  const bias = (() => {
    const indices = tickers.filter(t => ['SPY', 'DIA', 'QQQ'].includes(t.symbol));
    const upCount = indices.filter(t => t.changePercent > 0).length;
    const downCount = indices.filter(t => t.changePercent < 0).length;
    if (upCount >= 2) return 'bullish';
    if (downCount >= 2) return 'bearish';
    return 'neutral';
  })();

  const TickerItem = ({ symbol, label, price, changePercent }: TickerData) => {
    const isUp = changePercent >= 0;
    const flash = flashing[symbol];
    return (
      <div className="flex items-center gap-2 px-5 shrink-0">
        <span className="text-sm font-semibold text-[#8b949e] uppercase tracking-wide">{label}</span>
        <span
          className="text-sm font-mono text-white"
          style={flash ? {
            color: flash === 'up' ? '#4ade80' : '#f87171',
            transition: 'color 0.15s ease',
          } : { transition: 'color 0.6s ease' }}
        >
          ${price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : price.toFixed(2)}
        </span>
        <span
          className={`flex items-center gap-0.5 text-sm font-semibold ${isUp ? 'text-green-400' : 'text-red-400'}`}
          style={flash ? {
            textShadow: flash === 'up' ? '0 0 10px #4ade80' : '0 0 10px #f87171',
            transition: 'text-shadow 0.15s ease',
          } : { textShadow: 'none', transition: 'text-shadow 0.6s ease' }}
        >
          {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
        <span className="text-[#30363d] text-sm">·</span>
      </div>
    );
  };

  return (
    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden h-12">
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
      `}</style>

      {loading ? (
        <span className="text-xs text-[#8b949e] animate-pulse px-4">Loading market data...</span>
      ) : (
        <>
          {/* Timestamp — far left */}
          {lastUpdated && (
            <div className="flex items-center gap-1 text-[10px] text-[#484f58] px-3 shrink-0 border-r border-[#30363d] h-full">
              <RefreshCw className="w-2.5 h-2.5" />
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {/* Bias badge — left of carousel */}
          <div className={`flex items-center gap-1 px-3 shrink-0 border-r border-[#30363d] h-full text-xs font-semibold ${
            bias === 'bullish' ? 'text-green-400' :
            bias === 'bearish' ? 'text-red-400' :
            'text-[#8b949e]'
          }`}>
            {bias === 'bullish' && <TrendingUp className="w-3 h-3" />}
            {bias === 'bearish' && <TrendingDown className="w-3 h-3" />}
            {bias === 'neutral' && <Minus className="w-3 h-3" />}
            <span className="capitalize">{bias}</span>
          </div>

          {/* Fear & Greed — left of carousel */}
          {fearGreed && (
            <div className="flex items-center gap-1.5 px-3 shrink-0 border-r border-[#30363d] h-full text-xs font-semibold">
              <span className="text-white font-normal">F&G</span>
              <span className={`${fngColor(fearGreed.score)}`}>{fearGreed.score}</span>
              <span className={`hidden sm:inline text-[10px] font-medium text-white`}>{fngLabel(fearGreed.rating)}</span>
            </div>
          )}

          {/* Carousel — fills remaining space */}
          <div className="relative flex items-center flex-1 overflow-hidden">
            {/* Fade edge where tickers emerge */}
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#0d1117] to-transparent z-10 pointer-events-none" />
            {/* Fade edge where tickers disappear */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0d1117] to-transparent z-10 pointer-events-none" />

            {/* Scrolling marquee — two copies for seamless loop */}
            <div
              className="flex items-center"
              style={{ animation: 'ticker-scroll 28s linear infinite', willChange: 'transform' }}
            >
              {tickers.map((t) => <TickerItem key={t.symbol} {...t} />)}
              {tickers.map((t) => <TickerItem key={`${t.symbol}-2`} {...t} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
