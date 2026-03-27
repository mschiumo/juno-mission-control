'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  DollarSign,
  Check,
  Pencil,
} from 'lucide-react';
import JournalInsightsView from '@/components/trading/JournalInsightsView';

type Period = 'week' | 'month' | 'year' | 'all';

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  shares: number;
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  netPnL?: number;
  status: 'OPEN' | 'CLOSED';
  strategy?: string;
}

interface EquityCurvePoint {
  date: string;
  label: string;
  cumPnL: number;
  nlv: number;
}

interface ComputedMetrics {
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

function formatCurrency(val: number): string {
  const abs = Math.abs(val);
  const formatted = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(0)}`;
  return val < 0 ? `-${formatted}` : `+${formatted}`;
}

function formatDollars(val: number): string {
  return val < 0
    ? `-$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNLV(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Past Week',
  month: 'Past Month',
  year: 'Past Year',
  all: 'All Time',
};

const PLACEHOLDER_CURVE = [
  { label: 'Week 1', nlv: 10000 },
  { label: 'Week 2', nlv: 10200 },
  { label: 'Week 3', nlv: 10150 },
  { label: 'Week 4', nlv: 10400 },
  { label: 'Week 5', nlv: 10350 },
  { label: 'Week 6', nlv: 10550 },
  { label: 'Week 7', nlv: 10700 },
  { label: 'Week 8', nlv: 10650 },
  { label: 'Week 9', nlv: 10900 },
  { label: 'Week 10', nlv: 11100 },
];

const PLACEHOLDER_DOW = [
  { name: 'Mon', pnl: 120 },
  { name: 'Tue', pnl: -40 },
  { name: 'Wed', pnl: 80 },
  { name: 'Thu', pnl: 60 },
  { name: 'Fri', pnl: -20 },
];

function filterByPeriod(trades: Trade[], period: Period): Trade[] {
  if (period === 'all') return trades;
  const now = new Date();
  const cutoff = new Date();
  switch (period) {
    case 'week': cutoff.setDate(now.getDate() - 7); break;
    case 'month': cutoff.setMonth(now.getMonth() - 1); break;
    case 'year': cutoff.setFullYear(now.getFullYear() - 1); break;
  }
  return trades.filter((t) => new Date(t.entryDate) >= cutoff);
}

function computeMetrics(closedTrades: Trade[]): ComputedMetrics {
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter((t) => (t.netPnL || 0) > 0);
  const losses = closedTrades.filter((t) => (t.netPnL || 0) < 0);
  const breakevens = closedTrades.filter((t) => (t.netPnL || 0) === 0);

  const grossProfit = wins.reduce((s, t) => s + (t.netPnL || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.netPnL || 0), 0));
  const netProfit = closedTrades.reduce((s, t) => s + (t.netPnL || 0), 0);

  const winAmounts = wins.map((t) => t.netPnL || 0);
  const lossAmounts = losses.map((t) => Math.abs(t.netPnL || 0));

  const averageWin = winAmounts.length > 0 ? winAmounts.reduce((a, b) => a + b, 0) / winAmounts.length : 0;
  const averageLoss = lossAmounts.length > 0 ? lossAmounts.reduce((a, b) => a + b, 0) / lossAmounts.length : 0;
  const averageTrade = totalTrades > 0 ? netProfit / totalTrades : 0;

  let maxWinStreak = 0, maxLossStreak = 0, tempWin = 0, tempLoss = 0;
  let currentWinStreak = 0, currentLossStreak = 0;
  for (const t of closedTrades) {
    const pnl = t.netPnL || 0;
    if (pnl > 0) { tempWin++; tempLoss = 0; maxWinStreak = Math.max(maxWinStreak, tempWin); }
    else if (pnl < 0) { tempLoss++; tempWin = 0; maxLossStreak = Math.max(maxLossStreak, tempLoss); }
  }
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    const pnl = closedTrades[i].netPnL || 0;
    if (pnl > 0) { if (currentLossStreak === 0) currentWinStreak++; else break; }
    else if (pnl < 0) { if (currentWinStreak === 0) currentLossStreak++; else break; }
    else break;
  }

  let maxDrawdown = 0, peak = 0, running = 0;
  for (const t of closedTrades) {
    running += t.netPnL || 0;
    if (running > peak) peak = running;
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }

  return {
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: breakevens.length,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    winRate: totalTrades > 0 ? Number(((wins.length / totalTrades) * 100).toFixed(2)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? Infinity : 0,
    averageWin: Number(averageWin.toFixed(2)),
    averageLoss: Number(averageLoss.toFixed(2)),
    averageTrade: Number(averageTrade.toFixed(2)),
    largestWin: winAmounts.length > 0 ? Number(Math.max(...winAmounts).toFixed(2)) : 0,
    largestLoss: lossAmounts.length > 0 ? Number(Math.max(...lossAmounts).toFixed(2)) : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPercent: peak > 0 ? Number(((maxDrawdown / peak) * 100).toFixed(2)) : 0,
    currentWinStreak,
    maxWinStreak,
    currentLossStreak,
    maxLossStreak,
  };
}

