'use client';

/**
 * Recent activity — the one feed on the Accounts tab. Plan-lifecycle events
 * (signups, trials, cancellations, deletions) and usage events (page views,
 * clicks) are interleaved newest-first so the owner reads a single timeline
 * instead of two cards that each grew without bound.
 *
 * Usage events outnumber plan events by an order of magnitude, so the chips
 * isolate the rare plan events without giving up the merged view. The list
 * scrolls inside a fixed height rather than extending the page.
 */

import { useMemo, useState } from 'react';
import { Activity, Eye, MousePointerClick } from 'lucide-react';
import type { PlanEvent } from '@/lib/db/plan-events';
import type { UsageEventWithLabel } from '@/lib/db/usage-analytics';

const PLAN_META: Record<string, { label: string; color: string }> = {
  signup: { label: 'New signup', color: 'var(--success, #3fb950)' },
  trial_started: { label: 'Trial started', color: 'var(--accent)' },
  referral_redeemed: { label: 'Referral redeemed', color: 'var(--accent)' },
  plan_cancelled: { label: 'Plan cancelled', color: '#f85149' },
  account_deleted: { label: 'Account deleted', color: '#f85149' },
  plan_expired: { label: 'Plan expired', color: '#d29922' },
  admin_grant: { label: 'Admin grant', color: '#58a6ff' },
  admin_revoke: { label: 'Admin revoke', color: '#d29922' },
  subscription_started: { label: 'Subscription started', color: 'var(--success, #3fb950)' },
  subscription_ended: { label: 'Subscription ended', color: '#f85149' },
  payment_failed: { label: 'Payment failed', color: '#d29922' },
};

type Filter = 'all' | 'plan' | 'usage';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'plan', label: 'Plans' },
  { id: 'usage', label: 'Usage' },
];

type FeedItem =
  | { kind: 'plan'; at: string; event: PlanEvent }
  | { kind: 'usage'; at: string; event: UsageEventWithLabel };

function formatAt(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function emptyText(filter: Filter, ownerHidden: boolean): string {
  if (filter === 'plan') {
    return 'No plan activity recorded yet — events appear here as users sign up, start trials, cancel, or delete.';
  }
  if (ownerHidden) return 'No activity from anyone but you yet — your own events are hidden.';
  return filter === 'usage'
    ? 'No usage recorded yet — events appear here as visitors browse and click.'
    : 'No activity recorded yet — events appear here as visitors browse, click, sign up, or change plans.';
}

function PlanRow({ event }: { event: PlanEvent }) {
  const meta = PLAN_META[event.type] ?? { label: event.type, color: 'var(--text-secondary)' };
  return (
    <>
      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: meta.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
          <strong>{meta.label}</strong>
          {event.email && <span style={{ color: 'var(--text-secondary)' }}> — {event.email}</span>}
        </p>
        {event.detail && (
          <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
            {event.detail}
          </p>
        )}
      </div>
    </>
  );
}

function UsageRow({ event }: { event: UsageEventWithLabel }) {
  return (
    <>
      {event.type === 'pageview' ? (
        <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
      ) : (
        <MousePointerClick className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#58a6ff' }} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
          {event.type === 'pageview' ? (
            <>Viewed <strong>{event.page}</strong></>
          ) : (
            <>
              Clicked <strong>{event.label}</strong>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>on {event.page}</span>
            </>
          )}
        </p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
          {event.visitorLabel}
        </p>
      </div>
    </>
  );
}

export default function RecentActivityFeed({
  planEvents,
  planLast24h,
  usageEvents,
  ownerHidden,
}: {
  planEvents: PlanEvent[];
  /** Plan events in the last 24h, counted server-side so render stays pure. */
  planLast24h: number;
  usageEvents: UsageEventWithLabel[];
  /** True when the owner's own events were filtered out upstream (affects empty-state copy). */
  ownerHidden: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const items = useMemo<FeedItem[]>(() => {
    const merged: FeedItem[] = [
      ...planEvents.map((event) => ({ kind: 'plan' as const, at: event.at, event })),
      ...usageEvents.map((event) => ({ kind: 'usage' as const, at: event.at, event })),
    ];
    return merged.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [planEvents, usageEvents]);

  const visible = filter === 'all' ? items : items.filter((item) => item.kind === filter);

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Recent activity
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {planEvents.length} plan · {usageEvents.length} usage · {planLast24h} plan event
            {planLast24h === 1 ? '' : 's'} in the last 24h
          </p>
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
                style={{
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  border: `1px solid ${active ? 'transparent' : 'var(--border-default)'}`,
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                aria-pressed={active}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {emptyText(filter, ownerHidden)}
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-1">
          {visible.map((item, i) => (
            <div
              key={`${item.kind}-${item.at}-${i}`}
              className="flex items-start gap-3 py-1.5"
              style={{ borderBottom: i < visible.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              {item.kind === 'plan' ? <PlanRow event={item.event} /> : <UsageRow event={item.event} />}
              <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {formatAt(item.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
