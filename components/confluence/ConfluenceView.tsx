'use client';

/**
 * ConfluenceTrading — the owner-only tab.
 *
 * Decision-support with a hard human gate: the agent proposes, the user
 * approves/edits/rejects, and only an approval places an order (in paper mode
 * for now). This container fetches the four data domains (settings, proposals,
 * orders, audit) and wires the review / monitoring / audit / settings panels.
 */

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Activity, ScrollText, SlidersHorizontal, Sparkles, FlaskConical } from 'lucide-react';
import type { AuditEvent, ConfluenceSettings, ExecutionOrder, Proposal } from '@/types/confluence';
import ProposalCard, { type EditState } from './ProposalCard';
import OrdersMonitor from './OrdersMonitor';
import AuditLog from './AuditLog';
import SettingsPanel from './SettingsPanel';

type SubTab = 'queue' | 'orders' | 'audit' | 'settings';

const SUBTABS: { id: SubTab; label: string; icon: typeof Inbox }[] = [
  { id: 'queue', label: 'Proposals', icon: Inbox },
  { id: 'orders', label: 'Orders', icon: Activity },
  { id: 'audit', label: 'Audit', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

export default function ConfluenceView() {
  const [subTab, setSubTab] = useState<SubTab>('queue');
  const [settings, setSettings] = useState<ConfluenceSettings | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [orders, setOrders] = useState<ExecutionOrder[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; msg: string } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, p, o, a] = await Promise.all([
        fetch('/api/confluence/settings').then((r) => r.json()),
        fetch('/api/confluence/proposals').then((r) => r.json()),
        fetch('/api/confluence/orders').then((r) => r.json()),
        fetch('/api/confluence/audit').then((r) => r.json()),
      ]);
      if (s.success) setSettings(s.settings);
      if (p.success) setProposals(p.proposals);
      if (o.success) setOrders(o.orders);
      if (a.success) setAudit(a.events);
    } catch (e) {
      console.error('Failed to load ConfluenceTrading data:', e);
      setBanner({ kind: 'error', msg: 'Failed to load data.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pending = proposals.filter((p) => p.status === 'pending');

  const handleApprove = useCallback(
    async (id: string, edits: EditState | null) => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await fetch(`/api/confluence/proposals/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(edits ?? {}),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setBanner({ kind: 'error', msg: data.error || 'Approval failed.' });
        } else {
          setBanner({ kind: 'ok', msg: `Approved ${data.order?.ticker ?? ''} — order ${data.order?.status ?? 'staged'}.` });
        }
      } catch {
        setBanner({ kind: 'error', msg: 'Approval request failed.' });
      } finally {
        setBusy(false);
        await loadAll();
      }
    },
    [loadAll],
  );

  const handleReject = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await fetch(`/api/confluence/proposals/${id}/reject`, { method: 'POST' });
      } finally {
        setBusy(false);
        await loadAll();
      }
    },
    [loadAll],
  );

  const handleRefreshOrders = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/confluence/orders?refresh=1');
      const data = await res.json();
      if (data.success) setOrders(data.orders);
      const a = await fetch('/api/confluence/audit').then((r) => r.json());
      if (a.success) setAudit(a.events);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCancel = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await fetch(`/api/confluence/orders/${id}/cancel`, { method: 'POST' });
      } finally {
        setBusy(false);
        await loadAll();
      }
    },
    [loadAll],
  );

  const handleSaveSettings = useCallback(
    async (updates: Partial<ConfluenceSettings>) => {
      setBusy(true);
      try {
        const res = await fetch('/api/confluence/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const data = await res.json();
        if (data.success) setSettings(data.settings);
      } finally {
        setBusy(false);
        await loadAll();
      }
    },
    [loadAll],
  );

  const handleSeed = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/confluence/seed', { method: 'POST' });
    } finally {
      setBusy(false);
      await loadAll();
    }
  }, [loadAll]);

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading ConfluenceTrading…</div>;
  }

  return (
    <div className="animate-fade-up">
      {/* Title + paper-mode banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Sparkles className="w-4.5 h-4.5" style={{ color: 'var(--accent-light)' }} />
            ConfluenceTrading
          </h2>
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Agent proposes · you approve · a deterministic service executes. The agent never places orders.
          </p>
        </div>
        {settings && (
          <div className="flex items-center gap-2">
            {settings.killSwitch && (
              <span className="badge badge-negative">KILL SWITCH ON</span>
            )}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {settings.mode === 'paper' ? 'PAPER MODE' : 'LIVE MODE'}
            </span>
          </div>
        )}
      </div>

      {banner && (
        <div
          className="mb-4 px-3.5 py-2.5 rounded-lg text-[13px]"
          style={{
            background: banner.kind === 'error' ? 'var(--negative-dim)' : 'var(--positive-dim)',
            color: banner.kind === 'error' ? 'var(--negative)' : 'var(--positive)',
          }}
        >
          {banner.msg}
        </div>
      )}

      {/* Sub-tab nav */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {SUBTABS.map((t) => {
          const active = subTab === t.id;
          const count = t.id === 'queue' ? pending.length : t.id === 'orders' ? orders.length : 0;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                marginBottom: '-1px',
              }}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {count > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {subTab === 'queue' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {pending.length} pending {pending.length === 1 ? 'proposal' : 'proposals'}
            </span>
            <button className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-50" onClick={handleSeed} disabled={busy}>
              + Seed demo proposals
            </button>
          </div>
          {pending.length === 0 ? (
            <div className="card text-center py-10">
              <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                No pending proposals. Seed demo proposals to watch the flow end to end.
              </p>
            </div>
          ) : (
            pending.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                perPositionCapUsd={settings?.perPositionCapUsd ?? 0}
                busy={busy}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))
          )}
        </div>
      )}

      {subTab === 'orders' && (
        <OrdersMonitor orders={orders} busy={busy} onRefresh={handleRefreshOrders} onCancel={handleCancel} />
      )}

      {subTab === 'audit' && <AuditLog events={audit} />}

      {subTab === 'settings' && settings && (
        <SettingsPanel settings={settings} busy={busy} onSave={handleSaveSettings} />
      )}
    </div>
  );
}
