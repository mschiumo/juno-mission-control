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
    <div className="rounded-xl shadow-xl px-4 py-3 min-w-[180px]" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)' }}>
      <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Account Value</span>
          <span className="text-sm font-bold num" style={{ color: 'var(--text-primary)' }}>{formatNLV(nlv)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total P&L</span>
          <span className="text-sm font-semibold num" style={{ color: isPositive ? 'var(--positive)' : 'var(--negative)' }}>
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
    <div className="rounded-xl shadow-xl px-4 py-3 min-w-[160px]" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)' }}>
      <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>{d.name}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>P&L</span>
          <span className="text-sm font-bold num" style={{ color: isPositive ? 'var(--positive)' : 'var(--negative)' }}>
            {formatDollars(d.pnl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Trades</span>
          <span className="text-sm font-semibold num" style={{ color: 'var(--text-primary)' }}>{d.trades}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Win Rate</span>
          <span className="text-sm font-semibold num" style={{ color: 'var(--text-primary)' }}>{d.winRate}%</span>
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
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Performance</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Track your account growth over time</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: period === p ? 'var(--accent)' : 'transparent',
                color: period === p ? 'white' : 'var(--text-secondary)',
                boxShadow: period === p ? '0 1px 4px rgba(255,107,0,0.3)' : 'none',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Equity Curve Card */}
      <div className={`rounded-xl overflow-hidden${!hasData ? ' relative' : ''}`} style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[2px]" style={{ background: 'rgba(5,7,9,0.6)' }}>
            <div className="text-center px-6">
              <BarChart3 className="w-9 h-9 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No Trade Data Yet</h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Import trades on the Overview tab to populate your equity curve.</p>
            </div>
          </div>
        )}
        <div className={!hasData ? 'opacity-25 pointer-events-none select-none' : ''}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Equity Curve</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Net Liquidating Value — {PERIOD_LABELS[period]}</p>
              </div>
              <div className="flex items-center gap-4">
                {/* Starting Balance */}
                <div className="flex items-center gap-2">
                  {editingBalance ? (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="number"
                        value={balanceInput}
                        onChange={(e) => setBalanceInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleBalanceSave(); }}
                        className="w-28 rounded px-2 py-1 text-xs focus:outline-none"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-focus)', color: 'var(--text-primary)' }}
                        placeholder="e.g. 100000"
                        autoFocus
                      />
                      <button onClick={handleBalanceSave} className="p-1 rounded transition-colors" style={{ color: 'var(--positive)' }}>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : startingBalance > 0 ? (
                    <button
                      onClick={() => { setBalanceInput(startingBalance.toString()); setEditingBalance(true); }}
                      className="flex items-center gap-1.5 text-xs transition-colors group"
                      style={{ color: 'var(--text-tertiary)' }}
                      title="Edit starting account balance"
                    >
                      <span>Starting: {formatNLV(startingBalance)}</span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setBalanceInput(''); setEditingBalance(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                      style={{ background: 'var(--accent-dim)', border: '1px solid rgba(255,107,0,0.2)', color: 'var(--accent-light)' }}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Set Starting Balance</span>
                    </button>
                  )}
                </div>
                {/* NLV + P&L */}
                <div className="text-right">
                  <p className="text-base font-bold num" style={{ color: 'var(--text-primary)' }}>{hasData ? formatNLV(currentNLV) : '$0'}</p>
                  <p className="text-xs font-semibold num" style={{ color: isPositive ? 'var(--positive)' : 'var(--negative)' }}>
                    {hasData ? formatCurrency(totalPnL) : '+$0'}
                    {hasData && pnlPercent !== null && ` (${isPositive ? '+' : ''}${pnlPercent}%)`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {equityCurve.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={equityCurve} margin={{ top: 10, right: 16, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00C896" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#00C896" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#4A5568', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                    interval="preserveStartEnd"
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: '#4A5568', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                    tickFormatter={(v: number) => formatNLV(v)}
                    domain={['dataMin', 'dataMax']}
                    width={68}
                  />
                  <Tooltip content={<EquityTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }} />
                  <Area
                    type="monotone"
                    dataKey="nlv"
                    stroke="#00C896"
                    strokeWidth={2}
                    fill="url(#equityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={PLACEHOLDER_CURVE} margin={{ top: 10, right: 16, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="equityGradientPlaceholder" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00C896" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#00C896" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#4A5568', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: '#4A5568', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
                    tickFormatter={(v: number) => formatNLV(v)}
                    width={68}
                  />
                  <Area
                    type="monotone"
                    dataKey="nlv"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1.5}
                    fill="url(#equityGradientPlaceholder)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bottom stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {[
              { label: 'Total Trades', value: hasData ? String(metrics.totalTrades) : '--' },
              { label: 'Win Rate', value: hasData ? `${metrics.winRate}%` : '--' },
              { label: 'Avg Win', value: hasData ? `+$${metrics.averageWin.toFixed(0)}` : '--' },
              { label: 'Avg Loss', value: hasData ? `-$${metrics.averageLoss.toFixed(0)}` : '--' },
            ].map((s, i) => (
              <div key={s.label} className="px-4 py-3 text-center" style={{ borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{s.label}</p>
                <p className="text-sm font-bold num" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Journal Insights */}
      <div data-tour="journal-insights">
        <JournalInsightsView />
      </div>

      {/* Metrics cards */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3${!hasData ? ' opacity-25' : ''}`}>
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" style={{ color: 'var(--positive)' }} />}
          label="Net Profit"
          value={hasData ? formatDollars(metrics.netProfit) : '--'}
          valueStyle={{ color: metrics.netProfit >= 0 ? 'var(--positive)' : 'var(--negative)' }}
        />
        <MetricCard
          icon={<Target className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
          label="Profit Factor"
          value={hasData ? (metrics.profitFactor === Infinity ? '--' : metrics.profitFactor.toFixed(2)) : '--'}
        />
        <MetricCard
          icon={<TrendingDown className="w-4 h-4" style={{ color: 'var(--negative)' }} />}
          label="Max Drawdown"
          value={hasData ? formatDollars(metrics.maxDrawdown) : '--'}
          sub={hasData && metrics.maxDrawdownPercent > 0 ? `${metrics.maxDrawdownPercent.toFixed(1)}%` : undefined}
        />
        <MetricCard
          icon={<Trophy className="w-4 h-4" style={{ color: '#9B8FFF' }} />}
          label="Best Streak"
          value={hasData ? `${metrics.maxWinStreak} wins` : '--'}
          sub={hasData && metrics.currentWinStreak > 0 ? `Current: ${metrics.currentWinStreak}` : undefined}
        />
      </div>

      {/* Detailed Statistics + Day of Week side by side */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5${!hasData ? ' opacity-25' : ''}`}>
        {/* Detailed stats table */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Detailed Statistics</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {[
              { label: 'Total Trades', value: hasData ? String(metrics.totalTrades) : '--', style: {} },
              { label: 'Winning Trades', value: hasData ? String(metrics.winningTrades) : '--', style: {} },
              { label: 'Losing Trades', value: hasData ? String(metrics.losingTrades) : '--', style: {} },
              { label: 'Breakeven', value: hasData ? String(metrics.breakevenTrades) : '--', style: {} },
              { label: 'Gross Profit', value: hasData ? formatDollars(metrics.grossProfit) : '--', style: hasData ? { color: 'var(--positive)' } : {} },
              { label: 'Gross Loss', value: hasData ? formatDollars(metrics.grossLoss) : '--', style: hasData ? { color: 'var(--negative)' } : {} },
              { label: 'Largest Win', value: hasData ? formatDollars(metrics.largestWin) : '--', style: hasData ? { color: 'var(--positive)' } : {} },
              { label: 'Largest Loss', value: hasData ? formatDollars(metrics.largestLoss) : '--', style: hasData ? { color: 'var(--negative)' } : {} },
              { label: 'Avg Trade', value: hasData ? formatDollars(metrics.averageTrade) : '--', style: hasData ? { color: metrics.averageTrade >= 0 ? 'var(--positive)' : 'var(--negative)' } : {} },
              { label: 'Max Win Streak', value: hasData ? String(metrics.maxWinStreak) : '--', style: {} },
              { label: 'Max Loss Streak', value: hasData ? String(metrics.maxLossStreak) : '--', style: {} },
              { label: 'Current Streak', value: hasData ? (metrics.currentWinStreak > 0 ? `${metrics.currentWinStreak}W` : metrics.currentLossStreak > 0 ? `${metrics.currentLossStreak}L` : '--') : '--', style: {} },
            ].map((s) => (
              <div key={s.label} className="px-5 py-2.5 flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                <span className="text-xs font-semibold num" style={{ color: 'var(--text-primary)', ...s.style }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Day of Week Performance */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Day of Week</p>
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Performance by weekday</p>
          </div>
          <div className="p-4">
            {dayOfWeekData.length > 0 ? (
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={dayOfWeekData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#4A5568', fontSize: 11, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#4A5568', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatNLV(v)}
                  />
                  <Tooltip content={<DayOfWeekTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)', radius: 4 }} />
                  <Bar dataKey="pnl" radius={[5, 5, 0, 0]} maxBarSize={44}>
                    {dayOfWeekData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={entry.pnl >= 0 ? '#00C896' : '#FF3D57'}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={PLACEHOLDER_DOW} margin={{ top: 5, right: 16, left: 0, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#4A5568', fontSize: 11, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#4A5568', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatNLV(v)}
                  />
                  <Bar dataKey="pnl" radius={[5, 5, 0, 0]} maxBarSize={44} fill="rgba(255,255,255,0.06)" />
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
  valueStyle,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
  sub?: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <p className="text-base font-bold num" style={{ color: 'var(--text-primary)', ...valueStyle }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  );
}
