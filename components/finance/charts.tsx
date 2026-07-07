'use client';

/**
 * Shared recharts wrappers for the Finances tab — styled to match the
 * Trading tab's PerformanceView conventions (dark grid, gradient area fills,
 * tabular-nums tooltips).
 *
 * History series come from /api/finance/history (a point per day per series,
 * recorded automatically on every balance mutation). Charts stay sparse
 * until balances have been updated a few times — the empty/one-point states
 * explain that to the user.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { HistoryPoint } from '@/lib/finance/types';

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function fmtCompactUsd(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `$${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1000).toFixed(1)}k`;
  return usd0.format(v);
}

function fmtAxisDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAxisMonth(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 rounded-lg text-xs"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
    >
      <p style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {payload
        .filter((p) => p.value !== undefined && p.value !== null)
        .map((p, i) => (
          <p key={i} className="num font-semibold" style={{ color: p.color || 'var(--text-primary)' }}>
            {p.name}: {usd0.format(Number(p.value))}
          </p>
        ))}
    </div>
  );
}

/**
 * Single-series balance-over-time area chart (Investing / Savings growth,
 * or any HistoryPoint[] series).
 */
export function BalanceTrendChart({
  data,
  color,
  gradientId,
  name,
  height = 220,
}: {
  data: HistoryPoint[];
  color: string;
  gradientId: string; // unique per chart instance on the page
  name: string;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-xs text-center px-6"
        style={{ height, background: 'var(--bg-base)', border: '1px dashed var(--border-subtle)', color: 'var(--text-tertiary)' }}
      >
        {data.length === 0
          ? 'No history yet — update a balance (or sync your sheet) and a point is recorded each day.'
          : 'One data point so far — the trend appears after the next balance update on a different day.'}
      </div>
    );
  }

  const chartData = data.map((p) => ({ label: fmtAxisDate(p.date), value: p.value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 10, bottom: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
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
          tickFormatter={fmtCompactUsd}
          domain={['auto', 'auto']}
          width={58}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Debt paydown chart: actual recorded history (solid red) flowing into the
 * active payoff plan's projected balance decline (dashed orange). The two
 * series share the "today" point so the curve is continuous.
 */
export function DebtProjectionChart({
  history,
  projection,
  currentTotal,
  todayDate,
  height = 240,
}: {
  history: HistoryPoint[];
  projection: { month: string; balanceRemaining: number }[]; // from PayoffPlan.months
  currentTotal: number;
  todayDate: string; // YYYY-MM-DD
  height?: number;
}) {
  type Row = { label: string; actual?: number; projected?: number };
  const rows: Row[] = [];

  for (const p of history.filter((p) => p.date < todayDate)) {
    rows.push({ label: fmtAxisDate(p.date), actual: p.value });
  }
  // Shared "today" point joins the two series.
  rows.push({ label: 'Today', actual: currentTotal, projected: currentTotal });
  for (const m of projection) {
    rows.push({ label: fmtAxisMonth(`${m.month}-15`), projected: m.balanceRemaining });
  }

  if (rows.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-xs text-center px-6"
        style={{ height, background: 'var(--bg-base)', border: '1px dashed var(--border-subtle)', color: 'var(--text-tertiary)' }}
      >
        Set a monthly budget to see the projected payoff curve.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 10, right: 16, left: 10, bottom: 8 }}>
        <defs>
          <linearGradient id="debtActualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF3D57" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#FF3D57" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="debtProjGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
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
          tickFormatter={fmtCompactUsd}
          domain={[0, 'auto']}
          width={58}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey="actual"
          name="Actual"
          stroke="#FF3D57"
          strokeWidth={2}
          fill="url(#debtActualGrad)"
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="projected"
          name="Projected"
          stroke="#FF6B00"
          strokeWidth={2}
          strokeDasharray="6 4"
          fill="url(#debtProjGrad)"
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
