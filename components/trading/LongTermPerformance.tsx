'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, PieChart, Newspaper, Loader2, ExternalLink, RefreshCw, Layers } from 'lucide-react';
import {
  type Trade, type EquityCurvePoint, type Period,
  PERIOD_LABELS, METRIC_TOOLTIPS, formatCurrency, formatDollars, formatNLV,
  filterByPeriod, EquityTooltip, MetricCard,
} from '@/components/trading/performance-shared';

interface LongTermPerformanceProps {
  trades: Trade[];
  period: Period;
  startingBalance: number;
  label: string;
}

interface OpenPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  shares: number;
  avgEntry: number;
  costBasis: number;
  price?: number;
  marketValue?: number;
  unrealizedPnL?: number;
  unrealizedPct?: number;
}

interface SecurityRealized {
  symbol: string;
  realizedPnL: number;
  trades: number;
  winRate: number;
}

interface TickerNewsItem {
  headline: string;
  url: string;
  source: string;
  datetime: number;
  summary: string;
}

function shortDate(unixSeconds: number): string {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function LongTermPerformance({ trades, period, startingBalance, label }: LongTermPerformanceProps) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [news, setNews] = useState<TickerNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // ---- Realized P&L by security (period-filtered closed trades) ----
  const bySecurity = useMemo<SecurityRealized[]>(() => {
    const closed = filterByPeriod(trades, period).filter((t) => t.status === 'CLOSED' && t.netPnL !== undefined);
    const buckets = new Map<string, { pnl: number; trades: number; wins: number }>();
    for (const t of closed) {
      const b = buckets.get(t.symbol) ?? { pnl: 0, trades: 0, wins: 0 };
      b.pnl += t.netPnL || 0;
      b.trades += 1;
      if ((t.netPnL || 0) > 0) b.wins += 1;
      buckets.set(t.symbol, b);
    }
    return [...buckets.entries()]
      .map(([symbol, b]) => ({
        symbol,
        realizedPnL: Number(b.pnl.toFixed(2)),
        trades: b.trades,
        winRate: b.trades > 0 ? Number(((b.wins / b.trades) * 100).toFixed(0)) : 0,
      }))
      .sort((a, b) => b.realizedPnL - a.realizedPnL);
  }, [trades, period]);

  // ---- Open positions (current holdings, ignore period) ----
  const openPositions = useMemo<OpenPosition[]>(() => {
    const open = trades.filter((t) => t.status === 'OPEN' && t.shares > 0);
    const buckets = new Map<string, { side: 'LONG' | 'SHORT'; shares: number; costBasis: number }>();
    for (const t of open) {
      const b = buckets.get(t.symbol) ?? { side: t.side, shares: 0, costBasis: 0 };
      b.shares += t.shares;
      b.costBasis += t.shares * t.entryPrice;
      buckets.set(t.symbol, b);
    }
    return [...buckets.entries()]
      .map(([symbol, b]) => ({
        symbol,
        side: b.side,
        shares: b.shares,
        avgEntry: b.shares > 0 ? b.costBasis / b.shares : 0,
        costBasis: b.costBasis,
      }))
      .sort((a, b) => b.costBasis - a.costBasis);
  }, [trades]);

  const openSymbols = useMemo(() => openPositions.map((p) => p.symbol), [openPositions]);
  const openSymbolsKey = openSymbols.join(',');

  const loadPrices = useCallback(async () => {
    if (!openSymbolsKey) { setPrices({}); return; }
    setPricesLoading(true);
    try {
      const res = await fetch(`/api/prices?symbols=${encodeURIComponent(openSymbolsKey)}`).then((r) => r.json());
      setPrices(res.prices || {});
    } catch {
      /* leave prices empty — table shows cost basis only */
    } finally {
      setPricesLoading(false);
    }
  }, [openSymbolsKey]);

  useEffect(() => { loadPrices(); }, [loadPrices]);

  const positionsWithPrices = useMemo<OpenPosition[]>(() => openPositions.map((p) => {
    const price = prices[p.symbol];
    if (price == null) return p;
    const marketValue = price * p.shares;
    const gross = p.side === 'SHORT' ? (p.avgEntry - price) * p.shares : (price - p.avgEntry) * p.shares;
    const unrealizedPct = p.costBasis > 0 ? (gross / p.costBasis) * 100 : 0;
    return {
      ...p,
      price,
      marketValue: Number(marketValue.toFixed(2)),
      unrealizedPnL: Number(gross.toFixed(2)),
      unrealizedPct: Number(unrealizedPct.toFixed(2)),
    };
  }), [openPositions, prices]);

  // Default the news panel to the largest holding, else the top realized security.
  useEffect(() => {
    if (selectedTicker) return;
    const first = positionsWithPrices[0]?.symbol ?? bySecurity[0]?.symbol ?? null;
    if (first) setSelectedTicker(first);
  }, [positionsWithPrices, bySecurity, selectedTicker]);

  useEffect(() => {
    if (!selectedTicker) return;
    let cancelled = false;
    setNewsLoading(true);
    fetch(`/api/ticker-news?symbol=${encodeURIComponent(selectedTicker)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setNews(Array.isArray(data.items) ? data.items : []); })
      .catch(() => { if (!cancelled) setNews([]); })
      .finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTicker]);

  // ---- Value curve (trade-derived realized) ----
  const equityCurve = useMemo<EquityCurvePoint[]>(() => {
    const closed = filterByPeriod(trades, period)
      .filter((t) => t.status === 'CLOSED' && t.netPnL !== undefined)
      .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());
    if (!closed.length) return [];
    const pnlByDay = new Map<string, number>();
    for (const t of closed) {
      const date = t.entryDate.split('T')[0];
      pnlByDay.set(date, (pnlByDay.get(date) || 0) + (t.netPnL || 0));
    }
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
  }, [trades, period, startingBalance]);

  // ---- Headline numbers ----
  const realizedPnL = useMemo(() => bySecurity.reduce((s, x) => s + x.realizedPnL, 0), [bySecurity]);
  const marketValue = useMemo(
    () => positionsWithPrices.reduce((s, p) => s + (p.marketValue ?? 0), 0),
    [positionsWithPrices],
  );
  const unrealizedPnL = useMemo(
    () => positionsWithPrices.reduce((s, p) => s + (p.unrealizedPnL ?? 0), 0),
    [positionsWithPrices],
  );
  const costBasis = useMemo(() => openPositions.reduce((s, p) => s + p.costBasis, 0), [openPositions]);

  const hasData = trades.length > 0;

  // Top/bottom securities for the bar chart (cap to keep it readable).
  const chartSecurities = useMemo(() => {
    if (bySecurity.length <= 12) return bySecurity;
    return [...bySecurity.slice(0, 6), ...bySecurity.slice(-6)];
  }, [bySecurity]);

  if (!hasData) {
    return (
      <div className="rounded-xl p-10 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        <Layers className="w-9 h-9 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No Positions Yet</h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Connect this brokerage or import activity to see long-term holdings and insights.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Value curve card */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label} — Portfolio Value</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Realized value curve — {PERIOD_LABELS[period]}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold num" style={{ color: 'var(--text-primary)' }}>{formatNLV(startingBalance + realizedPnL + unrealizedPnL)}</p>
              <p className="text-xs font-semibold num" style={{ color: (realizedPnL + unrealizedPnL) >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {formatCurrency(realizedPnL + unrealizedPnL)} total
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {equityCurve.length > 1 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={equityCurve} margin={{ top: 10, right: 16, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="ltEquityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00C896" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00C896" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} interval="preserveStartEnd" dy={8} />
                <YAxis tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.04)' }} tickFormatter={(v: number) => formatNLV(v)} domain={['dataMin', 'dataMax']} width={68} />
                <Tooltip content={<EquityTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="nlv" stroke="#00C896" strokeWidth={2} fill="url(#ltEquityGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[240px] text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No closed positions in this period yet — open positions are shown below.
            </div>
          )}
        </div>
      </div>

      {/* Long-term metric cards (replaces profit factor / drawdown / streak) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Wallet className="w-4 h-4" style={{ color: 'var(--accent)' }} />} label="Market Value" value={marketValue > 0 ? formatDollars(marketValue) : '--'} sub={costBasis > 0 ? `Cost ${formatDollars(costBasis)}` : undefined} tooltip={METRIC_TOOLTIPS['Market Value']} />
        <MetricCard icon={<TrendingUp className="w-4 h-4" style={{ color: unrealizedPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }} />} label="Unrealized P&L" value={openPositions.length > 0 ? formatDollars(unrealizedPnL) : '--'} valueStyle={{ color: unrealizedPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }} sub={costBasis > 0 ? `${((unrealizedPnL / costBasis) * 100).toFixed(1)}%` : undefined} tooltip={METRIC_TOOLTIPS['Unrealized P&L']} />
        <MetricCard icon={<TrendingDown className="w-4 h-4" style={{ color: realizedPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }} />} label="Realized P&L" value={formatDollars(realizedPnL)} valueStyle={{ color: realizedPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }} tooltip={METRIC_TOOLTIPS['Realized P&L']} />
        <MetricCard icon={<PieChart className="w-4 h-4" style={{ color: '#9B8FFF' }} />} label="Holdings" value={String(openPositions.length)} sub={`${bySecurity.length} traded`} />
      </div>

      {/* Open positions table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Open Positions</p>
          </div>
          <button onClick={loadPrices} className="flex items-center gap-1 text-[11px] transition-colors" style={{ color: 'var(--text-tertiary)' }} title="Refresh live prices">
            <RefreshCw className={`w-3 h-3 ${pricesLoading ? 'animate-spin' : ''}`} /> {pricesLoading ? 'Updating' : 'Live prices'}
          </button>
        </div>
        {positionsWithPrices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-tertiary)' }}>
                  {['Symbol', 'Shares', 'Avg Cost', 'Price', 'Mkt Value', 'Unrealized'].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positionsWithPrices.map((p) => {
                  const active = selectedTicker === p.symbol;
                  const up = (p.unrealizedPnL ?? 0) >= 0;
                  return (
                    <tr
                      key={p.symbol}
                      onClick={() => setSelectedTicker(p.symbol)}
                      className="cursor-pointer transition-colors"
                      style={{ background: active ? 'var(--accent-dim)' : 'transparent' }}
                    >
                      <td className="px-4 py-2.5 text-left font-semibold" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {p.symbol}
                        {p.side === 'SHORT' && <span className="ml-1 text-[9px]" style={{ color: 'var(--negative)' }}>SHORT</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right num" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{p.shares.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right num" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>${p.avgEntry.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right num" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{p.price != null ? `$${p.price.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right num" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>{p.marketValue != null ? formatDollars(p.marketValue) : '—'}</td>
                      <td className="px-4 py-2.5 text-right num font-semibold" style={{ color: p.unrealizedPnL == null ? 'var(--text-tertiary)' : up ? 'var(--positive)' : 'var(--negative)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {p.unrealizedPnL != null ? `${formatDollars(p.unrealizedPnL)} (${up ? '+' : ''}${p.unrealizedPct?.toFixed(1)}%)` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No open positions. Long-term holdings appear here once you hold shares that haven&apos;t been sold.
          </div>
        )}
      </div>

      {/* Realized by security + Ticker news */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Realized P&L by security */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <PieChart className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Realized P&L by Security</p>
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Which tickers made or lost money — {PERIOD_LABELS[period]}</p>
          </div>
          {chartSecurities.length > 0 ? (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(160, chartSecurities.length * 28)}>
                <BarChart data={chartSecurities} layout="vertical" margin={{ top: 5, right: 20, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#4A5568', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNLV(v)} />
                  <YAxis type="category" dataKey="symbol" tick={{ fill: '#4A5568', fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    contentStyle={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)', borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [formatDollars(Number(v)), 'Realized P&L'] as [string, string]}
                  />
                  <Bar dataKey="realizedPnL" radius={[0, 4, 4, 0]} maxBarSize={20} onClick={(_, index) => { const s = chartSecurities[index]; if (s) setSelectedTicker(s.symbol); }} cursor="pointer">
                    {chartSecurities.map((s) => (
                      <Cell key={s.symbol} fill={s.realizedPnL >= 0 ? '#00C896' : '#FF3D57'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>No closed positions in this period.</div>
          )}
          {bySecurity.length > 0 && (
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {bySecurity.slice(0, 8).map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => setSelectedTicker(s.symbol)}
                  className="w-full px-5 py-2 flex items-center justify-between transition-colors"
                  style={{ background: selectedTicker === s.symbol ? 'var(--accent-dim)' : 'transparent', borderColor: 'var(--border-subtle)' }}
                >
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{s.symbol}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{s.trades} trades · {s.winRate}% win</span>
                    <span className="text-xs font-semibold num" style={{ color: s.realizedPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{formatDollars(s.realizedPnL)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ticker news */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Newspaper className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                News{selectedTicker ? ` · ${selectedTicker}` : ''}
              </p>
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Tap a ticker to switch</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {newsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : !selectedTicker ? (
              <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>Select a ticker to see recent headlines.</div>
            ) : news.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>No recent news for {selectedTicker}.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {news.map((n, i) => (
                  <a
                    key={`${n.url}-${i}`}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-5 py-3 transition-colors hover:bg-white/[0.02]"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-start gap-2">
                      <p className="text-xs font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{n.headline}</p>
                      <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {n.source}{n.source && n.datetime ? ' · ' : ''}{shortDate(n.datetime)}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
