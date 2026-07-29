'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Landmark,
  Pin,
  Link2,
  Unlink,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  CreditAccount,
  BalanceSnapshot,
  monthlyInterest,
  projectPayoff,
  weightedAvgApr,
  isLinked,
  isPinned,
} from '@/lib/finances/credit-cards';

/* ---------------------------------- types --------------------------------- */

interface PublicPlaidItem {
  itemId: string;
  institutionName: string;
  createdAt: string;
  lastSyncedAt?: string;
  status: 'ok' | 'reauth-required' | 'error';
  error?: string;
}

interface PlaidState {
  configured: boolean;
  sandbox: boolean;
  items: PublicPlaidItem[];
}

interface SyncOutcome {
  institutionName: string;
  status: 'ok' | 'reauth-required' | 'error';
  message?: string;
  accountsCreated: number;
  accountsUpdated: number;
}

// Plaid Link is loaded from their CDN at runtime rather than bundled.
interface PlaidLinkHandler {
  open: () => void;
  destroy: () => void;
}
interface PlaidLinkMetadata {
  institution?: { name?: string; institution_id?: string } | null;
}
declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
        onExit: (error: unknown) => void;
      }) => PlaidLinkHandler;
    };
  }
}

/* -------------------------------- formatting ------------------------------- */

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const usd0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatMonths(months: number): string {
  if (months <= 0) return 'Paid off';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y}y ${m}m`;
}

function payoffDateLabel(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Compact "synced 2h ago" stamp. Only ever runs client-side, post-fetch. */
function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'never';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueDateLabel(date?: string): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* --------------------------------- helpers -------------------------------- */

interface Draft {
  name: string;
  balance: string;
  apr: string;
  monthlyPayment: string;
}

const EMPTY_DRAFT: Draft = { name: '', balance: '', apr: '', monthlyPayment: '' };

function draftFrom(a: CreditAccount): Draft {
  return {
    name: a.name,
    balance: String(a.balance),
    apr: String(a.apr),
    monthlyPayment: a.monthlyPayment ? String(a.monthlyPayment) : '',
  };
}

let plaidScriptPromise: Promise<void> | null = null;

/** Load Plaid Link's CDN bundle once per page. */
function loadPlaidScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;

  plaidScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      plaidScriptPromise = null; // allow a retry on the next click
      reject(new Error('Could not load Plaid Link'));
    };
    document.head.appendChild(script);
  });
  return plaidScriptPromise;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-[#8b949e] mb-0.5">{label}</p>
      <p className="text-white font-semibold">{usd(payload[0].value)}</p>
    </div>
  );
}

/** Per-account live/error chip. Manual accounts render nothing. */
function SyncBadge({ account, onReconnect }: { account: CreditAccount; onReconnect: () => void }) {
  if (!isLinked(account)) return null;

  if (account.syncStatus === 'reauth-required') {
    return (
      <button
        onClick={onReconnect}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#d29922] bg-[rgba(210,153,34,0.14)] hover:bg-[rgba(210,153,34,0.24)] rounded px-1.5 py-0.5 transition-colors"
        title={account.syncError || 'Bank login expired — reconnect to resume syncing'}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        Reconnect
      </button>
    );
  }

  if (account.syncStatus === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#f85149] bg-[rgba(248,81,73,0.14)] rounded px-1.5 py-0.5"
        title={account.syncError || 'Last sync failed'}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        Sync failed
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#3fb950] bg-[rgba(63,185,80,0.14)] rounded px-1.5 py-0.5"
      title={`Synced from ${account.institutionName ?? 'your bank'} ${relativeTime(account.lastSyncedAt)}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
      Live
    </span>
  );
}

/** Second line under an account name: institution, mask, and sync stamp. */
function AccountSubline({ account }: { account: CreditAccount }) {
  if (!isLinked(account)) {
    return <span className="text-[11px] text-[#484f58]">Manual entry</span>;
  }
  const bits = [account.institutionName, account.mask ? `••${account.mask}` : null].filter(Boolean);
  return (
    <span className="text-[11px] text-[#8b949e]">
      {bits.join(' · ')}
      {bits.length ? ' · ' : ''}
      synced {relativeTime(account.lastSyncedAt)}
    </span>
  );
}

