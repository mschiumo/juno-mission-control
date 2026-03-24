'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

export interface AccountValuePoint {
  date: string; // YYYY-MM-DD
  value: number; // net liquidating value
  plDay: number;
}

interface AccountValueChartProps {
  data: AccountValuePoint[];
}

export default function AccountValueChart({ data }: AccountValueChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return null;

    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const values = sorted.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const totalChange = latest.value - first.value;
    const totalChangePercent =
      first.value !== 0 ? (totalChange / first.value) * 100 : 0;

    // Build SVG path
    const width = 400;
    const height = 80;
    const padding = 4;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = sorted.map((d, i) => {
      const x = padding + (sorted.length > 1 ? (i / (sorted.length - 1)) * chartW : chartW / 2);
      const y = padding + chartH - ((d.value - min) / range) * chartH;
      return { x, y, ...d };
    });

    const pathD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    // Area fill path
    const areaD =
      pathD +
      ` L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

    return {
      sorted,
      latest,
      first,
      totalChange,
      totalChangePercent,
      points,
      pathD,
      areaD,
      width,
      height,
      min,
      max,
    };
  }, [data]);

  if (!chartData || data.length === 0) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-[#8b949e]" />
          <span className="text-sm font-medium text-[#8b949e]">Account Value</span>
        </div>
        <p className="text-xs text-[#484f58]">
          Import a Position Statement to start tracking account value.
        </p>
      </div>
    );
  }

  const isPositive = chartData.totalChange >= 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#8b949e]" />
          <span className="text-sm font-medium text-[#8b949e]">Account Value</span>
        </div>
        <span className="text-[10px] text-[#484f58]">
          {chartData.sorted.length} snapshot{chartData.sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Current Value */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-2xl font-bold text-white">
          ${chartData.latest.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <div className={`flex items-center gap-1 ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          <span className="text-sm font-semibold">
            {isPositive ? '+' : ''}{chartData.totalChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs">
            ({isPositive ? '+' : ''}{chartData.totalChangePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      {chartData.sorted.length > 1 && (
        <div className="w-full">
          <svg
            viewBox={`0 0 ${chartData.width} ${chartData.height}`}
            className="w-full h-20"
            preserveAspectRatio="none"
          >
            {/* Gradient fill */}
            <defs>
              <linearGradient id="accountValueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isPositive ? '#3fb950' : '#f85149'}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={isPositive ? '#3fb950' : '#f85149'}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>

            {/* Area */}
            <path d={chartData.areaD} fill="url(#accountValueGradient)" />

            {/* Line */}
            <path
              d={chartData.pathD}
              fill="none"
              stroke={isPositive ? '#3fb950' : '#f85149'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dots for each data point */}
            {chartData.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="3"
                fill={isPositive ? '#3fb950' : '#f85149'}
                stroke="#161b22"
                strokeWidth="1.5"
              />
            ))}
          </svg>
        </div>
      )}

      {/* Date range */}
      <div className="flex justify-between mt-2 text-[10px] text-[#484f58]">
        <span>{formatShortDate(chartData.first.date)}</span>
        <span>{formatShortDate(chartData.latest.date)}</span>
      </div>

      {/* Latest day P&L */}
      {chartData.latest.plDay !== 0 && (
        <div className="mt-2 pt-2 border-t border-[#30363d]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8b949e]">Latest Day P&L</span>
            <span className={chartData.latest.plDay >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}>
              {chartData.latest.plDay >= 0 ? '+' : ''}
              ${Math.abs(chartData.latest.plDay).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${parseInt(month)}/${parseInt(day)}`;
}
