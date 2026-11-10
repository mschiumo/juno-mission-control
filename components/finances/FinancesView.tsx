'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
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
  nextPaymentDue,
  nextPaymentSummary,
  daysUntil,
  toLocalDateKey,
} from '@/lib/finances/credit-cards';

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

function dueDateLabel(date?: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Today", "Tomorrow", "in 6d" — how far off a due date is. */
function dueInLabel(date: string, today: string): string {
  const days = daysUntil(date, today);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

/** Due within 3 days — about to leave the bank account. */
const DUE_SOON_DAYS = 3;

/* --------------------------------- helpers -------------------------------- */

interface Draft {
  name: string;
  balance: string;
  apr: string;
  monthlyPayment: string;
  dueDay: string; // day of month, '' = not set
}

const EMPTY_DRAFT: Draft = { name: '', balance: '', apr: '', monthlyPayment: '', dueDay: '' };

function draftFrom(a: CreditAccount): Draft {
  return {
    name: a.name,
    balance: String(a.balance),
    apr: String(a.apr),
    monthlyPayment: a.monthlyPayment ? String(a.monthlyPayment) : '',
    dueDay: a.dueDay ? String(a.dueDay) : '',
  };
}

/* --------------------------------- sorting -------------------------------- */

type SortKey = 'name' | 'balance' | 'apr' | 'interest' | 'payment' | 'due' | 'payoff';
type SortDir = 'asc' | 'desc';
interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** First click on a column picks the direction people actually want. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  balance: 'desc',
  apr: 'desc',
  interest: 'desc',
  payment: 'desc',
  due: 'asc',
  payoff: 'asc',
};

/** Months until payoff, with paid-off first and never-pays-off last. */
function payoffRank(a: CreditAccount): number {
  if (a.balance <= 0) return -1;
  const p = projectPayoff(a.balance, a.apr, a.monthlyPayment);
  return p.status === 'ok' ? p.months : Number.POSITIVE_INFINITY;
}

/** Days until the next due date, with "no date known" last. */
function dueRank(a: CreditAccount, today: string): number {
  const date = nextPaymentDue(a, today);
  return date ? daysUntil(date, today) : Number.POSITIVE_INFINITY;
}

function sortValue(a: CreditAccount, key: SortKey, today: string): number {
  switch (key) {
    case 'balance':
      return a.balance;
    case 'apr':
      return a.apr;
    case 'interest':
      return monthlyInterest(a.balance, a.apr);
    case 'payment':
      return a.monthlyPayment;
    case 'due':
      return dueRank(a, today);
    case 'payoff':
      return payoffRank(a);
    default:
      return 0;
  }
}

function compareAccounts(a: CreditAccount, b: CreditAccount, key: SortKey, today: string): number {
  if (key === 'name') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const va = sortValue(a, key, today);
  const vb = sortValue(b, key, today);
  // Comparison, not subtraction — Infinity - Infinity is NaN.
  return va === vb ? 0 : va < vb ? -1 : 1;
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

/** Clickable column header. `align` matches the cells underneath it. */
function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = 'right',
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onToggle: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th
      className={`${align === 'left' ? 'text-left px-4' : 'text-right px-3'} font-medium py-2.5 whitespace-nowrap`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-white ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-white' : ''}`}
        title={`Sort by ${label}`}
      >
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-[#F97316]' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

/* ------------------------------- main view -------------------------------- */

export default function FinancesView() {
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** null = the order the server returned. */
  const [sort, setSort] = useState<SortState | null>(null);

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    if (Array.isArray(data.accounts)) setAccounts(data.accounts as CreditAccount[]);
    if (Array.isArray(data.history)) setHistory(data.history as BalanceSnapshot[]);
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
      dueDay: draft.dueDay.trim() === '' ? null : parseInt(draft.dueDay, 10),
    };
    if (editingId) {
      mutate('PUT', { id: editingId, ...body });
    } else {
      mutate('POST', body);
    }
  }

  /* ------------------------------ derived data ----------------------------- */

  const totalDebt = accounts.reduce((s, a) => s + a.balance, 0);
  const totalMonthlyInterest = accounts.reduce((s, a) => s + monthlyInterest(a.balance, a.apr), 0);
  const totalPayments = accounts.reduce((s, a) => s + a.monthlyPayment, 0);
  const avgApr = weightedAvgApr(accounts);

  const avalancheId = accounts.filter((a) => a.balance > 0).sort((a, b) => b.apr - a.apr)[0]?.id;

  // Only rendered after the client-side fetch resolves, so the viewer's local
  // date is safe to read here without a hydration mismatch.
  const today = toLocalDateKey(new Date());
  const nextPayment = nextPaymentSummary(accounts, today);

  /** What both the table and the mobile cards render. Stable — ties keep server order. */
  const sortedAccounts = useMemo(() => {
    if (!sort) return accounts;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return accounts
      .map((a, i) => ({ a, i }))
      .sort((x, y) => {
        const c = compareAccounts(x.a, y.a, sort.key, today);
        return c !== 0 ? c * dir : x.i - y.i;
      })
      .map(({ a }) => a);
  }, [accounts, sort, today]);

  /** Click a header: sort by it, or flip the direction if it's already active. */
  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DEFAULT_DIR[key] },
    );
  }

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

  // History is sorted ascending by date, so the first snapshot is the starting balance.
  const startingDebt = history.length > 0 ? history[0].total : null;
  const totalPaidDown = startingDebt !== null ? startingDebt - totalDebt : null;
  const startDateLabel =
    history.length > 0
      ? new Date(history[0].date + 'T12:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : null;

  const chartData = history.map((h) => ({
    label: new Date(h.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total: Math.round(h.total * 100) / 100,
  }));

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
    { label: 'Monthly Payments', value: usd0(totalPayments) },
    {
      label: 'Next Payment',
      value: nextPayment ? (dueDateLabel(nextPayment.date) ?? '—') : '—',
      sub: nextPayment
        ? [
            dueInLabel(nextPayment.date, today),
            nextPayment.amount > 0 ? usd(nextPayment.amount) : 'amount not set',
            nextPayment.accounts.map((a) => a.name).join(', '),
          ].join(' · ')
        : 'set a due day on an account',
      warn: nextPayment !== null && daysUntil(nextPayment.date, today) <= DUE_SOON_DAYS,
    },
    {
      label: 'Total Debt Paid Down',
      value: totalPaidDown !== null ? usd(totalPaidDown) : '—',
      sub:
        startingDebt !== null
          ? `from ${usd0(startingDebt)} on ${startDateLabel}`
          : 'builds as history accrues',
      positive: totalPaidDown !== null && totalPaidDown > 0,
    },
  ];

  /** Next due date for an account, rolled forward from its due day. Amber when it's within a few days. */
  function DueCell({ account, prefix = '' }: { account: CreditAccount; prefix?: string }) {
    const date = nextPaymentDue(account, today);
    if (!date || account.balance <= 0) {
      return (
        <span className="text-[#484f58]" title="Edit the account to set a due day">
          {account.balance <= 0 ? '—' : `${prefix}not set`}
        </span>
      );
    }
    const days = daysUntil(date, today);
    const soon = days <= DUE_SOON_DAYS;
    return (
      <span
        className={soon ? 'text-[#d29922]' : 'text-white'}
        title={`Day ${account.dueDay} each month${
          account.monthlyPayment > 0 ? ` · ${usd(account.monthlyPayment)} planned` : ''
        }`}
      >
        {prefix}
        {dueDateLabel(date)}
        <span className={`ml-1 text-[10px] ${soon ? 'text-[#d29922]' : 'text-[#8b949e]'}`}>
          {dueInLabel(date, today)}
        </span>
      </span>
    );
  }

  function BalanceCell({ account }: { account: CreditAccount }) {
    return <span className="font-medium text-white tabular-nums">{usd(account.balance)}</span>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#8b949e]">{s.label}</p>
            <p
              className={`mt-1 text-lg md:text-xl font-semibold ${
                s.accent
                  ? 'text-[#FF8C38]'
                  : s.positive
                    ? 'text-[#3fb950]'
                    : s.warn
                      ? 'text-[#d29922]'
                      : 'text-white'
              }`}
            >
              {s.value}
            </p>
            {s.sub && <p className="text-[11px] text-[#8b949e] mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

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
          </div>
          <div className="flex items-center gap-1.5">
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
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
              <input
                className={inputClass}
                placeholder="Due day (1–31)"
                type="number"
                min="1"
                max="31"
                step="1"
                inputMode="numeric"
                value={draft.dueDay}
                onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
                title="Day of the month the payment is due"
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
                <SortHeader label="Account" sortKey="name" sort={sort} onToggle={toggleSort} align="left" />
                <SortHeader label="Balance" sortKey="balance" sort={sort} onToggle={toggleSort} />
                <SortHeader label="APR" sortKey="apr" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Interest/mo" sortKey="interest" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Payment/mo" sortKey="payment" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Payment Due" sortKey="due" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Payoff" sortKey="payoff" sort={sort} onToggle={toggleSort} />
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map((a) => {
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
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + ' text-right'}
                            type="number"
                            min="1"
                            max="31"
                            step="1"
                            inputMode="numeric"
                            value={draft.dueDay}
                            onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
                            placeholder="Day"
                            title="Day of the month the payment is due (1–31)"
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
                            {a.id === avalancheId && (
                              <span
                                className="text-[10px] font-semibold uppercase tracking-wide text-[#FF8C38] bg-[rgba(255,107,0,0.12)] rounded px-1.5 py-0.5"
                                title="Highest APR — put extra payments here first (avalanche method)"
                              >
                                Pay first
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <BalanceCell account={a} />
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#8b949e] tabular-nums">{a.apr.toFixed(2)}%</td>
                        <td className="px-3 py-2.5 text-right text-[#8b949e] tabular-nums">
                          {usd(monthlyInterest(a.balance, a.apr))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {a.monthlyPayment > 0 ? (
                            <span className="text-white">{usd(a.monthlyPayment)}</span>
                          ) : (
                            <span className="text-[#484f58]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <DueCell account={a} />
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
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-[#30363d]/60">
          {sortedAccounts.map((a) => {
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
                    <div className="grid grid-cols-2 gap-2">
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
                      <input
                        className={inputClass}
                        type="number"
                        min="1"
                        max="31"
                        step="1"
                        inputMode="numeric"
                        value={draft.dueDay}
                        onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
                        placeholder="Due day (1–31)"
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
                        {a.id === avalancheId && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#FF8C38] bg-[rgba(255,107,0,0.12)] rounded px-1.5 py-0.5">
                            Pay first
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8b949e] mt-1">
                        {a.apr.toFixed(2)}% APR · {usd(monthlyInterest(a.balance, a.apr))}/mo interest
                        {a.monthlyPayment > 0 && ` · paying ${usd0(a.monthlyPayment)}/mo`}
                      </p>
                      {a.balance > 0 && (
                        <p className="text-xs mt-0.5">
                          <DueCell account={a} prefix="Due " />
                        </p>
                      )}
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
    </div>
  );
}
