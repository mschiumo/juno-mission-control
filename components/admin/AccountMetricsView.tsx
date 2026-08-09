'use client';

/**
 * Accounts — owner-only metrics dashboard (top-level tab).
 *
 * Reads GET /api/admin/metrics: totals, tier/source breakdowns, brokerage
 * connections, expiring access, and the plan-events feed. The daily digest
 * email renders the same computation, so the two always agree.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Crown,
  Link2,
  Mail,
  RefreshCw,
  Sparkles,
  Gift,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import type { AccountMetrics } from '@/lib/admin-metrics';

const EVENT_META: Record<string, { label: string; color: string }> = {
  signup: { label: 'New signup', color: 'var(--success, #3fb950)' },
  trial_started: { label: 'Trial started', color: 'var(--accent)' },
  referral_redeemed: { label: 'Referral redeemed', color: 'var(--accent)' },
  plan_cancelled: { label: 'Plan cancelled', color: '#f85149' },
  account_deleted: { label: 'Account deleted', color: '#f85149' },
  plan_expired: { label: 'Plan expired', color: '#d29922' },
  admin_grant: { label: 'Admin grant', color: '#58a6ff' },
  admin_revoke: { label: 'Admin revoke', color: '#d29922' },
  trial_converting: { label: 'Trial converting soon', color: '#d29922' },
  subscription_started: { label: 'Subscription started', color: 'var(--success, #3fb950)' },
  subscription_ended: { label: 'Subscription ended', color: '#f85149' },
  payment_failed: { label: 'Payment failed', color: '#d29922' },
};

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

export default function AccountMetricsView() {
  const [metrics, setMetrics] = useState<AccountMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/metrics');
      const json = await res.json();
      if (json.success) setMetrics(json.metrics);
      else setError(json.error || 'Failed to load metrics');
    } catch {
      setError('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--accent)' }}
          aria-label="Loading metrics"
        />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="text-center py-24">
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          {error ?? 'No metrics available.'}
        </p>
        <button
          onClick={load}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const m = metrics;
  const paid = m.tiers.gold + m.tiers.platinum;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Accounts
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            As of {new Date(m.generatedAt).toLocaleString()} · same numbers as the daily digest email
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total accounts" value={m.totalUsers} />
        <StatCard
          icon={Crown}
          label="Paid tiers"
          value={paid}
          sub={`Gold ${m.tiers.gold} · Platinum ${m.tiers.platinum}`}
        />
        <StatCard
          icon={Link2}
          label="Brokerages connected"
          value={m.brokerageConnected}
          sub="each costs SnapTrade $/mo"
        />
        <StatCard icon={Mail} label="Briefing opt-ins" value={m.briefingOptIns} />
      </div>

      {/* Tier + source breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Tier breakdown
          </h3>
          {(
            [
              ['Silver (free)', m.tiers.silver, 'var(--text-secondary)'],
              ['Gold', m.tiers.gold, 'var(--accent)'],
              ['Platinum', m.tiers.platinum, '#58a6ff'],
            ] as [string, number, string][]
          ).map(([label, count, color]) => (
            <div key={label} className="flex items-center gap-3 mb-2">
              <span className="text-xs w-24" style={{ color: 'var(--text-secondary)' }}>
                {label}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    background: color,
                    width: m.totalUsers > 0 ? `${Math.max((count / m.totalUsers) * 100, count > 0 ? 4 : 0)}%` : '0%',
                  }}
                />
              </div>
              <span className="text-xs font-bold w-8 text-right" style={{ color: 'var(--text-primary)' }}>
                {count}
              </span>
            </div>
          ))}
          <p className="text-[11px] mt-3" style={{ color: 'var(--text-tertiary)' }}>
            Paid access by source — <Sparkles className="w-3 h-3 inline" /> trial {m.paidSources.trial} ·{' '}
            <Gift className="w-3 h-3 inline" /> referral {m.paidSources.referral} · admin {m.paidSources.admin} ·
            billing {m.paidSources.billing}. Lifetime: {m.trialsUsedTotal} trials used, {m.referralsRedeemedTotal}{' '}
            referrals redeemed.
          </p>
        </div>

        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
        >
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: '#d29922' }} />
            Expiring within 7 days
          </h3>
          {m.expiringWithin7Days.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Nothing expiring this week.
            </p>
          ) : (
            m.expiringWithin7Days.map((e) => (
              <div key={`${e.email}-${e.expiresAt}`} className="flex items-center justify-between mb-2">
                <span className="text-xs truncate mr-3" style={{ color: 'var(--text-secondary)' }}>
                  {e.email}
                </span>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                  {e.tier} ({e.source}) · {new Date(e.expiresAt).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Events feed */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          Recent activity
          <span className="text-[11px] font-normal" style={{ color: 'var(--text-tertiary)' }}>
            ({m.last24h.length} in the last 24h)
          </span>
        </h3>
        {m.recentEvents.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No plan activity recorded yet — events appear here as users sign up, start trials, cancel, or delete.
          </p>
        ) : (
          <div className="space-y-2">
            {m.recentEvents.map((e, i) => {
              const meta = EVENT_META[e.type] ?? { label: e.type, color: 'var(--text-secondary)' };
              return (
                <div
                  key={`${e.at}-${i}`}
                  className="flex items-start gap-3 py-1.5"
                  style={{ borderBottom: i < m.recentEvents.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                >
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: meta.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
                      <strong>{meta.label}</strong>
                      {e.email && <span style={{ color: 'var(--text-secondary)' }}> — {e.email}</span>}
                    </p>
                    {e.detail && (
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {e.detail}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(e.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
