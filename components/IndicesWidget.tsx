'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export default function IndicesWidget() {
  const [indices, setIndices] = useState<IndexData[]>([
    { symbol: 'SPY', name: 'S&P 500', price: 0, change: 0, changePercent: 0 },
    { symbol: 'QQQ', name: 'NASDAQ', price: 0, change: 0, changePercent: 0 },
    { symbol: 'IWM', name: 'Russell 2000', price: 0, change: 0, changePercent: 0 },
  ]);
  const [loading, setLoading] = useState(true);

  const fetchIndices = async () => {
    try {
      // Fetch from Finnhub
      const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
      const symbols = ['SPY', 'QQQ', 'IWM'];
      
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
            if (!res.ok) return null;
            const data = await res.json();
            return {
              symbol,
              name: symbol === 'SPY' ? 'S&P 500' : symbol === 'QQQ' ? 'NASDAQ' : 'Russell 2000',
              price: data.c,
              change: data.d,
              changePercent: data.dp
            };
          } catch {
            return null;
          }
        })
      );
      
      const validResults = results.filter((r): r is IndexData => r !== null);
      if (validResults.length > 0) {
        setIndices(validResults);
      }
    } catch (error) {
      console.error('Error fetching indices:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndices();
    const interval = setInterval(fetchIndices, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Market Indices</h3>
        <button 
          onClick={fetchIndices}
          disabled={loading}
          className="p-1 hover:bg-[#30363d] rounded transition-colors"
        >
          <RefreshCw className={`w-3 h-3 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="space-y-2">
        {indices.map((index) => (
          <div key={index.symbol} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">{index.symbol}</p>
              <p className="text-[10px] text-[#8b949e]">{index.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white">${index.price.toFixed(2)}</p>
              <p className={`text-[10px] ${index.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {index.change >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
