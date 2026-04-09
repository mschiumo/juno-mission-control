'use client';

import { useState } from 'react';
import { Activity, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import type { TickerSmaData, SmaSignal, SmaTimeframe } from '@/types/sma-tracking';
import { TIMEFRAME_CONFIG } from '@/types/sma-tracking';

interface SmaIndicatorProps {
  data: TickerSmaData;
}

function signalIcon(signal: SmaSignal) {
  if (signal.type === 'golden_cross' || signal.type.includes('above')) {
    return <TrendingUp className="w-3 h-3" />;
  }
  return <TrendingDown className="w-3 h-3" />;
}

function signalColor(signal: SmaSignal) {
  if (signal.severity === 'critical') {
    if (signal.type === 'golden_cross' || signal.type.includes('above')) {
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  }
  // warning (approaching)
  return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
}

function signalLabel(signal: SmaSignal): string {
  switch (signal.type) {
    case 'golden_cross':
      return 'Golden Cross';
    case 'death_cross':
      return 'Death Cross';
    case 'crossed_above_sma20':
      return 'Crossed Above 20MA';
    case 'crossed_below_sma20':
      return 'Crossed Below 20MA';
    case 'crossed_above_sma200':
      return 'Crossed Above 200MA';
    case 'crossed_below_sma200':
      return 'Crossed Below 200MA';
    case 'approaching_sma20_from_above':
    case 'approaching_sma20_from_below':
      return 'Near 20MA';
    case 'approaching_sma200_from_above':
    case 'approaching_sma200_from_below':
      return 'Near 200MA';
    default:
      return 'Signal';
  }
}

function formatPrice(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function SmaIndicator({ data }: SmaIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const hasSignals = data.signals.length > 0;

  return (
    <div className="mt-2">
      {/* Signal badges row */}
      {hasSignals && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {data.signals.map((signal, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${signalColor(signal)}`}
              title={signal.description}
            >
              {signalIcon(signal)}
              {signalLabel(signal)} · {TIMEFRAME_CONFIG[signal.timeframe].label}
            </span>
          ))}
        </div>
      )}

      {/* Toggle for detailed SMA table */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1 text-[10px] text-[#8b949e] hover:text-white transition-colors"
      >
        <Activity className="w-3 h-3" />
        MA Data
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-1.5 bg-[#161b22] rounded-lg p-2 text-[11px]">
          <table className="w-full">
            <thead>
              <tr className="text-[#8b949e]">
                <th className="text-left font-medium pb-1">TF</th>
                <th className="text-right font-medium pb-1">Price</th>
                <th className="text-right font-medium pb-1">20 MA</th>
                <th className="text-right font-medium pb-1">200 MA</th>
              </tr>
            </thead>
            <tbody>
              {(['1min', '5min', '15min'] as SmaTimeframe[]).map(tf => {
                const v = data.timeframes[tf];
                return (
                  <tr key={tf} className="border-t border-[#262626]">
                    <td className="py-1 text-[#8b949e]">{TIMEFRAME_CONFIG[tf].label}</td>
                    <td className="py-1 text-right text-white font-medium">{formatPrice(v.currentPrice)}</td>
                    <td className={`py-1 text-right font-medium ${
                      v.currentPrice != null && v.sma20 != null
                        ? v.currentPrice > v.sma20 ? 'text-green-400' : 'text-red-400'
                        : 'text-[#8b949e]'
                    }`}>
                      {formatPrice(v.sma20)}
                    </td>
                    <td className={`py-1 text-right font-medium ${
                      v.currentPrice != null && v.sma200 != null
                        ? v.currentPrice > v.sma200 ? 'text-green-400' : 'text-red-400'
                        : 'text-[#8b949e]'
                    }`}>
                      {formatPrice(v.sma200)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
