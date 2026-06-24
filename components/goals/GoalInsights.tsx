'use client';

import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, CheckCircle2, Percent, AlertTriangle, Flame, Loader2, TrendingUp } from 'lucide-react';
import type { GoalsData } from '@/lib/goals/types';
import { computeKpis, categoryBreakdown, phaseDistribution } from './shared';

interface TrendBucket {
  periodKey: string;
  label: string;
  completed: number;
  total: number;
  rate: number;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ color }}>
        {icon}
        <span className="metric-label" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </span>
      </div>
      <div className="metric-value-sm" style={{ color: 'var(--text-primary)' }}>
        {value}
        {sub && <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>{sub}</span>}
      </div>
    </div>
  );
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendBucket }> }) {
  if (!active || !payload || !payload.length) return null;
  const b = payload[0].payload;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
    >
      <div className="font-medium mb-0.5">{b.label}</div>
      <div style={{ color: 'var(--text-secondary)' }}>
        {b.completed}/{b.total} completed · {b.rate}%
      </div>
    </div>
  );
}

export default function GoalInsights({ goals }: { goals: GoalsData }) {
  const [trend, setTrend] = useState<TrendBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/goals/insights?window=12');
        const data = await res.json();
        if (!cancelled && data.success) setTrend(data.trend.buckets ?? []);
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = computeKpis(goals);
  const cats = categoryBreakdown(goals);
  const phases = phaseDistribution(goals);
  const phaseTotal = phases.reduce((s, p) => s + p.count, 0) || 1;
  const hasTrend = trend.some((b) => b.total > 0);

  return (
    <div className="space-y-5" style={{ minHeight: 360 }}>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard icon={<Activity className="w-4 h-4" />} label="Active" value={kpis.active} color="var(--accent)" />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Done / week"
          value={kpis.completedThisWeek}
          color="var(--positive)"
        />
        <StatCard
          icon={<Percent className="w-4 h-4" />}
          label="Completion"
          value={`${kpis.completionRate}%`}
          color="var(--info)"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Overdue"
          value={kpis.overdue}
          color={kpis.overdue > 0 ? 'var(--negative)' : 'var(--text-tertiary)'}
        />
        <StatCard icon={<Flame className="w-4 h-4" />} label="Best streak" value={kpis.bestStreak} color="var(--warning)" />
      </div>

      {/* Completion trend */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Completion trend
          </h3>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            last 12 weeks
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-[220px]" style={{ color: 'var(--text-tertiary)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : hasTrend ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="goalTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#4A5568', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#4A5568', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#FF6B00"
                strokeWidth={2}
                fill="url(#goalTrendFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="flex flex-col items-center justify-center h-[220px] text-center px-6"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No recurring-goal history yet</p>
            <p className="text-xs mt-1">Completions appear here after your recurring goals roll over each period.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category breakdown */}
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            By category
          </h3>
          <div className="space-y-3">
            {cats.map((c) => (
              <div key={c.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {c.label}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {c.achieved}/{c.total} · {c.percentage}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${c.percentage}%`, background: 'var(--accent)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phase distribution */}
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Status mix
          </h3>
          <div className="flex h-3 rounded-full overflow-hidden mb-4" style={{ background: 'var(--surface-3)' }}>
            {phases.map((p) =>
              p.count > 0 ? (
                <div key={p.phase} style={{ width: `${(p.count / phaseTotal) * 100}%`, background: p.color }} title={`${p.label}: ${p.count}`} />
              ) : null,
            )}
          </div>
          <div className="space-y-2">
            {phases.map((p) => (
              <div key={p.phase} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  {p.label}
                </span>
                <span className="text-xs num" style={{ color: 'var(--text-primary)' }}>
                  {p.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