/* ----------- Custom Tooltip Components ----------- */

function EquityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: EquityCurvePoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const nlv = point.nlv;
  const pnl = point.cumPnL;
  const isPositive = pnl >= 0;

  return (
    <div className="bg-[#1c2128] border border-[#30363d] rounded-lg shadow-xl px-4 py-3 min-w-[180px]">
      <p className="text-xs text-[#8b949e] mb-2 font-medium">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#8b949e]">Account Value</span>
          <span className="text-sm font-bold text-white">{formatNLV(nlv)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#8b949e]">Total P&L</span>
          <span className={`text-sm font-semibold ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {formatCurrency(pnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DayOfWeekTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { name: string; pnl: number; trades: number; winRate: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPositive = d.pnl >= 0;

  return (
    <div className="bg-[#1c2128] border border-[#30363d] rounded-lg shadow-xl px-4 py-3 min-w-[160px]">
      <p className="text-xs text-[#8b949e] mb-2 font-medium">{d.name}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#8b949e]">P&L</span>
          <span className={`text-sm font-bold ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {formatDollars(d.pnl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#8b949e]">Trades</span>
          <span className="text-sm font-semibold text-white">{d.trades}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-[#8b949e]">Win Rate</span>
          <span className="text-sm font-semibold text-white">{d.winRate}%</span>
        </div>
      </div>
    </div>
  );
}

/* ----------- Main Component ----------- */

export default function PerformanceView() {
  const [period, setPeriod] = useState<Period>('all');
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState(0);
  const [balanceInput, setBalanceInput] = useState('');
  const [editingBalance, setEditingBalance] = useState(false);

  // Fetch trades and prefs in parallel
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/trades?userId=default&perPage=1000').then((r) => r.json()),
      fetch('/api/user/prefs').then((r) => r.json()),
    ])
      .then(([tradesRes, prefsRes]) => {
        if (tradesRes.success && tradesRes.data) {
          setAllTrades(tradesRes.data.trades || []);
        }
        if (prefsRes.success && prefsRes.prefs) {
          const bal = prefsRes.prefs.startingBalance || 0;
          setStartingBalance(bal);
          setBalanceInput(bal > 0 ? bal.toString() : '');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveBalance = useCallback((val: number) => {
    setStartingBalance(val);
    fetch('/api/user/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startingBalance: val }),
    }).catch(() => {});
  }, []);

  const handleBalanceSave = useCallback(() => {
    const parsed = parseFloat(balanceInput);
    if (!isNaN(parsed) && parsed >= 0) {
      saveBalance(parsed);
    }
    setEditingBalance(false);
  }, [balanceInput, saveBalance]);

  const filteredTrades = useMemo(() => filterByPeriod(allTrades, period), [allTrades, period]);
  const closedTrades = useMemo(
    () => filteredTrades
      .filter((t) => t.status === 'CLOSED' && t.netPnL !== undefined)
      .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()),
    [filteredTrades],
  );

  const metrics = useMemo(() => computeMetrics(closedTrades), [closedTrades]);

  // Build equity curve as NLV (starting balance + cumulative P&L)
  const equityCurve = useMemo<EquityCurvePoint[]>(() => {
    if (!closedTrades.length) return [];

    const byDay = new Map<string, number>();
    for (const t of closedTrades) {
      const date = t.entryDate.split('T')[0];
      byDay.set(date, (byDay.get(date) || 0) + (t.netPnL || 0));
    }

    const sortedDays = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    let cumulative = 0;
    return sortedDays.map(([date, pnl]) => {
      cumulative += pnl;
      const dt = new Date(date + 'T12:00:00');
      return {
        date,
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cumPnL: Number(cumulative.toFixed(2)),
        nlv: Number((startingBalance + cumulative).toFixed(2)),
      };
    });
  }, [closedTrades, startingBalance]);

  // Day of week performance
  const dayOfWeekData = useMemo(() => {
    if (!closedTrades.length) return [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const buckets: Record<string, { pnl: number; wins: number; losses: number; trades: number }> = {};
    for (const t of closedTrades) {
      const day = dayNames[new Date(t.entryDate).getDay()];
      if (!buckets[day]) buckets[day] = { pnl: 0, wins: 0, losses: 0, trades: 0 };
      buckets[day].pnl += t.netPnL || 0;
      buckets[day].trades++;
      if ((t.netPnL || 0) > 0) buckets[day].wins++;
      else if ((t.netPnL || 0) < 0) buckets[day].losses++;
    }
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      .filter((d) => buckets[d])
      .map((day) => {
        const b = buckets[day];
        return {
          name: day.slice(0, 3),
          pnl: Number(b.pnl.toFixed(2)),
          trades: b.trades,
          winRate: b.wins + b.losses > 0 ? Number(((b.wins / (b.wins + b.losses)) * 100).toFixed(1)) : 0,
        };
      });
  }, [closedTrades]);

  const hasData = allTrades.length > 0;
  const currentNLV = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].nlv : startingBalance;
  const totalPnL = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].cumPnL : 0;
  const pnlPercent = startingBalance > 0 ? ((totalPnL / startingBalance) * 100).toFixed(2) : null;
  const isPositive = totalPnL >= 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#F97316] animate-spin" />
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
      <div className={`bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden${!hasData ? ' relative' : ''}`}>
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1117]/60 backdrop-blur-[2px] rounded-xl">
            <div className="text-center px-6">
              <BarChart3 className="w-10 h-10 text-[#F97316] mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white mb-1">No Trade Data Yet</h3>
              <p className="text-sm text-[#8b949e]">Import trades on the Overview tab to populate your equity curve.</p>
            </div>
          </div>
        )}
        <div className={!hasData ? 'opacity-30 pointer-events-none select-none' : ''}>
          <div className="px-6 py-4 border-b border-[#30363d]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Equity Curve</p>
                <p className="text-xs text-[#8b949e]">Net Liquidating Value &mdash; {PERIOD_LABELS[period]}</p>
              </div>
              <div className="flex items-center gap-4">
                {/* Starting Balance */}
                <div className="flex items-center gap-2">
                  {editingBalance ? (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-[#8b949e]" />
                      <input
                        type="number"
                        value={balanceInput}
                        onChange={(e) => setBalanceInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleBalanceSave(); }}
                        className="w-32 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#F97316]"
                        placeholder="e.g. 100000"
                        autoFocus
                      />
                      <button onClick={handleBalanceSave} className="p-1 hover:bg-[#30363d] rounded transition-colors">
                        <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                      </button>
                    </div>
                  ) : startingBalance > 0 ? (
                    <button
                      onClick={() => { setBalanceInput(startingBalance.toString()); setEditingBalance(true); }}
                      className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors group"
                      title="Edit starting account balance"
                    >
                      <span>Starting: {formatNLV(startingBalance)}</span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setBalanceInput(''); setEditingBalance(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F97316]/10 border border-[#F97316]/30 rounded-lg text-xs text-[#F97316] hover:bg-[#F97316]/20 transition-colors"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Set Starting Balance</span>
                    </button>
                  )}
                </div>
                {/* NLV + P&L */}
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{hasData ? formatNLV(currentNLV) : '$0'}</p>
                  <p className={`text-xs font-medium ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {hasData ? formatCurrency(totalPnL) : '+$0'}
                    {hasData && pnlPercent !== null && ` (${isPositive ? '+' : ''}${pnlPercent}%)`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {equityCurve.length > 1 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={equityCurve} margin={{ top: 10, right: 16, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3fb950" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3fb950" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#30363d' }}
                    interval="preserveStartEnd"
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#30363d' }}
                    tickFormatter={(v: number) => formatNLV(v)}
                    domain={['dataMin', 'dataMax']}
                    width={70}
                  />
                  <Tooltip content={<EquityTooltip />} cursor={{ stroke: '#30363d', strokeDasharray: '4 4' }} />
                  <Area
                    type="monotone"
                    dataKey="nlv"
                    stroke="#3fb950"
                    strokeWidth={2.5}
                    fill="url(#equityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={PLACEHOLDER_CURVE} margin={{ top: 10, right: 16, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="equityGradientPlaceholder" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3fb950" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#3fb950" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#30363d' }}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#30363d' }}
                    tickFormatter={(v: number) => formatNLV(v)}
                    width={70}
                  />
                  <Area
                    type="monotone"
                    dataKey="nlv"
                    stroke="#30363d"
                    strokeWidth={2}
                    fill="url(#equityGradientPlaceholder)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bottom stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#30363d] border-t border-[#30363d]">
            {[
              { label: 'Total Trades', value: hasData ? String(metrics.totalTrades) : '--' },
              { label: 'Win Rate', value: hasData ? `${metrics.winRate}%` : '--' },
              { label: 'Avg Win', value: hasData ? `+$${metrics.averageWin.toFixed(0)}` : '--' },
              { label: 'Avg Loss', value: hasData ? `-$${metrics.averageLoss.toFixed(0)}` : '--' },
            ].map((s) => (
              <div key={s.label} className="px-3 py-3 text-center">
                <p className="text-[10px] text-[#8b949e] mb-0.5">{s.label}</p>
                <p className="text-sm font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Journal Insights */}
      <JournalInsightsView />

      {/* Metrics cards */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4${!hasData ? ' opacity-30' : ''}`}>
        <MetricCard
          icon={<TrendingUp className="w-5 h-5 text-[#3fb950]" />}
          label="Net Profit"
          value={hasData ? formatDollars(metrics.netProfit) : '--'}
          valueColor={metrics.netProfit >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}
        />
        <MetricCard
          icon={<Target className="w-5 h-5 text-[#F97316]" />}
          label="Profit Factor"
          value={hasData ? (metrics.profitFactor === Infinity ? '--' : metrics.profitFactor.toFixed(2)) : '--'}
        />
        <MetricCard
          icon={<TrendingDown className="w-5 h-5 text-[#f85149]" />}
          label="Max Drawdown"
          value={hasData ? formatDollars(metrics.maxDrawdown) : '--'}
          sub={hasData && metrics.maxDrawdownPercent > 0 ? `${metrics.maxDrawdownPercent.toFixed(1)}%` : undefined}
        />
        <MetricCard
          icon={<Trophy className="w-5 h-5 text-[#d2a8ff]" />}
          label="Best Streak"
          value={hasData ? `${metrics.maxWinStreak} wins` : '--'}
          sub={hasData && metrics.currentWinStreak > 0 ? `Current: ${metrics.currentWinStreak}` : undefined}
        />
      </div>

      {/* Detailed Statistics + Day of Week side by side */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6${!hasData ? ' opacity-30' : ''}`}>
        {/* Detailed stats table */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#30363d]">
            <p className="text-sm font-semibold text-white">Detailed Statistics</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#30363d]">
            {[
              { label: 'Total Trades', value: hasData ? String(metrics.totalTrades) : '--' },
              { label: 'Winning Trades', value: hasData ? String(metrics.winningTrades) : '--' },
              { label: 'Losing Trades', value: hasData ? String(metrics.losingTrades) : '--' },
              { label: 'Breakeven', value: hasData ? String(metrics.breakevenTrades) : '--' },
              { label: 'Gross Profit', value: hasData ? formatDollars(metrics.grossProfit) : '--', color: hasData ? 'text-[#3fb950]' : undefined },
              { label: 'Gross Loss', value: hasData ? formatDollars(metrics.grossLoss) : '--', color: hasData ? 'text-[#f85149]' : undefined },
              { label: 'Largest Win', value: hasData ? formatDollars(metrics.largestWin) : '--', color: hasData ? 'text-[#3fb950]' : undefined },
              { label: 'Largest Loss', value: hasData ? formatDollars(metrics.largestLoss) : '--', color: hasData ? 'text-[#f85149]' : undefined },
              { label: 'Avg Trade', value: hasData ? formatDollars(metrics.averageTrade) : '--', color: hasData ? (metrics.averageTrade >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]') : undefined },
              { label: 'Max Win Streak', value: hasData ? String(metrics.maxWinStreak) : '--' },
              { label: 'Max Loss Streak', value: hasData ? String(metrics.maxLossStreak) : '--' },
              { label: 'Current Streak', value: hasData ? (metrics.currentWinStreak > 0 ? `${metrics.currentWinStreak}W` : metrics.currentLossStreak > 0 ? `${metrics.currentLossStreak}L` : '--') : '--' },
            ].map((s) => (
              <div key={s.label} className="bg-[#161b22] px-6 py-3 flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">{s.label}</span>
                <span className={`text-sm font-semibold ${s.color || 'text-white'}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Day of Week Performance */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#30363d]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#F97316]" />
              <p className="text-sm font-semibold text-white">Day of Week</p>
            </div>
            <p className="text-xs text-[#8b949e]">Performance by weekday</p>
          </div>
          <div className="p-4">
            {dayOfWeekData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dayOfWeekData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#8b949e', fontSize: 12, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatNLV(v)}
                  />
                  <Tooltip content={<DayOfWeekTooltip />} cursor={{ fill: '#21262d', radius: 4 }} />
                  <Bar dataKey="pnl" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {dayOfWeekData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={entry.pnl >= 0 ? '#3fb950' : '#f85149'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={PLACEHOLDER_DOW} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#8b949e', fontSize: 12, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatNLV(v)}
                  />
                  <Bar dataKey="pnl" radius={[6, 6, 0, 0]} maxBarSize={48} fill="#30363d" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
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
