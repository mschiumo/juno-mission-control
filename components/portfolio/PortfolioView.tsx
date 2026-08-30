'use client';

/**
 * Portfolio tab — long-term investment account (Platinum feature; the owner
 * always has it).
 *
 * A separate SnapTrade connection from the Trading tab's: this one tracks the
 * owner's buy-and-hold brokerage account and never feeds the Journal or the
 * trading Performance curve. Sections: connect state → stat cards → value
 * chart → holdings table → transactions (with recurring detection) → weekly
 * AI review.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  PieChart,
  RefreshCw,
  Link2,
  Unlink,
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  Repeat,
  Sparkles,
  Coins,
  ReceiptText,
  AlertTriangle,
  CheckCircle2,
  X,
  Play,
  Archive,
  ChevronDown,
} from 'lucide-react';
import { InfoTooltip } from '@/components/trading/performance-shared';
import { brokerLogoPath } from '@/lib/broker-logos';
import PortfolioReviewModal, { type PortfolioReview } from './PortfolioReviewModal';

/* ── API payload types (mirror the /api/portfolio responses) ─────────────── */

interface Position {
  symbol: string;
  description?: string;
  units: number;
  price: number | null;
  avgCost: number | null;
  costBasis: number | null;
  marketValue: number | null;
  openPnl: number | null;
  accountId: string;
}

interface AccountSummary {
  id: string;
  brokerage: string;
  name: string;
  number?: string;
  totalValue: number | null;
  cash: number | null;
}

interface BalancePoint {
  date: string;
  balance: number;
}

interface Snapshot {
  accounts: AccountSummary[];
  positions: Position[];
  totalValue: number | null;
  cash: number | null;
  openPnl: number;
  balances: BalancePoint[];
  syncedAt: string;
}

interface RecurringFlow {
  type: string;
  amount: number;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  occurrences: number;
  lastDate: string;
  monthlyAmount: number;
}

interface Summary {
  connected: boolean;
  configured: boolean;
  accounts?: { id: string; brokerage: string; name: string; number?: string }[];
  connectedAt?: string;
  lastSyncedAt?: string | null;
  snapshot?: Snapshot | null;
  weights?: { symbol: string; weight: number; marketValue: number }[];
  recurring?: RecurringFlow[];
  income?: { dividends30d: number; dividends12m: number; interest12m: number };
  cashFlows?: { netContributions12m: number; deposits12m: number; withdrawals12m: number };
  activitiesCount?: number;
}

interface Activity {
  id: string;
  date: string;
  type: string;
  description?: string;
  symbol?: string;
  amount: number | null;
  units?: number;
  price?: number;
  fee?: number;
  accountId: string;
}

type Review = PortfolioReview;

/* ── Formatting helpers ──────────────────────────────────────────────────── */

const usd = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const signed = (n: number) => `${n < 0 ? '-' : '+'}${usd(Math.abs(n))}`;

