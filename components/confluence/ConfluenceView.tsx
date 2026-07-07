'use client';

/**
 * ConfluenceTrading — the owner-only "Agents" panel under Trading.
 *
 * Decision-support with a hard human gate: the agent proposes, the user
 * approves/edits/rejects, and only an approval places an order (paper mode for
 * now). This container fetches the data domains (system state, proposals,
 * orders, audit) and wires the review / monitoring / audit / settings panels.
 */

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Activity, ScrollText, SlidersHorizontal, Sparkles, FlaskConical, Play, LineChart, ClipboardCheck } from 'lucide-react';
import type { AgentRun, AuditEvent, ExecutionOrder, Proposal, SystemState } from '@/types/confluence';
import ProposalCard, { type EditState } from './ProposalCard';
import OrdersMonitor, { type LivePosition } from './OrdersMonitor';
import AuditLog from './AuditLog';
import SettingsPanel from './SettingsPanel';
import PerformancePanel from './PerformancePanel';
import ReviewPanel from './ReviewPanel';

type SubTab = 'queue' | 'orders' | 'performance' | 'review' | 'audit' | 'settings';

const SUBTABS: { id: SubTab; label: string; icon: typeof Inbox }[] = [
  { id: 'queue', label: 'Proposals', icon: Inbox },
  { id: 'orders', label: 'Orders', icon: Activity },
  { id: 'performance', label: 'Performance', icon: LineChart },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
  { id: 'audit', label: 'Audit', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

export default function ConfluenceView() {
  const [subTab, setSubTab] = useState<SubTab>('queue');
  const [state, setState] = useState<SystemState | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [orders, setOrders] = useState<ExecutionOrder[]>([]);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { last: number; asOf?: string }>>({});
  const [positionsNote, setPositionsNote] = useState<string | undefined>(undefined);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; msg: string } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, p, o, a, r, pos] = await Promise.all([
        fetch('/api/confluence/system').then((r) => r.json()),
        fetch('/api/confluence/proposals').then((r) => r.json()),
        fetch('/api/confluence/orders').then((r) => r.json()),
        fetch('/api/confluence/audit').then((r) => r.json()),
        fetch('/api/confluence/runs').then((r) => r.json()),
        fetch('/api/confluence/positions').then((r) => r.json()),
      ]);
      if (s.success) setState(s.state);
      if (p.success) setProposals(p.proposals);
      if (o.success) setOrders(o.orders);
      if (a.success) setAudit(a.events);
      if (r.success) setRuns(r.runs);
      if (pos.success) {
        setPositions(pos.positions ?? []);
        setPositionsNote(pos.reason);
      } else if (pos.error) {
        setPositions([]);
        setPositionsNote(`Positions unavailable: ${pos.error}`);
      }
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

  // Live quotes for the pending symbols — advisory context for review (the
  // agent priced off the prior close). Refreshes whenever the queue changes.
  useEffect(() => {
    const symbols = [...new Set(proposals.filter((p) => p.status === 'pending').map((p) => p.symbol))];
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    fetch(`/api/confluence/quotes?symbols=${symbols.join(',')}`)
      .then((r) => r.json())
      .then((q) => {
        if (q.success) setQuotes(q.quotes ?? {});
      })
      .catch(() => {});
  }, [proposals]);

  const pending = proposals.filter((p) => p.status === 'pending');

  const handleApprove = useCallback(
    async (id: string, edits: EditState) => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await fetch(`/api/confluence/proposals/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limitPrice: edits.limitPrice,
            quantity: edits.quantity,
            stopPrice: edits.stopPrice ?? null,
            targetPrice: edits.targetPrice ?? null,
            timeInForce: edits.timeInForce,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setBanner({ kind: 'error', msg: data.error || 'Approval failed.' });
        } else {
          setBanner({ kind: 'ok', msg: `Approved ${data.order?.symbol ?? ''} — order ${data.order?.status ?? 'staged'}.` });
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
      const [a, pos] = await Promise.all([
        fetch('/api/confluence/audit').then((r) => r.json()),
        fetch('/api/confluence/positions').then((r) => r.json()),
      ]);
      if (a.success) setAudit(a.events);
      if (pos.success) {
        setPositions(pos.positions ?? []);
        setPositionsNote(pos.reason);
      }
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

  const handleSaveState = useCallback(
    async (updates: Partial<SystemState>) => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await fetch('/api/confluence/system', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const data = await res.json();
        if (data.success) setState(data.state);
        else setBanner({ kind: 'error', msg: data.error || 'Failed to save settings.' });
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

  const handleRunAgent = useCallback(async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/confluence/runs', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const n = data.run?.proposalsGenerated ?? 0;
        setBanner({ kind: 'ok', msg: `Agent run complete — ${n} new proposal${n === 1 ? '' : 's'}${data.expired ? `, ${data.expired} expired` : ''}.` });
      } else {
        setBanner({ kind: 'error', msg: data.error || 'Agent run failed.' });
      }
    } catch {
      setBanner({ kind: 'error', msg: 'Agent run request failed.' });
    } finally {
      setBusy(false);
      await loadAll();
    }
  }, [loadAll]);

  const lastRun = runs[0];
  // Gate-passing candidates the last run dropped only because sizing rounded
  // to zero shares — surfaced so a too-small risk budget doesn't read as
  // "no setups found".
  const lastRunSizedOut = Array.isArray(lastRun?.metadata?.sizedOutSymbols)
    ? (lastRun.metadata.sizedOutSymbols as { symbol: string; riskPerShare: number; riskBudgetUsd: number }[])
    : [];

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading agents…</div>;
  }

  return (
    <div className="animate-fade-up">
      {/* Title + status badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Sparkles className="w-4.5 h-4.5" style={{ color: 'var(--accent-light)' }} />
            Agentic Trading
          </h2>
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Agent proposes · you approve · a deterministic service executes. The agent never places orders.
          </p>
        </div>
        {state && (
          <div className="flex items-center gap-2">
            {!state.tradingEnabled && <span className="badge badge-negative">DISARMED</span>}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {state.paperMode ? 'PAPER MODE' : 'LIVE MODE'}
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-col">
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                {pending.length} pending {pending.length === 1 ? 'proposal' : 'proposals'}
              </span>
              {lastRun && (
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Last run {new Date(lastRun.startedAt).toLocaleString()} · {lastRun.cadence} · {lastRun.proposalsGenerated} proposed · {lastRun.status}
                  {lastRunSizedOut.length > 0 && (
                    <>
                      {' · '}
                      <span
                        style={{ color: 'var(--warning)', cursor: 'help' }}
                        title={
                          'Passed all gates but the risk budget was too small for 1 share:\n' +
                          lastRunSizedOut
                            .map((s) => `${s.symbol} — $${s.riskPerShare}/share risk vs $${s.riskBudgetUsd} budget`)
                            .join('\n')
                        }
                      >
                        {lastRunSizedOut.length} sized out (risk budget too small)
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-50"
                onClick={handleRunAgent}
                disabled={busy}
                title="Run the analysis agent now (produces pending proposals only)"
              >
                <Play className="w-3.5 h-3.5" /> Run agent
              </button>
              <button className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-50" onClick={handleSeed} disabled={busy}>
                + Seed demo
              </button>
            </div>
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
                perPositionCapUsd={state?.perPositionCapUsd ?? 0}
                tradingEnabled={state?.tradingEnabled ?? false}
                busy={busy}
                liveQuote={quotes[p.symbol.toUpperCase()]}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))
          )}
        </div>
      )}

      {subTab === 'orders' && (
        <OrdersMonitor
          orders={orders}
          positions={positions}
          positionsNote={positionsNote}
          busy={busy}
          onRefresh={handleRefreshOrders}
          onCancel={handleCancel}
        />
      )}

      {subTab === 'performance' && <PerformancePanel />}

      {subTab === 'review' && <ReviewPanel />}

      {subTab === 'audit' && <AuditLog events={audit} />}

      {subTab === 'settings' && state && <SettingsPanel state={state} busy={busy} onSave={handleSaveState} />}
    </div>
  );
}