/* ------------------------------- main view -------------------------------- */

export default function FinancesView() {
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [plaid, setPlaid] = useState<PlaidState>({ configured: false, sandbox: false, items: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    if (Array.isArray(data.accounts)) setAccounts(data.accounts as CreditAccount[]);
    if (Array.isArray(data.history)) setHistory(data.history as BalanceSnapshot[]);
    if (data.plaid) setPlaid(data.plaid as PlaidState);
    else if (Array.isArray(data.items)) {
      setPlaid((prev) => ({ ...prev, items: data.items as PublicPlaidItem[] }));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/finances/credit-cards?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) applyPayload(data);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: object,
    query?: string,
  ) {
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/finances/credit-cards${query ?? ''}`, {
        method,
        ...(body
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
      const data = await res.json();
      if (data.success) {
        applyPayload(data);
        setEditingId(null);
        setAdding(false);
        setDraft(EMPTY_DRAFT);
        setConfirmDeleteId(null);
      } else {
        setFormError(data.error || 'Something went wrong');
      }
    } catch {
      setFormError('Network error — try again');
    } finally {
      setSaving(false);
    }
  }

  function submitDraft() {
    const body = {
      name: draft.name,
      balance: parseFloat(draft.balance) || 0,
      apr: parseFloat(draft.apr) || 0,
      monthlyPayment: parseFloat(draft.monthlyPayment) || 0,
    };
    if (editingId) mutate('PUT', { id: editingId, ...body });
    else mutate('POST', body);
  }

  function summarize(outcomes: SyncOutcome[] | undefined): string {
    if (!outcomes?.length) return 'Nothing to refresh.';
    const updated = outcomes.reduce((s, o) => s + o.accountsUpdated, 0);
    const created = outcomes.reduce((s, o) => s + o.accountsCreated, 0);
    const failed = outcomes.filter((o) => o.status !== 'ok');
    const parts: string[] = [];
    if (updated) parts.push(`${updated} ${updated === 1 ? 'account' : 'accounts'} updated`);
    if (created) parts.push(`${created} added`);
    if (!parts.length && !failed.length) parts.push('already up to date');
    if (failed.length) {
      parts.push(`${failed.length} needs attention (${failed.map((f) => f.institutionName).join(', ')})`);
    }
    return parts.join(' · ');
  }

  async function refresh() {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch('/api/finances/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        applyPayload(data);
        const outcomes = data.summary?.outcomes as SyncOutcome[] | undefined;
        const anyFailed = outcomes?.some((o) => o.status !== 'ok');
        setNotice({ kind: anyFailed ? 'warn' : 'ok', text: summarize(outcomes) });
      } else {
        setNotice({ kind: 'error', text: data.error || 'Refresh failed' });
      }
    } catch {
      setNotice({ kind: 'error', text: 'Refresh failed — check your connection.' });
    } finally {
      setSyncing(false);
    }
  }

  /** Run Plaid Link. Passing an itemId re-authenticates that connection. */
  async function connectBank(itemId?: string) {
    setConnecting(true);
    setNotice(null);
    try {
      const tokenRes = await fetch('/api/finances/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemId ? { itemId } : {}),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.success) {
        setNotice({ kind: 'error', text: tokenData.error || 'Could not start bank connection' });
        return;
      }

      await loadPlaidScript();
      if (!window.Plaid) {
        setNotice({ kind: 'error', text: 'Plaid Link failed to load — try again.' });
        return;
      }

      const handler = window.Plaid.create({
        token: tokenData.linkToken,
        onSuccess: async (publicToken, metadata) => {
          setSyncing(true);
          try {
            const res = await fetch('/api/finances/plaid/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                publicToken,
                institutionName: metadata?.institution?.name,
                institutionId: metadata?.institution?.institution_id,
              }),
            });
            const data = await res.json();
            if (data.success) {
              applyPayload(data);
              setNotice({
                kind: 'ok',
                text: `${metadata?.institution?.name ?? 'Bank'} connected — ${summarize(data.summary?.outcomes)}`,
              });
            } else {
              setNotice({ kind: 'error', text: data.error || 'Could not finish linking' });
            }
          } catch {
            setNotice({ kind: 'error', text: 'Could not finish linking — try again.' });
          } finally {
            setSyncing(false);
            handler.destroy();
          }
        },
        onExit: () => handler.destroy(),
      });
      handler.open();
    } catch {
      setNotice({ kind: 'error', text: 'Could not open Plaid Link — try again.' });
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(itemId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/finances/plaid/items?itemId=${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        applyPayload(data);
        setNotice(
          data.warning
            ? { kind: 'warn', text: data.warning }
            : { kind: 'ok', text: 'Disconnected. Those accounts are now manual and kept their balances.' },
        );
      } else {
        setNotice({ kind: 'error', text: data.error || 'Could not disconnect' });
      }
    } catch {
      setNotice({ kind: 'error', text: 'Could not disconnect — try again.' });
    } finally {
      setSaving(false);
      setConfirmDisconnectId(null);
    }
  }

  /* ------------------------------ derived data ----------------------------- */

  const totalDebt = accounts.reduce((s, a) => s + a.balance, 0);
  const totalMonthlyInterest = accounts.reduce((s, a) => s + monthlyInterest(a.balance, a.apr), 0);
  const totalPayments = accounts.reduce((s, a) => s + a.monthlyPayment, 0);
  const avgApr = weightedAvgApr(accounts);
  const liveCount = accounts.filter((a) => isLinked(a) && a.syncStatus === 'ok').length;

  const avalancheId = accounts.filter((a) => a.balance > 0).sort((a, b) => b.apr - a.apr)[0]?.id;

  const carried = accounts.filter((a) => a.balance > 0);
  const projections = carried.map((a) => ({ a, p: projectPayoff(a.balance, a.apr, a.monthlyPayment) }));
  const missingPayment = projections.filter(({ p }) => p.status === 'no-payment');
  const tooLow = projections.filter(({ p }) => p.status === 'payment-too-low');
  const allProjected = carried.length > 0 && missingPayment.length === 0 && tooLow.length === 0;
  const debtFreeMonths = allProjected
    ? Math.max(...projections.map(({ p }) => (p.status === 'ok' ? p.months : 0)))
    : null;
  const projectedInterest = allProjected
    ? projections.reduce((s, { p }) => s + (p.status === 'ok' ? p.totalInterest : 0), 0)
    : null;

  const chartData = history.map((h) => ({
    label: new Date(h.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total: Math.round(h.total * 100) / 100,
  }));

  const lastSyncedOverall = plaid.items
    .map((i) => i.lastSyncedAt)
    .filter((v): v is string => !!v)
    .sort()
    .pop();

  const inputClass =
    'w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#8b949e]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-8 text-center text-sm text-[#8b949e]">
        Couldn&apos;t load your accounts. Refresh to try again.
      </div>
    );
  }

  const stats = [
    { label: 'Total Debt', value: usd(totalDebt), accent: true },
    {
      label: 'Monthly Interest',
      value: usd0(totalMonthlyInterest),
      sub: `${usd0(totalMonthlyInterest * 12)}/yr`,
    },
    { label: 'Avg APR', value: `${avgApr.toFixed(2)}%`, sub: 'balance-weighted' },
    {
      label: 'Monthly Payments',
      value: usd0(totalPayments),
      sub: liveCount ? `${liveCount} of ${accounts.length} live` : undefined,
    },
  ];

  /** Balance cell with a pin marker when the user has overridden the synced value. */
  function BalanceCell({ account }: { account: CreditAccount }) {
    const pinned = isPinned(account, 'balance');
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <span className="font-medium text-white tabular-nums">{usd(account.balance)}</span>
        {pinned && (
          <button
            onClick={() => mutate('PATCH', { id: account.id, action: 'resume-sync' })}
            disabled={saving}
            className="text-[#d29922] hover:text-[#f0b72f] transition-colors"
            title={`You set this by hand${
              account.syncedBalance !== undefined ? ` — your bank reports ${usd(account.syncedBalance)}` : ''
            }. Click to resume syncing.`}
          >
            <Pin className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#8b949e]">{s.label}</p>
            <p className={`mt-1 text-lg md:text-xl font-semibold ${s.accent ? 'text-[#FF8C38]' : 'text-white'}`}>
              {s.value}
            </p>
            {s.sub && <p className="text-[11px] text-[#8b949e] mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {notice && (
        <div
          className="flex items-start justify-between gap-3 rounded-xl px-4 py-2.5 text-sm border"
          style={{
            background:
              notice.kind === 'error'
                ? 'rgba(248,81,73,0.08)'
                : notice.kind === 'warn'
                  ? 'rgba(210,153,34,0.08)'
                  : 'rgba(63,185,80,0.08)',
            borderColor:
              notice.kind === 'error'
                ? 'rgba(248,81,73,0.3)'
                : notice.kind === 'warn'
                  ? 'rgba(210,153,34,0.3)'
                  : 'rgba(63,185,80,0.3)',
            color: notice.kind === 'error' ? '#f85149' : notice.kind === 'warn' ? '#d29922' : '#3fb950',
          }}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Balance history */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
          <TrendingDown className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Balance Over Time</h2>
        </div>
        {chartData.length >= 2 ? (
          <div className="px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="debtGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97316" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#8b949e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="total" stroke="#F97316" strokeWidth={2} fill="url(#debtGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[#8b949e]">
            History builds as balances change — update a balance on a new day and the chart appears here.
          </div>
        )}
      </div>

      {/* Accounts */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-wrap">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-semibold text-white">Lines of Credit</h2>
            <span className="text-xs text-[#8b949e]">{accounts.length}</span>
            {plaid.sandbox && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wide text-[#d29922] bg-[rgba(210,153,34,0.14)] rounded px-1.5 py-0.5"
                title="PLAID_ENV is sandbox — connected data is Plaid's test data, not your real accounts."
              >
                Sandbox
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {plaid.items.length > 0 && (
              <button
                onClick={refresh}
                disabled={syncing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] hover:text-white hover:bg-[#30363d] disabled:opacity-40 transition-colors"
                title={lastSyncedOverall ? `Last synced ${relativeTime(lastSyncedOverall)}` : 'Pull the latest balances'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            {plaid.configured && (
              <button
                onClick={() => connectBank()}
                disabled={connecting || syncing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#58a6ff] bg-[rgba(88,166,255,0.12)] hover:bg-[rgba(88,166,255,0.2)] disabled:opacity-40 transition-colors"
              >
                {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />}
                Connect bank
              </button>
            )}
            {!adding && (
              <button
                onClick={() => {
                  setAdding(true);
                  setEditingId(null);
                  setDraft(EMPTY_DRAFT);
                  setFormError('');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#FF8C38] bg-[rgba(255,107,0,0.12)] hover:bg-[rgba(255,107,0,0.2)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Account
              </button>
            )}
          </div>
        </div>

        {/* Add form */}
        {adding && (
          <div className="px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/30">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <input
                className={inputClass + ' col-span-2 md:col-span-1'}
                placeholder="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
              <input
                className={inputClass}
                placeholder="Balance $"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={draft.balance}
                onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="APR %"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={draft.apr}
                onChange={(e) => setDraft({ ...draft, apr: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Payment $/mo"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={draft.monthlyPayment}
                onChange={(e) => setDraft({ ...draft, monthlyPayment: e.target.value })}
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={submitDraft}
                  disabled={saving || !draft.name.trim()}
                  className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#F97316] hover:bg-[#ea6a0a] disabled:opacity-40 transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setDraft(EMPTY_DRAFT);
                    setFormError('');
                  }}
                  className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {formError && <p className="mt-2 text-xs text-[#f85149]">{formError}</p>}
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#8b949e] border-b border-[#30363d]">
                <th className="text-left font-medium px-4 py-2.5">Account</th>
                <th className="text-right font-medium px-3 py-2.5">Balance</th>
                <th className="text-right font-medium px-3 py-2.5">APR</th>
                <th className="text-right font-medium px-3 py-2.5">Interest/mo</th>
                <th className="text-right font-medium px-3 py-2.5">Payment/mo</th>
                <th className="text-right font-medium px-3 py-2.5">Payoff</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const editing = editingId === a.id;
                const proj = projectPayoff(a.balance, a.apr, a.monthlyPayment);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-[#30363d]/60 last:border-0 hover:bg-[#0d1117]/40 transition-colors"
                  >
                    {editing ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            className={inputClass}
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + ' text-right'}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.balance}
                            onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + ' text-right'}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.apr}
                            onChange={(e) => setDraft({ ...draft, apr: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-[#8b949e]">—</td>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + ' text-right'}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.monthlyPayment}
                            onChange={(e) => setDraft({ ...draft, monthlyPayment: e.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-[#8b949e]">—</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={submitDraft}
                              disabled={saving}
                              className="p-1.5 rounded-lg text-[#3fb950] hover:bg-[#30363d] transition-colors"
                              title="Save"
                            >
                              {saving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setFormError('');
                              }}
                              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-white">{a.name}</span>
                            <SyncBadge account={a} onReconnect={() => connectBank(a.plaidItemId)} />
                            {a.id === avalancheId && (
                              <span
                                className="text-[10px] font-semibold uppercase tracking-wide text-[#FF8C38] bg-[rgba(255,107,0,0.12)] rounded px-1.5 py-0.5"
                                title="Highest APR — put extra payments here first (avalanche method)"
                              >
                                Pay first
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5">
                            <AccountSubline account={a} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <BalanceCell account={a} />
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#8b949e] tabular-nums">
                          {a.apr.toFixed(2)}%
                          {isPinned(a, 'apr') && (
                            <button
                              onClick={() => mutate('PATCH', { id: a.id, action: 'resume-sync' })}
                              disabled={saving}
                              className="ml-1 align-middle text-[#d29922] hover:text-[#f0b72f] transition-colors"
                              title={`You set this APR by hand${
                                a.syncedApr !== undefined ? ` — your bank reports ${a.syncedApr.toFixed(2)}%` : ''
                              }. Click to resume syncing.`}
                            >
                              <Pin className="inline w-2.5 h-2.5" />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#8b949e] tabular-nums">
                          {usd(monthlyInterest(a.balance, a.apr))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {a.monthlyPayment > 0 ? (
                            <span className="text-white">{usd(a.monthlyPayment)}</span>
                          ) : (
                            <span className="text-[#484f58]">—</span>
                          )}
                          {a.minPayment !== undefined && (
                            <span
                              className="block text-[10px] text-[#484f58]"
                              title="Statement minimum reported by your bank"
                            >
                              min {usd0(a.minPayment)}
                              {dueDateLabel(a.nextDueDate) ? ` · due ${dueDateLabel(a.nextDueDate)}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs">
                          {proj.status === 'ok' && a.balance > 0 ? (
                            <span
                              className="text-[#3fb950]"
                              title={`Debt-free ${payoffDateLabel(proj.months)} · ${usd0(proj.totalInterest)} interest`}
                            >
                              {formatMonths(proj.months)} · {payoffDateLabel(proj.months)}
                            </span>
                          ) : proj.status === 'payment-too-low' ? (
                            <span
                              className="inline-flex items-center gap-1 text-[#f85149]"
                              title="Payment doesn't cover monthly interest — the balance will grow"
                            >
                              <AlertTriangle className="w-3 h-3" /> Too low
                            </span>
                          ) : a.balance <= 0 ? (
                            <span className="text-[#3fb950]">Paid off</span>
                          ) : (
                            <span className="text-[#484f58]">Set payment</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingId(a.id);
                                setAdding(false);
                                setDraft(draftFrom(a));
                                setFormError('');
                                setConfirmDeleteId(null);
                              }}
                              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteId === a.id ? (
                              <button
                                onClick={() => mutate('DELETE', undefined, `?id=${a.id}`)}
                                disabled={saving}
                                className="p-1.5 rounded-lg text-[#f85149] bg-[rgba(248,81,73,0.15)] transition-colors"
                                title="Confirm delete"
                              >
                                {saving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(a.id)}
                                className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#f85149] hover:bg-[#30363d] transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#30363d] bg-[#0d1117]/50">
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
                  Total Due
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-[#FF8C38] tabular-nums">{usd(totalDebt)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-[#8b949e] tabular-nums">{avgApr.toFixed(2)}%</td>
                <td className="px-3 py-2.5 text-right text-xs text-[#8b949e] tabular-nums">
                  {usd(totalMonthlyInterest)}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-[#8b949e] tabular-nums">
                  {totalPayments > 0 ? usd(totalPayments) : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-[#30363d]/60">
          {accounts.map((a) => {
            const editing = editingId === a.id;
            const proj = projectPayoff(a.balance, a.apr, a.monthlyPayment);
            return (
              <div key={a.id} className="px-4 py-3">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      className={inputClass}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="Name"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.balance}
                        onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
                        placeholder="Balance"
                      />
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.apr}
                        onChange={(e) => setDraft({ ...draft, apr: e.target.value })}
                        placeholder="APR %"
                      />
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.monthlyPayment}
                        onChange={(e) => setDraft({ ...draft, monthlyPayment: e.target.value })}
                        placeholder="$/mo"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={submitDraft}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#F97316] hover:bg-[#ea6a0a] disabled:opacity-40 transition-colors"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}{' '}
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setFormError('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white text-sm">{a.name}</span>
                        <SyncBadge account={a} onReconnect={() => connectBank(a.plaidItemId)} />
                        {a.id === avalancheId && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#FF8C38] bg-[rgba(255,107,0,0.12)] rounded px-1.5 py-0.5">
                            Pay first
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5">
                        <AccountSubline account={a} />
                      </p>
                      <p className="text-xs text-[#8b949e] mt-1">
                        {a.apr.toFixed(2)}% APR · {usd(monthlyInterest(a.balance, a.apr))}/mo interest
                        {a.monthlyPayment > 0 && ` · paying ${usd0(a.monthlyPayment)}/mo`}
                      </p>
                      <p className="text-xs mt-0.5">
                        {proj.status === 'ok' && a.balance > 0 ? (
                          <span className="text-[#3fb950]">
                            Debt-free {payoffDateLabel(proj.months)} ({formatMonths(proj.months)})
                          </span>
                        ) : proj.status === 'payment-too-low' ? (
                          <span className="text-[#f85149]">Payment below monthly interest</span>
                        ) : a.balance <= 0 ? (
                          <span className="text-[#3fb950]">Paid off</span>
                        ) : (
                          <span className="text-[#484f58]">No payment set</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-white tabular-nums">
                        <BalanceCell account={a} />
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-1.5">
                        <button
                          onClick={() => {
                            setEditingId(a.id);
                            setAdding(false);
                            setDraft(draftFrom(a));
                            setFormError('');
                            setConfirmDeleteId(null);
                          }}
                          className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === a.id ? (
                          <button
                            onClick={() => mutate('DELETE', undefined, `?id=${a.id}`)}
                            disabled={saving}
                            className="p-1.5 rounded-lg text-[#f85149] bg-[rgba(248,81,73,0.15)]"
                            title="Confirm delete"
                          >
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(a.id)}
                            className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#f85149] hover:bg-[#30363d] transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="px-4 py-3 flex items-center justify-between bg-[#0d1117]/50">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Total Due</span>
            <span className="font-semibold text-[#FF8C38] tabular-nums">{usd(totalDebt)}</span>
          </div>
        </div>

        {formError && !adding && <p className="px-4 pb-3 text-xs text-[#f85149]">{formError}</p>}
      </div>

      {/* Payoff outlook */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3.5">
        {allProjected && debtFreeMonths !== null ? (
          <p className="text-sm text-[#8b949e]">
            At the current payments ({usd0(totalPayments)}/mo), you&apos;ll be debt-free by{' '}
            <span className="text-[#3fb950] font-semibold">{payoffDateLabel(debtFreeMonths)}</span> (
            {formatMonths(debtFreeMonths)}), paying{' '}
            <span className="text-white font-medium">{usd0(projectedInterest!)}</span> in interest along the way.
          </p>
        ) : tooLow.length > 0 ? (
          <p className="text-sm text-[#f85149]">
            {tooLow.map(({ a }) => a.name).join(', ')}: the monthly payment doesn&apos;t cover interest — those
            balances will grow. Raise the payment to see a payoff date.
          </p>
        ) : (
          <p className="text-sm text-[#8b949e]">
            Set a monthly payment on each card to project your debt-free date.
            {missingPayment.length > 0 && missingPayment.length < carried.length && (
              <span className="text-[#484f58]">
                {' '}
                Missing: {missingPayment.map(({ a }) => a.name).join(', ')}.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Connected banks */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
          <Landmark className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Connected Banks</h2>
          {plaid.items.length > 0 && <span className="text-xs text-[#8b949e]">{plaid.items.length}</span>}
        </div>

        {!plaid.configured ? (
          <div className="px-4 py-4 text-sm text-[#8b949e]">
            <p>Live bank sync is not configured on this deployment yet.</p>
            <p className="text-xs text-[#484f58] mt-1.5">
              Set <code className="text-[#8b949e]">PLAID_CLIENT_ID</code>,{' '}
              <code className="text-[#8b949e]">PLAID_SECRET</code>,{' '}
              <code className="text-[#8b949e]">PLAID_ENV</code>, and{' '}
              <code className="text-[#8b949e]">FINANCE_TOKEN_SECRET</code> in Vercel, then reload. Manual tracking
              works regardless.
            </p>
          </div>
        ) : plaid.items.length === 0 ? (
          <div className="px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-[#8b949e]">
              No banks connected. Link one to pull balances, APRs, and statement minimums automatically.
            </p>
            <button
              onClick={() => connectBank()}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#58a6ff] bg-[rgba(88,166,255,0.12)] hover:bg-[rgba(88,166,255,0.2)] disabled:opacity-40 transition-colors"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Connect a bank
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#30363d]/60">
            {plaid.items.map((item) => (
              <div key={item.itemId} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{item.institutionName}</span>
                    {item.status === 'ok' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#3fb950] bg-[rgba(63,185,80,0.14)] rounded px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#d29922] bg-[rgba(210,153,34,0.14)] rounded px-1.5 py-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {item.status === 'reauth-required' ? 'Needs reconnect' : 'Error'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8b949e] mt-0.5">
                    Synced {relativeTime(item.lastSyncedAt)}
                    {item.error ? ` · ${item.error}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.status !== 'ok' && (
                    <button
                      onClick={() => connectBank(item.itemId)}
                      disabled={connecting}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#58a6ff] bg-[rgba(88,166,255,0.12)] hover:bg-[rgba(88,166,255,0.2)] disabled:opacity-40 transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Reconnect
                    </button>
                  )}
                  {confirmDisconnectId === item.itemId ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#8b949e]">Accounts stay, sync stops.</span>
                      <button
                        onClick={() => disconnect(item.itemId)}
                        disabled={saving}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#f85149] bg-[rgba(248,81,73,0.15)] hover:bg-[rgba(248,81,73,0.25)] disabled:opacity-40 transition-colors"
                      >
                        {saving ? 'Disconnecting…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDisconnectId(null)}
                        className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDisconnectId(item.itemId)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] hover:text-[#f85149] hover:bg-[#30363d] transition-colors"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