function pnlColor(n: number | null | undefined): string {
  if (n == null || n === 0) return 'var(--text-secondary)';
  return n > 0 ? 'var(--positive)' : 'var(--negative)';
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Render a stored YYYY-MM-DD as-is — never through a timeZone override. */
function displayDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ── Transaction presentation ────────────────────────────────────────────── */

const TYPE_FILTERS = [
  { id: '', label: 'All' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'interest', label: 'Interest' },
  { id: 'trades', label: 'Trades' },
  { id: 'fees', label: 'Fees' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'other', label: 'Other' },
] as const;

function typeBadge(type: string): { label: string; color: string; bg: string } {
  switch (type) {
    case 'CONTRIBUTION':
      return { label: 'Deposit', color: 'var(--positive)', bg: 'var(--positive-dim)' };
    case 'WITHDRAWAL':
      return { label: 'Withdrawal', color: 'var(--negative)', bg: 'var(--negative-dim)' };
    case 'DIVIDEND':
    case 'STOCK_DIVIDEND':
    case 'REI':
      return { label: type === 'REI' ? 'Reinvest' : 'Dividend', color: 'var(--info)', bg: 'rgba(77,166,255,0.1)' };
    case 'INTEREST':
      return { label: 'Interest', color: 'var(--info)', bg: 'rgba(77,166,255,0.1)' };
    case 'BUY':
      return { label: 'Buy', color: 'var(--accent-light)', bg: 'var(--accent-dim)' };
    case 'SELL':
      return { label: 'Sell', color: 'var(--accent-light)', bg: 'var(--accent-dim)' };
    case 'FEE':
    case 'TAX':
      return { label: type === 'TAX' ? 'Tax' : 'Fee', color: 'var(--warning)', bg: 'rgba(245,166,35,0.1)' };
    case 'TRANSFER':
      return { label: 'Transfer', color: 'var(--text-secondary)', bg: 'var(--border-subtle)' };
    default:
      return { label: type.charAt(0) + type.slice(1).toLowerCase(), color: 'var(--text-secondary)', bg: 'var(--border-subtle)' };
  }
}

/* ── Chart bits ──────────────────────────────────────────────────────────── */

type Period = '1M' | '3M' | 'YTD' | '1Y' | 'ALL';
const PERIODS: Period[] = ['1M', '3M', 'YTD', '1Y', 'ALL'];

function periodCutoff(period: Period): string | null {
  const now = new Date();
  if (period === 'ALL') return null;
  if (period === 'YTD') return `${now.getFullYear()}-01-01`;
  const days = period === '1M' ? 30 : period === '3M' ? 91 : 365;
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)' }}
    >
      <p style={{ color: 'var(--text-tertiary)' }}>{displayDate(label)}</p>
      <p className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {usd0(payload[0].value)}
      </p>
    </div>
  );
}

/**
 * Larger take on performance-shared's MetricCard for the headline stats —
 * same anatomy, bumped padding and value size so the top row reads at a
 * glance.
 */
