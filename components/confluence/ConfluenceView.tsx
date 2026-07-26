'use client';

/**
 * ConfluenceTrading — the owner-only "Agents" terminal under Trading.
 *
 * Decision-support with a hard human gate: the agent proposes, the user
 * approves/edits/rejects, and only an approval places an order. This container
 * fetches the data domains (system state, proposals, orders, audit, positions,
 * performance) and renders the redesigned terminal:
 *
 *  - Desktop (≥768px): full-viewport shell — sidebar (icon rail below 1280px)
 *    + top bar + one segmented sub-tab row. The old three stacked nav tiers
 *    collapse into the sidebar; other sections navigate back to the standard
 *    app shell.
 *  - Mobile (<768px): a companion surface — approve proposals, watch stops,
 *    kill orders. Bottom tab bar; deep analysis stays on desktop under More.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Inbox, Play } from 'lucide-react';
import type { AgentRun, AuditEvent, ExecutionOrder, PerformanceStats, Proposal, SystemState } from '@/types/confluence';
import ProposalCard from './ProposalCard';
import { type LivePosition } from './OrdersMonitor';
import StrategyPanel from './StrategyPanel';
import AuditLog from './AuditLog';
import SettingsPanel from './SettingsPanel';
import PerformancePanel from './PerformancePanel';
import ReviewPanel from './ReviewPanel';
import Sidebar, { type TradingDestination } from './terminal/Sidebar';
import TopBar from './terminal/TopBar';
import OrdersTable from './terminal/OrdersTable';
import { NextProposalsPanel, PositionsPanel } from './terminal/RightRail';
import MobileShell, { type MobileTab } from './terminal/MobileShell';
import MobileHome from './terminal/MobileHome';
import MobileMore from './terminal/MobileMore';
import ProposalSheet from './terminal/ProposalSheet';
import { DangerBanner } from './terminal/atoms';
import { money, proposalNotional } from './terminal/format';

type SubTab = 'queue' | 'orders' | 'performance' | 'review' | 'audit' | 'strategy' | 'settings';

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'queue', label: 'Proposals' },
  { id: 'orders', label: 'Orders' },
  { id: 'performance', label: 'Performance' },
  { id: 'review', label: 'Review' },
  { id: 'audit', label: 'Audit' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'settings', label: 'Settings' },
];

/** Poll cadence while the tab is focused. The spec suggests 15s; 60s respects
 * the broker adapter's rate limits (positions hit Robinhood live). */
const REFRESH_MS = 60_000;

