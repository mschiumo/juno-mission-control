'use client';

/**
 * Usage analytics — owner-only page-visit and click metrics, rendered below
 * the account metrics on the Accounts tab.
 *
 * Reads GET /api/admin/analytics: daily views/visitors, top pages, top
 * clicks, and a recent-events feed, all captured by the global UsageTracker.
 */

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Eye, MousePointerClick, RefreshCw, Users } from 'lucide-react';
import type { UsageSummary } from '@/lib/db/usage-analytics';

const WINDOWS = [7, 14, 30] as const;

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function RankedList({
  title,
  icon: Icon,
  rows,
  emptyText,
}: {
  title: string;
  icon: React.ElementType;
  rows: { key: string; label: string; sub?: string; count: number }[];
  emptyText: string;
}) {
  const max = rows.length > 0 ? rows[0].count : 0;
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
    >
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {emptyText}
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="mb-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs truncate mr-3" style={{ color: 'var(--text-secondary)' }}>
                {row.label}
                {row.sub && (
                  <span style={{ color: 'var(--text-tertiary)' }}> · {row.sub}</span>
                )}
              </span>
              <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
                {row.count}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full"
                style={{ background: 'var(--accent)', width: max > 0 ? `${(row.count / max) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function UsageAnalyticsView() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [days, setDays] = useState<number>(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?days=${windowDays}`);
      const json = await res.json();
      if (json.success) setSummary(json.summary);
      else setError(json.error || 'Failed to load analytics');
    } catch {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }}
          aria-label="Loading analytics"
        />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          {error ?? 'No analytics available.'}
        </p>
        <button
          onClick={() => load(days)}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const s = summary;
  const today = s.days[s.days.length - 1];
  const maxViews = Math.max(...s.days.map((d) => d.views), 1);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Usage
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Page visits and clicks · UTC days · your own visits included
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{
                background: days === w ? 'var(--accent-dim)' : 'var(--surface-1)',
                border: '1px solid var(--border-default)',
                color: days === w ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {w}d
            </button>
          ))}
          <button
            onClick={() => load(days)}
            disabled={loading}
            className="p-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Eye} label="Views today" value={today?.views ?? 0} />
        <StatCard icon={Users} label="Visitors today" value={today?.visitors ?? 0} />
        <StatCard icon={BarChart3} label={`Views (${days}d)`} value={s.rangeViews} />
        <StatCard
          icon={Users}
          label={`Visitors (${days}d)`}
          value={s.rangeVisitors}
          sub="unique across the window"
        />
      </div>

      {/* Daily views bars */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Daily views
        </h3>
        <div className="flex items-end gap-1" style={{ height: 96 }}>
          {s.days.map((d) => (
            <div
              key={d.date}
              className="flex-1 rounded-t"
              title={`${d.date}: ${d.views} views · ${d.visitors} visitors`}
              style={{
                background: d.views > 0 ? 'var(--accent)' : 'var(--surface-2)',
                height: `${Math.max((d.views / maxViews) * 100, 3)}%`,
                opacity: d.views > 0 ? 0.9 : 1,
              }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {s.days[0]?.date}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {today?.date}
          </span>
        </div>
      </div>

      {/* Top pages + top clicks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankedList
          title="Top pages"
          icon={Eye}
          rows={s.topPages.map((p) => ({ key: p.page, label: p.page, count: p.views }))}
          emptyText="No page views recorded yet."
        />
        <RankedList
          title="Top clicks"
          icon={MousePointerClick}
          rows={s.topClicks.map((c) => ({
            key: `${c.page}|${c.label}`,
            label: c.label,
            sub: c.page,
            count: c.clicks,
          }))}
          emptyText="No clicks recorded yet."
        />
      </div>
    </div>
  );
}
