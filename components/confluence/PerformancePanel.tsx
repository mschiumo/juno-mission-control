'use client';

/**
 * Agents → Performance: account balance, an equity curve, open positions, and
 * key metrics. Works in paper mode (positions/P&L derived from the order log,
 * marked to market when quotes are available) and shows the real Robinhood
 * portfolio in live mode.
 */

import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Wallet, Activity, FlaskConical } from 'lucide-react';
import type { PerformanceResponse } from '@/types/confluence';

function usd(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function usd2(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function signed(n: number | undefined): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${usd2(n)}`;
}
function pnlColor(n: number | undefined): string {
  if (n == null) return 'var(--text-secondary)';
  return n >= 0 ? 'var(--positive)' : 'var(--negative)';
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '0.9rem 1rem' }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number; payload: { date: string } }[];
}
function EquityTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)' }}>
      <div style={{ color: 'var(--text-tertiary)' }}>{p.payload.date}</div>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{usd2(p.value)}</div>
    </div>
  );
}

export default function PerformancePanel() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/confluence/performance?_t=${Date.now()}`).then((r) => r.json());
      if (res.success) setData({ stats: res.stats, positions: res.positions, history: res.history });
    } catch (e) {
      console.error('Failed to load performance:', e);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading performance…</div>;
  }
  if (!data) {
    return <div className="card text-center py-10" style={{ color: 'var(--text-tertiary)' }}>No performance data.</div>;
  }

  const { stats, positions, history } = data;
  const totalPnl = (stats.realizedPnl ?? 0) + (stats.unrealizedPnl ?? 0);
  const curve = history.map((h) => ({ date: h.date, value: h.value }));

  return (
    <div className="flex flex-col gap-4">
      {/* Header + source badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
            style={{ background: stats.source === 'live' ? 'var(--negative-dim)' : 'var(--warning-dim)', color: stats.source === 'live' ? 'var(--negative)' : 'var(--warning)' }}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {stats.source === 'live' ? 'LIVE ACCOUNT' : 'PAPER ACCOUNT'}
          </span>
          {!stats.quotesAvailable && stats.positionsCount > 0 && (
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>positions shown at cost (quotes unavailable)</span>
          )}
        </div>
        <button className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50" onClick={load} disabled={busy}>
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Account value" value={usd2(stats.accountValue)} sub={stats.source === 'paper' ? 'paper' : 'Robinhood'} />
        <Kpi label="Buying power" value={usd2(stats.buyingPower)} sub={`cash ${usd(stats.cash)}`} />
        <Kpi label="Total P&L" value={signed(totalPnl)} color={pnlColor(totalPnl)} sub={`realized ${signed(stats.realizedPnl)}`} />
        <Kpi label="Unrealized P&L" value={signed(stats.unrealizedPnl)} color={pnlColor(stats.unrealizedPnl)} sub={`${stats.positionsCount} position${stats.positionsCount === 1 ? '' : 's'}`} />
        <Kpi label="Invested (cost)" value={usd(stats.investedCost)} />
        <Kpi label="Open exposure" value={usd(stats.openExposure)} sub={`/ ${usd(stats.totalExposureCapUsd)} cap`} />
        <Kpi label="Proposals" value={`${stats.proposals.approved} / ${stats.proposals.total}`} sub={`${stats.proposals.pending} pending`} />
        <Kpi label="Orders filled" value={`${stats.orders.filled}`} sub={`${stats.orders.active} active`} />
      </div>

      {/* Equity curve */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" style={{ color: 'var(--accent-light)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Account value</h3>
        </div>
        {curve.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={curve} margin={{ top: 10, right: 12, left: 6, bottom: 16 }}>
              <defs>
                <linearGradient id="confluenceEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} interval="preserveStartEnd" dy={8} />
              <YAxis tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} tickFormatter={(v: number) => usd(v)} domain={['dataMin', 'dataMax']} width={64} />
              <Tooltip content={<EquityTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="value" stroke="#FF6B00" strokeWidth={2} fill="url(#confluenceEquity)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-12 text-center text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
            The equity curve builds one point per day. Check back tomorrow — today’s value is {usd2(stats.accountValue)}.
          </div>
        )}
      </div>

      {/* Positions */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Open positions</h3>
        {positions.length === 0 ? (
          <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No open positions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)' }} className="text-left">
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Avg cost</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
                  <th className="py-2 pr-3 font-medium">Mkt value</th>
                  <th className="py-2 font-medium">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{p.symbol}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{p.quantity}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{usd2(p.avgCost)}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{p.marketPrice != null ? usd2(p.marketPrice) : '—'}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{p.marketValue != null ? usd2(p.marketValue) : '—'}</td>
                    <td className="py-2.5 tabular-nums" style={{ color: pnlColor(p.unrealizedPnl) }}>
                      {p.unrealizedPnl != null ? (
                        <span className="inline-flex items-center gap-1">
                          {p.unrealizedPnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {signed(p.unrealizedPnl)}{p.unrealizedPnlPct != null ? ` (${p.unrealizedPnlPct >= 0 ? '+' : ''}${p.unrealizedPnlPct.toFixed(1)}%)` : ''}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        <Wallet className="w-3.5 h-3.5" />
        {stats.source === 'paper'
          ? 'Paper account: value = starting cash + realized + unrealized P&L, derived from filled paper orders.'
          : 'Live account: balances from your Robinhood agentic account.'}
      </div>
    </div>
  );
}
