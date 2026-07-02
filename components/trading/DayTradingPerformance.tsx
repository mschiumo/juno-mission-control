'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Trophy, Target, BarChart3, Calendar, DollarSign, Check, Pencil } from 'lucide-react';
import JournalInsightsView from '@/components/trading/JournalInsightsView';
import {
  type Trade, type DailyBalance, type EquityCurvePoint, type Period,
  PERIOD_LABELS, METRIC_TOOLTIPS, PLACEHOLDER_CURVE, PLACEHOLDER_DOW,
  formatCurrency, formatDollars, formatNLV, filterByPeriod, filterBalancesByPeriod,
  computeMetrics, EquityTooltip, DayOfWeekTooltip, InfoTooltip, MetricCard,
} from '@/components/trading/performance-shared';

interface DayTradingPerformanceProps {
  trades: Trade[];
  dailyBalances: DailyBalance[];
  period: Period;
  startingBalance: number;
  onSaveStartingBalance: (val: number) => void;
  /** When true, show the cross-journal Journal Insights block (only for the combined view). */
  showJournalInsights?: boolean;
  /** Aggregate broker fees for the period (only surfaced on the combined view). */
  totalFees?: number;
}

export default function DayTradingPerformance({
  trades,
  dailyBalances,
  period,
  startingBalance,
  onSaveStartingBalance,
  showJournalInsights = true,
  totalFees = 0,
}: DayTradingPerformanceProps) {
  // balanceInput is only shown while editing; both edit entry-points below seed
  // it from the current startingBalance, so no syncing effect is needed.
  const [balanceInput, setBalanceInput] = useState('');
  const [editingBalance, setEditingBalance] = useState(false);

  const handleBalanceSave = useCallback(() => {
    const parsed = parseFloat(balanceInput);
    if (!isNaN(parsed) && parsed >= 0) onSaveStartingBalance(parsed);
    setEditingBalance(false);
  }, [balanceInput, onSaveStartingBalance]);

  const filteredTrades = useMemo(() => filterByPeriod(trades, period), [trades, period]);
  const closedTrades = useMemo(
    () => filteredTrades
      .filter((t) => t.status === 'CLOSED' && t.netPnL !== undefined)
      .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()),
    [filteredTrades],
  );

  const metrics = useMemo(() => computeMetrics(closedTrades, startingBalance), [closedTrades, startingBalance]);
  const filteredBalances = useMemo(() => filterBalancesByPeriod(dailyBalances, period), [dailyBalances, period]);

  // Build equity curve. Prefer the broker's authoritative daily balances; fall
  // back to "starting balance + cumulative P&L" when none are available.
  const equityCurve = useMemo<EquityCurvePoint[]>(() => {
    const pnlByDay = new Map<string, number>();
    for (const t of closedTrades) {
      const date = t.entryDate.split('T')[0];
      pnlByDay.set(date, (pnlByDay.get(date) || 0) + (t.netPnL || 0));
    }

    if (filteredBalances.length > 0) {
      const anchorBalance = filteredBalances[0].balance;
      const tradePnlBefore = (date: string) => {
        let s = 0;
        for (const [d, p] of pnlByDay) if (d < date) s += p;
        return s;
      };
      const baselineCumPnL = tradePnlBefore(filteredBalances[0].date);

      const curve = filteredBalances.map(({ date, balance }) => {
        const dt = new Date(date + 'T12:00:00');
        const cumPnL = balance - anchorBalance + baselineCumPnL;
        return {
          date,
          label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          cumPnL: Number(cumPnL.toFixed(2)),
          nlv: Number(balance.toFixed(2)),
        };
      });

      const lastBalanceDate = filteredBalances[filteredBalances.length - 1].date;
      const lastBalance = filteredBalances[filteredBalances.length - 1].balance;
      let postPnL = 0;
      for (const [d, p] of pnlByDay) if (d > lastBalanceDate) postPnL += p;
      if (postPnL !== 0) {
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        curve.push({
          date: 'today',
          label: today,
          cumPnL: Number((curve[curve.length - 1].cumPnL + postPnL).toFixed(2)),
          nlv: Number((lastBalance + postPnL).toFixed(2)),
        });
      }
      return curve;
    }

    if (!closedTrades.length) return [];
    const sortedDays = [...pnlByDay.entries()].sort(([a], [b]) => a.localeCompare(b));
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
  }, [closedTrades, startingBalance, filteredBalances]);

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

  const hasData = trades.length > 0;
  const currentNLV = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].nlv : startingBalance;
  const totalPnL = closedTrades.reduce((s, t) => s + (t.netPnL || 0), 0);
  const pnlPercent = startingBalance > 0 ? ((totalPnL / startingBalance) * 100).toFixed(2) : null;
  const isPositive = totalPnL >= 0;

  return (
    <div className="space-y-5">
      {/* Equity Curve Card */}
      <div className={`rounded-xl overflow-hidden${!hasData ? ' relative' : ''}`} style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[2px]" style={{ background: 'rgba(5,7,9,0.6)' }}>
            <div className="text-center px-6">
              <BarChart3 className="w-9 h-9 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No Trade Data Yet</h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Import trades on the Journal tab to populate your equity curve.</p>
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
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <p className="text-base font-bold num" style={{ color: 'var(--text-primary)' }}>{hasData ? formatNLV(currentNLV) : '$0'}</p>
                    {hasData && totalFees > 0 && (
                      <InfoTooltip
                        text={`This value may differ slightly from your broker balance. Broker fees (${formatDollars(totalFees)} this period) are tracked separately and reduce your actual account value. The equity curve uses authoritative broker balances from imported Account Statements when available.`}
                        align="right"
                      />
                    )}
                  </div>
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
                  <XAxis dataKey="label" tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} interval="preserveStartEnd" dy={8} />
                  <YAxis tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} tickFormatter={(v: number) => formatNLV(v)} domain={['dataMin', 'dataMax']} width={68} />
                  <Tooltip content={<EquityTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="nlv" stroke="#00C896" strokeWidth={2} fill="url(#equityGradient)" />
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
                  <XAxis dataKey="label" tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} dy={8} />
                  <YAxis tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} tickFormatter={(v: number) => formatNLV(v)} width={68} />
                  <Area type="monotone" dataKey="nlv" stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} fill="url(#equityGradientPlaceholder)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {[
              { label: 'Total Trades', value: hasData ? String(metrics.totalTrades) : '--' },
              { label: 'Win Rate', value: hasData ? `${metrics.winRate}%` : '--' },
              { label: 'Avg Win', value: hasData ? `+$${metrics.averageWin.toFixed(0)}` : '--' },
              { label: 'Avg Loss', value: hasData ? `-$${metrics.averageLoss.toFixed(0)}` : '--' },
            ].map((s, i) => (
              <div key={s.label} className="px-4 py-3 text-center" style={{ borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
                <p className="text-[10px] uppercase tracking-wider mb-0.5 inline-flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
                  {s.label}
                  {METRIC_TOOLTIPS[s.label] && <InfoTooltip text={METRIC_TOOLTIPS[s.label]} />}
                </p>
                <p className="text-sm font-bold num" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Journal Insights (combined view only) */}
      {showJournalInsights && (
        <div data-tour="journal-insights">
          <JournalInsightsView />
        </div>
      )}

      {/* Metrics cards */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3${!hasData ? ' opacity-25' : ''}`}>
        <MetricCard icon={<TrendingUp className="w-4 h-4" style={{ color: 'var(--positive)' }} />} label="Net Profit" value={hasData ? formatDollars(metrics.netProfit) : '--'} valueStyle={{ color: metrics.netProfit >= 0 ? 'var(--positive)' : 'var(--negative)' }} tooltip={METRIC_TOOLTIPS['Net Profit']} />
        <MetricCard icon={<Target className="w-4 h-4" style={{ color: 'var(--accent)' }} />} label="Profit Factor" value={hasData ? (metrics.profitFactor === Infinity ? '--' : metrics.profitFactor.toFixed(2)) : '--'} tooltip={METRIC_TOOLTIPS['Profit Factor']} />
        <MetricCard icon={<TrendingDown className="w-4 h-4" style={{ color: 'var(--negative)' }} />} label="Max Drawdown" value={hasData ? formatDollars(metrics.maxDrawdown) : '--'} sub={hasData && metrics.maxDrawdownPercent > 0 ? `${metrics.maxDrawdownPercent.toFixed(1)}%` : undefined} tooltip={METRIC_TOOLTIPS['Max Drawdown']} />
        <MetricCard icon={<Trophy className="w-4 h-4" style={{ color: '#9B8FFF' }} />} label="Best Streak" value={hasData ? `${metrics.maxWinStreak} wins` : '--'} sub={hasData && metrics.currentWinStreak > 0 ? `Current: ${metrics.currentWinStreak}` : undefined} tooltip={METRIC_TOOLTIPS['Best Streak']} />
      </div>

      {/* Broker Fees card — only shown when fee data is available */}
      {totalFees > 0 && (
        <div className="grid grid-cols-1 gap-3">
          <MetricCard
            icon={<DollarSign className="w-4 h-4" style={{ color: 'var(--negative)' }} />}
            label="Broker Fees"
            value={`-${formatDollars(totalFees)}`}
            valueStyle={{ color: 'var(--negative)' }}
            sub="Stock borrow, commissions & regulatory fees"
            tooltip={METRIC_TOOLTIPS['Broker Fees']}
          />
        </div>
      )}

      {/* Detailed Statistics + Day of Week */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5${!hasData ? ' opacity-25' : ''}`}>
        <div className="rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
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
                <span className="text-xs inline-flex items-center" style={{ color: 'var(--text-secondary)' }}>
                  {s.label}
                  {METRIC_TOOLTIPS[s.label] && <InfoTooltip text={METRIC_TOOLTIPS[s.label]} align="left" />}
                </span>
                <span className="text-xs font-semibold num" style={{ color: 'var(--text-primary)', ...s.style }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

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
                  <XAxis dataKey="name" tick={{ fill: '#4A5568', fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNLV(v)} />
                  <Tooltip content={<DayOfWeekTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)', radius: 4 }} />
                  <Bar dataKey="pnl" radius={[5, 5, 0, 0]} maxBarSize={44}>
                    {dayOfWeekData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.pnl >= 0 ? '#00C896' : '#FF3D57'} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={PLACEHOLDER_DOW} margin={{ top: 5, right: 16, left: 0, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#4A5568', fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNLV(v)} />
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