export default function ConfluenceView() {
  const router = useRouter();
  const { data: session } = useSession();
  const [subTab, setSubTab] = useState<SubTab>('queue');
  const [mobileTab, setMobileTab] = useState<MobileTab>('home');
  const [state, setState] = useState<SystemState | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [orders, setOrders] = useState<ExecutionOrder[]>([]);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { last: number; asOf?: string }>>({});
  const [positionsNote, setPositionsNote] = useState<string | undefined>(undefined);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; msg: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [proposalIndex, setProposalIndex] = useState(0);

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

  // Buying power comes from the performance snapshot; fetched separately so a
  // slow broker call never blocks first paint.
  const loadPerf = useCallback(async () => {
    try {
      const res = await fetch('/api/confluence/performance');
      const data = await res.json();
      if (data.success && data.stats) setPerfStats(data.stats);
    } catch {
      /* buying-power display degrades to "—" */
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadPerf();
  }, [loadAll, loadPerf]);

  // Auto-refresh positions/orders while the tab is focused (cache reads — a
  // broker poll stays behind the explicit Refresh button).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/confluence/orders')
        .then((r) => r.json())
        .then((o) => {
          if (o.success) setOrders(o.orders);
        })
        .catch(() => {});
      fetch('/api/confluence/positions')
        .then((r) => r.json())
        .then((pos) => {
          if (pos.success) {
            setPositions(pos.positions ?? []);
            setPositionsNote(pos.reason);
          }
        })
        .catch(() => {});
    };
    const interval = setInterval(tick, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // The terminal owns the viewport; keep the page behind it from scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Keep the Agents-tab notification badge honest: broadcast the pending
  // count whenever proposals change (approve/reject/run/refresh), so the
  // badge clears the moment the queue empties instead of waiting for the
  // 5-minute poll in TradingView.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('confluence:pending-count', {
        detail: proposals.filter((p) => p.status === 'pending').length,
      }),
    );
  }, [proposals]);

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

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pending = proposals.filter((p) => p.status === 'pending');

  // Keep the sheet index valid as the queue shrinks.
  useEffect(() => {
    if (proposalIndex >= pending.length && pending.length > 0) setProposalIndex(pending.length - 1);
    if (pending.length === 0) setProposalIndex(0);
  }, [pending.length, proposalIndex]);

  const buyingPower = perfStats?.buyingPower ?? null;
  const blocked = buyingPower != null ? pending.filter((p) => proposalNotional(p) > buyingPower) : [];

  const handleApprove = useCallback(
    async (
      id: string,
      edits: { limitPrice: number; quantity: number; stopPrice?: number; targetPrice?: number; timeInForce: string },
    ) => {
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
          setToast(data.error || 'Approval failed.');
        } else {
          const sym = data.order?.symbol ?? '';
          setBanner({ kind: 'ok', msg: `Approved ${sym} — order ${data.order?.status ?? 'staged'}.` });
          setToast(`Order submitted — ${sym}${data.order?.stopPrice != null ? ' stop attached' : ''}`);
        }
      } catch {
        setBanner({ kind: 'error', msg: 'Approval request failed.' });
        setToast('Approval request failed.');
      } finally {
        setBusy(false);
        await loadAll();
        loadPerf();
      }
    },
    [loadAll, loadPerf],
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
        loadPerf();
      }
    },
    [loadAll, loadPerf],
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

  // Sidebar / More-list navigation back to the standard Trading shell.
  const navigateTo = useCallback(
    (dest: TradingDestination) => {
      router.replace(`/?tab=trading&subtab=${dest}`, { scroll: false });
    },
    [router],
  );
  const exitTerminal = useCallback(() => {
    // Full navigation: the page shell reads ?tab= only on mount.
    window.location.href = '/?tab=dashboard';
  }, []);

  // Keyboard: 1–7 jump the segmented tabs (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SUBTABS.length) setSubTab(SUBTABS[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lastRun = runs[0];
  // Freshness + plain-English outcome for the run banner: the owner should
  // never have to wonder whether the morning screen ran or what it concluded.
  const lastRunAge = lastRun ? Date.now() - new Date(lastRun.startedAt).getTime() : null;
  const lastRunFresh = lastRunAge != null && lastRunAge < 24 * 60 * 60 * 1000;
  const lastRunInPlay = Array.isArray(lastRun?.metadata?.alreadyInPlay)
    ? (lastRun.metadata.alreadyInPlay as string[])
    : [];
  // Gate-passing candidates the last run dropped only because sizing rounded
  // to zero shares — surfaced so a too-small risk budget doesn't read as
  // "no setups found".
  const lastRunSizedOut = Array.isArray(lastRun?.metadata?.sizedOutSymbols)
    ? (lastRun.metadata.sizedOutSymbols as { symbol: string; riskPerShare: number; riskBudgetUsd: number }[])
    : [];

  const userInitial = session?.user?.name?.charAt(0).toUpperCase() || 'U';
  const paperMode = state?.paperMode ?? true;
  const tradingEnabled = state?.tradingEnabled ?? false;
  const account = state?.agenticAccount;

  const openProposalReview = () => {
    setSubTab('queue');
    const firstBlocked = blocked[0];
    if (firstBlocked) {
      const i = pending.findIndex((p) => p.id === firstBlocked.id);
      if (i >= 0) setProposalIndex(i);
    }
    setMobileTab('proposals');
  };

  const sheetApprove = (p: Proposal) => {
    handleApprove(p.id, {
      limitPrice: p.suggestedLimitPrice ?? 0,
      quantity: p.suggestedQuantity ?? 0,
      stopPrice: p.suggestedStopPrice,
      targetPrice: p.suggestedTargetPrice,
      timeInForce: 'gfd',
    });
  };

  /* ---------- shared blocks ---------- */

  const buyingPowerBanner = blocked.length > 0 && buyingPower != null && (
    <DangerBanner action="Review proposal" onAction={openProposalReview}>
      Order notional <b className="ct-num" style={{ fontWeight: 600 }}>{money(proposalNotional(blocked[0]))}</b> exceeds account
      buying power <b className="ct-num" style={{ fontWeight: 600 }}>{money(buyingPower)}</b> — {blocked.length}{' '}
      {blocked.length === 1 ? 'proposal' : 'proposals'} blocked.
    </DangerBanner>
  );

  const runBanner = lastRun && (
    <div
      className="flex items-start gap-3"
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--ct-surface)',
        border: `1px solid ${lastRun.status === 'failed' ? 'var(--ct-neg-border)' : lastRunFresh ? 'var(--ct-border)' : 'rgba(245,166,35,0.35)'}`,
      }}
    >
      <div
        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        style={{
          background: lastRun.status === 'failed' ? 'var(--ct-neg)' : lastRunFresh ? 'var(--ct-pos)' : '#f5a623',
        }}
      />
      <div style={{ fontFamily: 'var(--ct-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ct-dim)' }}>
        <span style={{ color: 'var(--ct-text)', fontWeight: 600 }}>
          {lastRun.status === 'failed'
            ? 'Last screen FAILED'
            : `Screen ran ${new Date(lastRun.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
        </span>
        {lastRun.status !== 'failed' && (
          <>
            {' — '}
            {typeof lastRun.universeSize === 'number' ? `${lastRun.universeSize} symbols screened` : 'screen completed'}
            {typeof lastRun.metadata?.valueGatePassed === 'number'
              ? `, ${lastRun.metadata.valueGatePassed as number} passed the value gate`
              : ''}
            {', '}
            {lastRun.proposalsGenerated > 0 ? (
              <b style={{ color: 'var(--ct-text)' }}>{lastRun.proposalsGenerated} proposed</b>
            ) : (
              <b style={{ color: 'var(--ct-text)' }}>no opportunities matched the strategy</b>
            )}
            {'.'}
            {lastRun.proposalsGenerated === 0 && (
              <span>
                {' '}Zero-proposal days are the strategy being selective — nothing was in the pullback zone
                {lastRunInPlay.length > 0
                  ? ` (and ${lastRunInPlay.length} qualifying ${lastRunInPlay.length === 1 ? 'name is' : 'names are'} already in play: ${lastRunInPlay.join(', ')})`
                  : ''}
                .
              </span>
            )}
            {lastRunSizedOut.length > 0 && (
              <span
                style={{ color: '#f5a623', cursor: 'help' }}
                title={lastRunSizedOut
                  .map((x) => `${x.symbol} — $${x.riskPerShare}/share risk vs $${x.riskBudgetUsd} budget`)
                  .join('\n')}
              >
                {' '}{lastRunSizedOut.length} sized out (risk budget too small).
              </span>
            )}
          </>
        )}
        {lastRun.status === 'failed' && <span> — check the run entry and cron results; no screen output was produced.</span>}
        {!lastRunFresh && lastRun.status !== 'failed' && (
          <span style={{ color: '#f5a623' }}> Over 24h old — the pre-open cron may not have run today.</span>
        )}
      </div>
    </div>
  );

  const queuePanel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-dim)' }}>
          {pending.length} pending {pending.length === 1 ? 'proposal' : 'proposals'}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 disabled:opacity-50"
            style={{
              padding: '7px 13px',
              borderRadius: 8,
              background: 'var(--ct-accent)',
              color: 'var(--ct-accent-fg)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 12,
              fontWeight: 700,
            }}
            onClick={handleRunAgent}
            disabled={busy}
            title="Run the analysis agent now (produces pending proposals only)"
          >
            <Play className="w-3.5 h-3.5" /> Run agent
          </button>
          <button
            className="disabled:opacity-50"
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border-strong)',
              color: 'var(--ct-muted)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 12,
              fontWeight: 500,
            }}
            onClick={handleSeed}
            disabled={busy}
          >
            + Seed demo
          </button>
        </div>
      </div>
      {runBanner}
      {pending.length === 0 ? (
        <div
          className="text-center"
          style={{ padding: '40px 16px', borderRadius: 12, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
        >
          <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--ct-ghost)' }} />
          <p style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
            {lastRun && lastRunFresh && lastRun.status === 'completed'
              ? 'The agent has nothing to propose — the screen ran and found no setups today.'
              : 'No pending proposals. Seed demo proposals to watch the flow end to end.'}
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
  );

  const skeleton = (
    <div className="flex flex-col gap-2.5" style={{ padding: '26px 0' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="ct-skeleton" style={{ height: 44 }} />
      ))}
    </div>
  );

  /* ---------- render ---------- */

  return (
    <div className="ct-terminal fixed inset-0 z-50 overflow-hidden" style={{ height: '100dvh' }}>
      {/* Desktop / tablet (≥768px) */}
      <div className="hidden md:flex h-full">
        <Sidebar
          pendingCount={pending.length}
          buyingPower={buyingPower}
          buyingPowerConstrained={blocked.length > 0}
          account={account}
          paperMode={paperMode}
          onNavigate={navigateTo}
          onExit={exitTerminal}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar paperMode={paperMode} tradingEnabled={tradingEnabled} userInitial={userInitial} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto flex flex-col" style={{ maxWidth: 1560, padding: '18px 26px 26px', gap: 16 }}>
              {buyingPowerBanner}

              {banner && (
                <div
                  style={{
                    padding: '11px 16px',
                    borderRadius: 10,
                    background: banner.kind === 'error' ? 'var(--ct-neg-bg)' : 'var(--ct-pos-bg)',
                    border: `1px solid ${banner.kind === 'error' ? 'var(--ct-neg-border)' : 'rgba(52,211,153,0.25)'}`,
                    color: banner.kind === 'error' ? 'var(--ct-neg-text)' : 'var(--ct-pos-text)',
                    fontFamily: 'var(--ct-sans)',
                    fontSize: 13,
                  }}
                >
                  {banner.msg}
                </div>
              )}

              {/* Segmented sub-tab row */}
              <div className="ct-seg self-start max-w-full overflow-x-auto">
                {SUBTABS.map((t) => {
                  const active = subTab === t.id;
                  const count = t.id === 'queue' ? pending.length : t.id === 'orders' ? orders.length : 0;
                  return (
                    <button key={t.id} className={`ct-seg-item ${active ? 'active' : ''}`} onClick={() => setSubTab(t.id)}>
                      {t.label}
                      {count > 0 && (
                        <span className="ct-num" style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color: active ? 'var(--ct-dim)' : 'var(--ct-dimmer)' }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {loading ? (
                skeleton
              ) : (
                <>
                  {subTab === 'queue' && queuePanel}

                  {subTab === 'orders' && (
                    <div className="flex flex-col xl:grid xl:grid-cols-[minmax(0,1fr)_360px] items-start" style={{ gap: 18 }}>
                      <div className="order-2 xl:order-1 w-full min-w-0">
                        <OrdersTable orders={orders} account={account} busy={busy} onRefresh={handleRefreshOrders} onCancel={handleCancel} />
                      </div>
                      <div className="order-1 xl:order-2 w-full flex flex-col" style={{ gap: 14 }}>
                        <PositionsPanel positions={positions} note={positionsNote} connected={!positionsNote} />
                        <NextProposalsPanel proposals={pending} buyingPower={buyingPower} onReview={() => setSubTab('queue')} />
                      </div>
                    </div>
                  )}

                  {subTab === 'performance' && <PerformancePanel />}
                  {subTab === 'review' && <ReviewPanel />}
                  {subTab === 'audit' && <AuditLog events={audit} />}
                  {subTab === 'strategy' && <StrategyPanel />}
                  {subTab === 'settings' && state && <SettingsPanel state={state} busy={busy} onSave={handleSaveState} />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile (<768px) — companion surface */}
      <div className="md:hidden h-full relative">
        <MobileShell
          active={mobileTab}
          pendingCount={pending.length}
          paperMode={paperMode}
          toast={toast}
          onSelect={(tab) => {
            if (tab === 'journal') {
              navigateTo('overview');
              return;
            }
            setMobileTab(tab);
          }}
          onExit={exitTerminal}
        >
          {loading ? (
            <div style={{ padding: '0 20px' }}>{skeleton}</div>
          ) : mobileTab === 'more' ? (
            <MobileMore state={state} audit={audit} busy={busy} onSaveState={handleSaveState} onNavigate={navigateTo} onExit={exitTerminal} />
          ) : mobileTab === 'proposals' && pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1" style={{ padding: '0 20px', gap: 8 }}>
              <Inbox className="w-8 h-8" style={{ color: 'var(--ct-ghost)' }} />
              <p style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)', textAlign: 'center' }}>
                The agent has nothing to propose.
              </p>
            </div>
          ) : (
            <MobileHome
              positions={positions}
              positionsNote={positionsNote}
              orders={orders}
              account={account}
              buyingPower={buyingPower}
              blockedCount={blocked.length}
              blockedNotional={blocked.length > 0 ? proposalNotional(blocked[0]) : null}
              busy={busy}
              onReviewProposal={openProposalReview}
              onCancelOrder={handleCancel}
            />
          )}
        </MobileShell>

        {mobileTab === 'proposals' && pending.length > 0 && (
          <ProposalSheet
            proposals={pending}
            index={proposalIndex}
            buyingPower={buyingPower}
            tradingEnabled={tradingEnabled}
            busy={busy}
            onIndexChange={setProposalIndex}
            onApprove={sheetApprove}
            onClose={() => setMobileTab('home')}
          />
        )}
      </div>
    </div>
  );
}