function BigMetricCard({
  icon,
  label,
  value,
  valueStyle,
  sub,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
  sub?: string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-semibold inline-flex items-center" style={{ color: 'var(--text-tertiary)' }}>
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)', ...valueStyle }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function PortfolioView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityFilter, setActivityFilter] = useState('');
  const [activityLimit, setActivityLimit] = useState(50);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [runningReview, setRunningReview] = useState(false);
  const [modalReview, setModalReview] = useState<Review | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveRef = useRef<HTMLDivElement | null>(null);

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<Period>('ALL');

  // Post-connect banner from the /portfolio/connected handoff.
  const bannerParam = searchParams.get('portfolio');
  const bannerName = searchParams.get('name');
  const bannerReason = searchParams.get('reason');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const dismissBanner = () => {
    setBannerDismissed(true);
    const params = new URLSearchParams(searchParams);
    params.delete('portfolio');
    params.delete('name');
    params.delete('reason');
    params.delete('positions');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/summary');
      const json = await res.json();
      if (json.success) setSummary(json.data);
      else setError(json.error || 'Failed to load portfolio');
    } catch {
      setError('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivities = useCallback(async (filter: string) => {
    try {
      const qs = filter ? `?type=${filter}&limit=500` : '?limit=500';
      const res = await fetch(`/api/portfolio/activities${qs}`);
      const json = await res.json();
      if (json.success) setActivities(json.data.activities);
    } catch {
      /* table just stays empty */
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/review');
      const json = await res.json();
      if (json.success) setReviews(json.data.reviews);
    } catch {
      /* review card shows empty state */
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadReviews();
  }, [loadSummary, loadReviews]);

  useEffect(() => {
    if (summary?.connected) loadActivities(activityFilter);
  }, [summary?.connected, activityFilter, loadActivities]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/connect', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.url) {
        window.location.href = json.url;
        return;
      }
      setError(json.error || 'Could not start the connection.');
    } catch {
      setError('Could not start the connection.');
    }
    setConnecting(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/sync', { method: 'POST' });
      const json = await res.json();
      if (!json.success) setError(json.error || 'Sync failed.');
      await loadSummary();
      await loadActivities(activityFilter);
    } catch {
      setError('Sync failed.');
    }
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    setSyncing(true);
    try {
      await fetch('/api/portfolio/disconnect', { method: 'DELETE' });
      setSummary(null);
      setActivities([]);
      setReviews([]);
      setLoading(true);
      await loadSummary();
    } finally {
      setSyncing(false);
    }
  };

  const handleRunReview = async () => {
    setRunningReview(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/review', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.data?.review) {
        // Mirror Journal Insights: a fresh report opens straight into the modal.
        setModalReview(json.data.review);
      } else if (!json.success) {
        setError(json.error || 'Review failed.');
      }
      await loadReviews();
    } catch {
      setError('Review failed.');
    }
    setRunningReview(false);
  };

  // Close the past-reviews dropdown on any outside click.
  useEffect(() => {
    if (!archiveOpen) return;
    const onClick = (e: MouseEvent) => {
      if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) {
        setArchiveOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [archiveOpen]);

  /* ── Derived view data ─────────────────────────────────────────────── */

  const snapshot = summary?.snapshot ?? null;

  const chartData = useMemo(() => {
    if (!snapshot) return [];
    const cutoff = periodCutoff(chartPeriod);
    return cutoff ? snapshot.balances.filter(b => b.date >= cutoff) : snapshot.balances;
  }, [snapshot, chartPeriod]);

  const weekChange = useMemo(() => {
    if (!snapshot || snapshot.balances.length < 2) return null;
    const series = snapshot.balances;
    const last = series[series.length - 1];
    const cutoff = new Date(Date.parse(last.date) - 7 * 86400000).toISOString().slice(0, 10);
    let base = series[0];
    for (const p of series) {
      if (p.date <= cutoff) base = p;
      else break;
    }
    return last.balance - base.balance;
  }, [snapshot]);

  const totalCostBasis = useMemo(
    () => snapshot?.positions.reduce((s, p) => s + (p.costBasis ?? 0), 0) ?? 0,
    [snapshot]
  );

  const recurringDeposits = (summary?.recurring ?? []).filter(f => f.type === 'CONTRIBUTION');
  const recurringMonthly = recurringDeposits.reduce((s, f) => s + f.monthlyAmount, 0);

  /** Mark a transaction row that matches a detected recurring flow. */
  const isRecurring = useCallback(
    (a: Activity) =>
      (summary?.recurring ?? []).some(
        f => f.type === a.type && Math.abs(a.amount ?? 0).toFixed(2) === f.amount.toFixed(2)
      ),
    [summary?.recurring]
  );

  const latestReview = reviews[0] ?? null;

  /* ── Render ────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="p-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Loading portfolio…
      </div>
    );
  }

  if (!summary?.connected) {
    return (
      <div className="max-w-xl mx-auto mt-10 animate-fade-up">
        <div className="card text-center">
          <div
            className="mx-auto mb-4 w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent-dim)' }}
          >
            <PieChart className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Long-term Portfolio
          </h2>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Connect your investment brokerage to track positions, performance, and
            transactions — deposits, withdrawals, dividends — alongside a weekly
            AI review of your holdings.
          </p>
          <p className="text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
            Read-only access via SnapTrade, fully separate from your trading
            connection. Brokerage data refreshes about once a day.
          </p>
          {error && (
            <p className="text-xs mb-3" style={{ color: 'var(--negative)' }}>
              {error}
            </p>
          )}
          <button
            onClick={handleConnect}
            disabled={connecting || !summary?.configured}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Link2 className="w-4 h-4" />
            {connecting ? 'Opening portal…' : 'Connect brokerage'}
          </button>
          {!summary?.configured && (
            <p className="text-xs mt-3" style={{ color: 'var(--warning)' }}>
              Brokerage connections aren’t configured in this environment.
            </p>
          )}
        </div>
      </div>
    );
  }

  const account = summary.accounts?.[0];
  const logo = account ? brokerLogoPath(account.brokerage) : null;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Post-connect banner */}
      {bannerParam && !bannerDismissed && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{
            background:
              bannerParam === 'connected' ? 'var(--positive-dim)' : bannerParam === 'partial' ? 'rgba(245,166,35,0.1)' : 'var(--negative-dim)',
            border: `1px solid ${
              bannerParam === 'connected' ? 'rgba(0,200,150,0.3)' : bannerParam === 'partial' ? 'rgba(245,166,35,0.3)' : 'rgba(255,61,87,0.3)'
            }`,
            color: 'var(--text-primary)',
          }}
        >
          {bannerParam === 'connected' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--positive)' }} />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: bannerParam === 'partial' ? 'var(--warning)' : 'var(--negative)' }} />
          )}
          <span className="flex-1">
            {bannerParam === 'connected'
              ? `${bannerName || 'Brokerage'} connected — your portfolio is synced.`
              : bannerParam === 'partial'
                ? 'Connected, but the first sync didn’t finish. Use "Sync now" to retry.'
                : `Connection didn’t complete${bannerReason ? `: ${bannerReason}` : '.'}`}
          </span>
          <button onClick={dismissBanner} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--negative-dim)', border: '1px solid rgba(255,61,87,0.3)', color: 'var(--text-primary)' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--negative)' }} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header: account + sync controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={account?.brokerage ?? ''} className="w-6 h-6 rounded" />
          ) : (
            <Landmark className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          )}
          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {account?.brokerage ?? 'Portfolio'}
            </p>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
              {account?.name}
              {account?.number ? ` ·  ${account.number}` : ''}
            </p>
          </div>
        </div>
        <div className="flex-1" />
        {summary.lastSyncedAt && (
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Synced {relativeTime(summary.lastSyncedAt)}
          </span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Sync now
        </button>
        {confirmDisconnect ? (
          <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Disconnect and clear portfolio data?
            <button
              onClick={handleDisconnect}
              className="px-2.5 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--negative-dim)', color: 'var(--negative)' }}
            >
              Disconnect
            </button>
            <button
              onClick={() => setConfirmDisconnect(false)}
              className="px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDisconnect(true)}
            title="Disconnect brokerage"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <BigMetricCard
          icon={<Wallet className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
          label="Total Value"
          value={snapshot?.totalValue != null ? usd0(snapshot.totalValue) : '—'}
          sub={snapshot?.syncedAt ? `as of last broker sync` : undefined}
        />
        <BigMetricCard
          icon={
            (weekChange ?? 0) >= 0 ? (
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--positive)' }} />
            ) : (
              <TrendingDown className="w-4 h-4" style={{ color: 'var(--negative)' }} />
            )
          }
          label="Past Week"
          value={weekChange != null ? signed(weekChange) : '—'}
          valueStyle={{ color: pnlColor(weekChange) }}
          tooltip="Change in derived account value (positions at cost) over the trailing 7 days."
        />
        <BigMetricCard
          icon={<TrendingUp className="w-4 h-4" style={{ color: pnlColor(snapshot?.openPnl) }} />}
          label="Unrealized P&L"
          value={snapshot ? signed(snapshot.openPnl) : '—'}
          valueStyle={{ color: pnlColor(snapshot?.openPnl) }}
          sub={
            snapshot && totalCostBasis > 0
              ? `${((snapshot.openPnl / totalCostBasis) * 100).toFixed(1)}% of cost basis`
              : undefined
          }
        />
        <BigMetricCard
          icon={<Landmark className="w-4 h-4" style={{ color: 'var(--info)' }} />}
          label="Cash"
          value={snapshot?.cash != null ? usd0(snapshot.cash) : '—'}
        />
        <BigMetricCard
          icon={<Coins className="w-4 h-4" style={{ color: 'var(--info)' }} />}
          label="Dividends 12m"
          value={summary.income ? usd(summary.income.dividends12m) : '—'}
          sub={summary.income ? `${usd(summary.income.dividends30d)} last 30d` : undefined}
        />
        <BigMetricCard
          icon={<Repeat className="w-4 h-4" style={{ color: 'var(--accent-light)' }} />}
          label="Recurring In"
          value={recurringDeposits.length > 0 ? `${usd0(recurringMonthly)}/mo` : '—'}
          sub={
            recurringDeposits.length > 0
              ? recurringDeposits.map(f => `${usd0(f.amount)} ${f.cadence}`).join(' · ')
              : 'No recurring deposits detected'
          }
        />
      </div>

      {/* Value chart */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-[10px] uppercase tracking-wider font-semibold inline-flex items-center" style={{ color: 'var(--text-tertiary)' }}>
            Account value
            <InfoTooltip text="Derived from the broker's activity ledger with positions at cost — unrealized gains only appear once realized. Anchored at the latest broker-reported value." />
          </span>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  background: chartPeriod === p ? 'var(--accent-dim)' : 'transparent',
                  color: chartPeriod === p ? 'var(--accent-light)' : 'var(--text-tertiary)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {chartData.length >= 2 ? (
          <div className="h-56 px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                  tickFormatter={(d: string) => {
                    const [, m, day] = d.split('-');
                    return `${Number(m)}/${Number(day)}`;
                  }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                  tickFormatter={(v: number) => usd0(v)}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#FF6B00"
                  strokeWidth={2}
                  fill="url(#portfolioValue)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Not enough history yet — the series builds as syncs run.
          </div>
        )}
      </div>

      {/* Weekly review */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Weekly Review
            </span>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
              Generated every Saturday — click a report to read it
            </p>
          </div>
          <div className="flex-1" />
          {reviews.length > 1 && (
            <div className="relative" ref={archiveRef}>
              <button
                onClick={() => setArchiveOpen(o => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
              >
                <Archive className="w-3.5 h-3.5" />
                Past Reviews
                <ChevronDown className={`w-3 h-3 transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
              </button>
              {archiveOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-60 rounded-lg shadow-xl z-20 overflow-hidden"
                  style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)' }}
                >
                  {reviews.map(r => (
                    <button
                      key={r.periodKey}
                      onClick={() => {
                        setModalReview(r);
                        setArchiveOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 transition-colors hover:bg-white/5"
                    >
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {r.periodLabel}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {/* Viewer-local, matching the modal header — slicing the
                            ISO string would show the UTC day instead. */}
                        Generated{' '}
                        {new Date(r.generatedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleRunReview}
            disabled={runningReview}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}
          >
            {runningReview ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {runningReview ? 'Analyzing…' : latestReview ? 'Run again' : 'Run review'}
          </button>
        </div>
        {runningReview ? (
          <div className="p-8 flex flex-col items-center gap-2 text-center">
            <RefreshCw className="w-7 h-7 animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Analyzing your holdings, income, and cash flows…
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              This may take a few seconds.
            </p>
          </div>
        ) : latestReview ? (
          <div className="p-4">
            <button
              onClick={() => setModalReview(latestReview)}
              className="group w-full flex items-center gap-4 rounded-lg p-4 text-left transition-colors"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,107,0,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
            >
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: 'var(--accent-dim)', border: '1px solid rgba(255,107,0,0.25)' }}
              >
                <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {latestReview.periodLabel} Review
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {latestReview.positionsCount} positions
                  {latestReview.totalValue != null && <> · {usd0(latestReview.totalValue)}</>}
                  {latestReview.weekChange != null && (
                    <>
                      {' '}
                      · <span style={{ color: pnlColor(latestReview.weekChange) }}>
                        {signed(latestReview.weekChange)} this week
                      </span>
                    </>
                  )}
                  {' '}· generated {relativeTime(latestReview.generatedAt)}
                </p>
              </div>
              <Sparkles
                className="w-4 h-4 flex-shrink-0 transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
              />
            </button>
          </div>
        ) : (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No reviews yet — one runs automatically every Saturday morning, or run one now.
          </div>
        )}
      </div>

      {/* Holdings */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <PieChart className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Holdings
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {snapshot?.positions.length ?? 0}
          </span>
        </div>
        {snapshot && snapshot.positions.length > 0 ? (
          /* ~13 rows visible; the rest scroll inside the card. */
          <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-1)' }}>
                <tr style={{ color: 'var(--text-tertiary)' }}>
                  <th className="py-2 pl-4 pr-3 font-medium text-left">Symbol</th>
                  <th className="py-2 pr-3 font-medium text-right">Qty</th>
                  <th className="py-2 pr-3 font-medium text-right">Avg Cost</th>
                  <th className="py-2 pr-3 font-medium text-right">Price</th>
                  <th className="py-2 pr-3 font-medium text-right">Value</th>
                  <th className="py-2 pr-3 font-medium text-right">Unreal. P&L</th>
                  <th className="py-2 pr-4 font-medium text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.positions.map(p => {
                  const weight = summary.weights?.find(w => w.symbol === p.symbol)?.weight;
                  const pnlPct =
                    p.openPnl != null && p.costBasis ? (p.openPnl / p.costBasis) * 100 : null;
                  return (
                    <tr key={`${p.accountId}:${p.symbol}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-2.5 pl-4 pr-3">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {p.symbol}
                        </span>
                        {p.description && (
                          <span className="ml-2 hidden sm:inline text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                            {p.description.length > 36 ? `${p.description.slice(0, 36)}…` : p.description}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {p.units}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {p.avgCost != null ? usd(p.avgCost) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {p.price != null ? usd(p.price) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                        {p.marketValue != null ? usd(p.marketValue) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: pnlColor(p.openPnl) }}>
                        {p.openPnl != null ? signed(p.openPnl) : '—'}
                        {pnlPct != null && (
                          <span className="ml-1 text-[10px]">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {weight != null ? `${weight}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No open positions synced yet.
          </div>
        )}
      </div>

      {/* Transactions */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <ReceiptText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Transactions
          </span>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setActivityFilter(f.id);
                  setActivityLimit(50);
                }}
                className="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  background: activityFilter === f.id ? 'var(--accent-dim)' : 'transparent',
                  color: activityFilter === f.id ? 'var(--accent-light)' : 'var(--text-tertiary)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {activities.length > 0 ? (
          <>
            {/* ~13 rows visible; the rest scroll inside the card. */}
            <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
              <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  {activities.slice(0, activityLimit).map(a => {
                    const badge = typeBadge(a.type);
                    return (
                      <tr key={a.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="py-2.5 pl-4 pr-3 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                          {displayDate(a.date)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: badge.bg, color: badge.color }}
                          >
                            {badge.label}
                          </span>
                          {isRecurring(a) && (
                            <span
                              className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                              style={{ background: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                              title="Part of a detected recurring schedule"
                            >
                              <Repeat className="w-2.5 h-2.5" />
                              Recurring
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3" style={{ color: 'var(--text-secondary)' }}>
                          {a.symbol && (
                            <span className="font-semibold mr-2" style={{ color: 'var(--text-primary)' }}>
                              {a.symbol}
                            </span>
                          )}
                          {a.units != null && a.price != null && (
                            <span className="tabular-nums mr-2">
                              {Math.abs(a.units)} × {usd(a.price)}
                            </span>
                          )}
                          {!a.symbol && a.description && (
                            <span className="text-[11px]">
                              {a.description.length > 60 ? `${a.description.slice(0, 60)}…` : a.description}
                            </span>
                          )}
                        </td>
                        <td
                          className="py-2.5 pr-4 text-right tabular-nums font-medium whitespace-nowrap"
                          style={{
                            color:
                              a.type === 'CONTRIBUTION' || a.type === 'DIVIDEND' || a.type === 'INTEREST'
                                ? 'var(--positive)'
                                : a.type === 'WITHDRAWAL' || a.type === 'FEE' || a.type === 'TAX'
                                  ? 'var(--negative)'
                                  : 'var(--text-secondary)',
                          }}
                        >
                          {a.amount != null ? usd(a.amount) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activities.length > activityLimit && (
              <button
                onClick={() => setActivityLimit(l => l + 100)}
                className="w-full py-2.5 text-xs font-medium transition-all"
                style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)' }}
              >
                Show more ({activities.length - activityLimit} more)
              </button>
            )}
          </>
        ) : (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No transactions {activityFilter ? 'of this type ' : ''}synced yet.
          </div>
        )}
      </div>

      {modalReview && (
        <PortfolioReviewModal review={modalReview} onClose={() => setModalReview(null)} />
      )}
    </div>
  );
}
