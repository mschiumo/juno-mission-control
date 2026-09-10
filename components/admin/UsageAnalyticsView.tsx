'use client';

/**
 * Usage analytics — owner-only page-visit and click metrics, rendered below
 * the account metrics on the Accounts tab.
 *
 * Reads GET /api/admin/analytics: daily views/visitors, top pages, top
 * clicks, and a recent-events feed, all captured by the global UsageTracker.
 * The same response carries recent plan-lifecycle events, which are merged
 * with the usage feed into the single Recent activity card at the bottom.
 *
 * The owner's own browsing is excluded by default — otherwise the numbers
 * mostly measure the owner testing the app. "Include mine" turns it back on;
 * the choice is remembered per browser.
 */

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Eye, MousePointerClick, RefreshCw, User, Users } from 'lucide-react';
import type { UsageSummary } from '@/lib/db/usage-analytics';
import type { PlanEvent } from '@/lib/db/plan-events';
import RecentActivityFeed from '@/components/admin/RecentActivityFeed';

const WINDOWS = [7, 14, 30] as const;
const INCLUDE_OWNER_KEY = 'ct-usage-include-owner';

/**
 * Days are UTC buckets stored as "YYYY-MM-DD", so they must be formatted in
 * UTC too — parsing as local time would shift the label a day for viewers
 * west of Greenwich.
 */
function formatUtcDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** X-axis tick spacing, anchored on the last (today's) bar so it is always labelled. */
function tickStepFor(dayCount: number): number {
  if (dayCount <= 7) return 1;
  if (dayCount <= 14) return 2;
  return 5;
}

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
  const [planEvents, setPlanEvents] = useState<PlanEvent[]>([]);
  const [planLast24h, setPlanLast24h] = useState(0);
  const [days, setDays] = useState<number>(14);
  const [includeOwner, setIncludeOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore the remembered choice before the first fetch settles; reading in an
  // effect (not in useState) keeps the server and client markup identical.
  useEffect(() => {
    try {
      if (localStorage.getItem(INCLUDE_OWNER_KEY) === '1') setIncludeOwner(true);
    } catch {
      // Private browsing / blocked storage — the default is fine.
    }
  }, []);

  const load = useCallback(async (windowDays: number, withOwner: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/analytics?days=${windowDays}${withOwner ? '&includeOwner=1' : ''}`,
      );
      const json = await res.json();
      if (json.success) {
        setSummary(json.summary);
        setPlanEvents(Array.isArray(json.planEvents) ? json.planEvents : []);
        setPlanLast24h(typeof json.planEventsLast24h === 'number' ? json.planEventsLast24h : 0);
      } else {
        setError(json.error || 'Failed to load analytics');
      }
    } catch {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days, includeOwner);
  }, [load, days, includeOwner]);

  const toggleIncludeOwner = () => {
    const next = !includeOwner;
    setIncludeOwner(next);
    try {
      localStorage.setItem(INCLUDE_OWNER_KEY, next ? '1' : '0');
    } catch {
      // Preference is a convenience; losing it is harmless.
    }
  };

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
          onClick={() => load(days, includeOwner)}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const s = summary;
  const lastIdx = s.days.length - 1;
  const today = s.days[lastIdx];
  const maxViews = Math.max(...s.days.map((d) => d.views), 1);
  const tickStep = tickStepFor(s.days.length);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Usage
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Page visits and clicks · UTC days ·{' '}
            {includeOwner ? 'your own activity included' : 'your own activity hidden'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleIncludeOwner}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            style={{
              background: includeOwner ? 'var(--accent-dim)' : 'var(--surface-1)',
              border: '1px solid var(--border-default)',
              color: includeOwner ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            aria-pressed={includeOwner}
            title={
              includeOwner
                ? 'Currently counting your own visits — click to hide them'
                : 'Your own visits are hidden — click to include them'
            }
          >
            <User className="w-3.5 h-3.5" />
            Include mine
          </button>
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
            onClick={() => load(days, includeOwner)}
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
        {/*
          Each column: value label · bar · date tick. Bars scale inside their
          own fixed-height track so labels never eat into the tallest bar.
          Ticks are spaced by window (every day / 2nd / 5th) counting back
          from today; on narrow screens only the two edge dates survive, and
          value labels drop out once there are too many bars to read them.
          Visibility (not display) toggles keep every column the same height
          so the bars share one baseline.
        */}
        <div className="flex items-end gap-1">
          {s.days.map((d, i) => {
            const label = formatUtcDay(d.date);
            const isTick = (lastIdx - i) % tickStep === 0;
            const isEdge = i === 0 || i === lastIdx;
            const tickVisibility = isTick
              ? isEdge
                ? 'visible'
                : 'invisible sm:visible'
              : isEdge
                ? 'visible sm:invisible'
                : 'invisible';
            // Edge ticks hug their side on narrow screens so they don't clip.
            const tickAlign = i === 0 ? 'self-start sm:self-center' : i === lastIdx ? 'self-end sm:self-center' : '';
            const valueVisibility = s.days.length > 14 ? 'invisible sm:visible' : 'visible';
            return (
              <div
                key={d.date}
                className="group relative flex-1 min-w-0 flex flex-col items-center"
                aria-label={`${label}: ${d.views} views, ${d.visitors} visitors`}
              >
                <div
                  className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  role="tooltip"
                >
                  {label} · {d.views} view{d.views === 1 ? '' : 's'} · {d.visitors} visitor{d.visitors === 1 ? '' : 's'}
                </div>
                <span
                  className={`h-4 text-[10px] font-semibold leading-4 tabular-nums ${valueVisibility}`}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {d.views > 0 ? d.views : ''}
                </span>
                <div className="w-full flex items-end" style={{ height: 96 }}>
                  <div
                    className="w-full rounded-t"
                    style={{
                      background: d.views > 0 ? 'var(--accent)' : 'var(--surface-2)',
                      height: `${Math.max((d.views / maxViews) * 100, 3)}%`,
                      opacity: d.views > 0 ? 0.9 : 1,
                    }}
                  />
                </div>
                <span
                  className={`h-4 mt-1 text-[10px] leading-4 whitespace-nowrap ${tickVisibility} ${tickAlign}`}
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {label}
                </span>
              </div>
            );
          })}
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

      {/* Merged plan + usage activity feed */}
      <RecentActivityFeed
        planEvents={planEvents}
        planLast24h={planLast24h}
        usageEvents={s.recentEvents}
        ownerHidden={!includeOwner}
      />
    </div>
  );
}
