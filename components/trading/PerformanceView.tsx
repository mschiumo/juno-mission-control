'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  BarChart3,
  Calendar,
  Loader2,
} from 'lucide-react';

type Period = 'week' | 'month' | 'year' | 'all';

interface DailySummary {
  date: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  netPnL: number;
}

interface StatsMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  averageTrade: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  currentWinStreak: number;
  maxWinStreak: number;
  currentLossStreak: number;
  maxLossStreak: number;
}

interface AnalyticsData {
  overview: {
    totalTrades: number;
    closedTrades: number;
    totalPnL: number;
    winRate: number;
    wins: number;
    losses: number;
    avgPnLPerTrade: number;
  };
  byStrategy: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
  byDayOfWeek: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
}

interface EquityCurvePoint {
  date: string;
  label: string;
  cumPnL: number;
}

function formatCurrency(val: number): string {
  const abs = Math.abs(val);
  const formatted = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(0)}`;
  return val < 0 ? `-${formatted}` : `+${formatted}`;
}

function formatDollars(val: number): string {
  return val < 0
    ? `-$${Math.abs(val).toFixed(2)}`
    : `$${val.toFixed(2)}`;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Past Week',
  month: 'Past Month',
  year: 'Past Year',
  all: 'All Time',
};

export default function PerformanceView() {
  const [period, setPeriod] = useState<Period>('all');
  const [metrics, setMetrics] = useState<StatsMetrics | null>(null);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const statsUrl = `/api/trades/stats?period=${period}`;
    const analyticsUrl = '/api/trades/analytics';

    Promise.all([
      fetch(statsUrl).then((r) => r.json()),
      fetch(analyticsUrl).then((r) => r.json()),
    ])
      .then(([statsRes, analyticsRes]) => {
        if (statsRes.success && statsRes.data) {
          setMetrics(statsRes.data.metrics);
          setDailySummaries(statsRes.data.dailySummaries || []);
        }
        if (analyticsRes.success && analyticsRes.analytics) {
          setAnalytics(analyticsRes.analytics);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  // Build equity curve data from daily summaries (sorted chronologically)
  const equityCurve = useMemo<EquityCurvePoint[]>(() => {
    if (!dailySummaries.length) return [];

    const sorted = [...dailySummaries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let cumulative = 0;
    return sorted.map((d) => {
      cumulative += d.netPnL;
      const dt = new Date(d.date + 'T12:00:00');
      return {
        date: d.date,
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cumPnL: Number(cumulative.toFixed(2)),
      };
    });
  }, [dailySummaries]);

  // Day of week performance
  const dayOfWeekData = useMemo(() => {
    if (!analytics?.byDayOfWeek) return [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days
      .filter((d) => analytics.byDayOfWeek[d])
      .map((day) => {
        const d = analytics.byDayOfWeek[day];
        return {
          name: day.slice(0, 3),
          pnl: Number(d.pnl.toFixed(2)),
          trades: d.trades,
          winRate: d.wins + d.losses > 0
            ? Number(((d.wins / (d.wins + d.losses)) * 100).toFixed(1))
            : 0,
        };
      });
  }, [analytics]);

  const totalPnL = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].cumPnL : 0;
  const isPositive = totalPnL >= 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#F97316] animate-spin" />
      </div>
    );
  }

  if (!metrics || metrics.totalTrades === 0) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
        <BarChart3 className="w-12 h-12 text-[#F97316] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Trade Data Yet</h3>
        <p className="text-[#8b949e]">
          Start logging trades to see your equity curve and performance analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Performance</h2>
          <p className="text-sm text-[#8b949e]">Track your account growth over time</p>
        </div>
        <div className="flex items-center gap-1 bg-[#0d1117] rounded-lg p-1 border border-[#30363d]">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-[#F97316] text-white'
                  : 'text-[#8b949e] hover:text-white hover:bg-[#30363d]'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Equity Curve Card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#30363d] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">Equity Curve</p>
            <p className="text-xs text-[#8b949e]">Account Growth &mdash; {PERIOD_LABELS[period]}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xl font-bold ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {formatCurrency(totalPnL)}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {equityCurve.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={isPositive ? '#3fb950' : '#f85149'}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor={isPositive ? '#3fb950' : '#f85149'}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#8b949e', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#30363d' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#8b949e', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#30363d' }}
                  tickFormatter={(v: number) => `$${v >= 0 ? '' : '-'}${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}k` : Math.abs(v).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#f0f6fc',
                    border: '1px solid #d0d7de',
                    borderRadius: '8px',
                    color: '#1f2328',
                  }}
                  itemStyle={{ color: '#1f2328' }}
                  labelStyle={{ color: '#656d76', fontWeight: 600 }}
                  formatter={(value) => [formatDollars(Number(value)), 'Cumulative P&L']}
                  labelFormatter={(label) => String(label)}
                />
                <Area
                  type="monotone"
                  dataKey="cumPnL"
                  stroke={isPositive ? '#3fb950' : '#f85149'}
                  strokeWidth={2.5}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-[#8b949e] text-sm">
              Not enough data to display the equity curve for this period.
            </div>
          )}
        </div>

        {/* Bottom stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#30363d] border-t border-[#30363d]">
          {[
            { label: 'Total Trades', value: String(metrics.totalTrades) },
            { label: 'Win Rate', value: `${metrics.winRate}%` },
            { label: 'Avg Win', value: `+$${metrics.averageWin.toFixed(0)}` },
            { label: 'Avg Loss', value: `-$${metrics.averageLoss.toFixed(0)}` },
          ].map((s) => (
            <div key={s.label} className="px-3 py-3 text-center">
              <p className="text-[10px] text-[#8b949e] mb-0.5">{s.label}</p>
              <p className="text-sm font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<TrendingUp className="w-5 h-5 text-[#3fb950]" />}
          label="Net Profit"
          value={formatDollars(metrics.netProfit)}
          valueColor={metrics.netProfit >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}
        />
        <MetricCard
          icon={<Target className="w-5 h-5 text-[#F97316]" />}
          label="Profit Factor"
          value={metrics.profitFactor === Infinity ? '--' : metrics.profitFactor.toFixed(2)}
        />
        <MetricCard
          icon={<TrendingDown className="w-5 h-5 text-[#f85149]" />}
          label="Max Drawdown"
          value={formatDollars(metrics.maxDrawdown)}
          sub={metrics.maxDrawdownPercent > 0 ? `${metrics.maxDrawdownPercent.toFixed(1)}%` : undefined}
        />
        <MetricCard
          icon={<Trophy className="w-5 h-5 text-[#d2a8ff]" />}
          label="Best Streak"
          value={`${metrics.maxWinStreak} wins`}
          sub={metrics.currentWinStreak > 0 ? `Current: ${metrics.currentWinStreak}` : undefined}
        />
      </div>

      {/* Detailed Statistics + Day of Week side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Detailed stats table */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#30363d]">
            <p className="text-sm font-semibold text-white">Detailed Statistics</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#30363d]">
            {[
              { label: 'Total Trades', value: String(metrics.totalTrades) },
              { label: 'Winning Trades', value: String(metrics.winningTrades) },
              { label: 'Losing Trades', value: String(metrics.losingTrades) },
              { label: 'Breakeven', value: String(metrics.breakevenTrades) },
              { label: 'Gross Profit', value: formatDollars(metrics.grossProfit), color: 'text-[#3fb950]' },
              { label: 'Gross Loss', value: formatDollars(metrics.grossLoss), color: 'text-[#f85149]' },
              { label: 'Largest Win', value: formatDollars(metrics.largestWin), color: 'text-[#3fb950]' },
              { label: 'Largest Loss', value: formatDollars(metrics.largestLoss), color: 'text-[#f85149]' },
              { label: 'Avg Trade', value: formatDollars(metrics.averageTrade), color: metrics.averageTrade >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]' },
              { label: 'Max Win Streak', value: String(metrics.maxWinStreak) },
              { label: 'Max Loss Streak', value: String(metrics.maxLossStreak) },
              { label: 'Current Streak', value: metrics.currentWinStreak > 0 ? `${metrics.currentWinStreak}W` : metrics.currentLossStreak > 0 ? `${metrics.currentLossStreak}L` : '--' },
            ].map((s) => (
              <div key={s.label} className="bg-[#161b22] px-6 py-3 flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">{s.label}</span>
                <span className={`text-sm font-semibold ${s.color || 'text-white'}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Day of Week Performance */}
        {dayOfWeekData.length > 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#30363d]">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#F97316]" />
                <p className="text-sm font-semibold text-white">Day of Week</p>
              </div>
              <p className="text-xs text-[#8b949e]">Performance by weekday</p>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dayOfWeekData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#30363d' }}
                  />
                  <YAxis
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#30363d' }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#f0f6fc',
                      border: '1px solid #d0d7de',
                      borderRadius: '8px',
                      color: '#1f2328',
                    }}
                    itemStyle={{ color: '#1f2328' }}
                    labelStyle={{ color: '#656d76', fontWeight: 600 }}
                    formatter={(value, _name, props) => {
                      const p = props?.payload as { trades?: number; winRate?: number } | undefined;
                      return [
                        `${formatDollars(Number(value))} (${p?.trades ?? 0} trades, ${p?.winRate ?? 0}% WR)`,
                        'P&L',
                      ];
                    }}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {dayOfWeekData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.pnl >= 0 ? '#3fb950' : '#f85149'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-[#8b949e]">{label}</span>
      </div>
      <p className={`text-lg font-bold ${valueColor || 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-[#8b949e] mt-0.5">{sub}</p>}
    </div>
  );
}
