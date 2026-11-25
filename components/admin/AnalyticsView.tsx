'use client';

/**
 * Analytics — the owner-only top-level tab, split by tracked property.
 *
 * Two sites report into the same analytics pipeline but are stored and
 * summarised independently (see lib/db/usage-analytics.ts), and this view
 * keeps them apart too: one site is shown at a time, picked by the toggle.
 *
 *   ConfluenceTrading  account metrics (users, tiers, brokerages) followed by
 *                      the app's usage analytics and merged activity feed.
 *   MJSWrites          mjswrites.com's usage analytics only — the blog has no
 *                      accounts, so there are no account metrics or plan
 *                      events to show.
 *
 * The chosen site lives in the URL (?site=mjswrites) so it survives reloads
 * and can be bookmarked; the app is the default and carries no param.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TrendingUp, Feather } from 'lucide-react';
import { parseAnalyticsSite, type AnalyticsSite } from '@/lib/analytics-sites';
import AccountMetricsView from '@/components/admin/AccountMetricsView';
import UsageAnalyticsView from '@/components/admin/UsageAnalyticsView';

const SITES: { id: AnalyticsSite; label: string; icon: React.ElementType; host: string }[] = [
  { id: 'app', label: 'ConfluenceTrading', icon: TrendingUp, host: 'confluencetrading.app' },
  { id: 'mjswrites', label: 'MJSWrites', icon: Feather, host: 'mjswrites.com' },
];

export default function AnalyticsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const site = parseAnalyticsSite(searchParams.get('site'));

  const setSite = useCallback(
    (next: AnalyticsSite) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'app') params.delete('site');
      else params.set('site', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="space-y-8">
      {/* Site toggle */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
        role="tablist"
        aria-label="Site"
      >
        {SITES.map((s) => {
          const active = s.id === site;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={active}
              onClick={() => setSite(s.id)}
              data-track={`Analytics site: ${s.label}`}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-4 h-4" />
              {s.label}
              <span className="hidden sm:inline text-[11px] font-normal" style={{ color: 'var(--text-tertiary)' }}>
                {s.host}
              </span>
            </button>
          );
        })}
      </div>

      {/* Remount on site change so each site's view starts from its own fresh fetch */}
      {site === 'app' ? (
        <div key="app" className="space-y-10">
          <AccountMetricsView />
          <UsageAnalyticsView site="app" />
        </div>
      ) : (
        <div key={site}>
          <UsageAnalyticsView site={site} />
        </div>
      )}
    </div>
  );
}
