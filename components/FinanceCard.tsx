'use client';

/**
 * Finances tab — owner-only. Container for three sections:
 *   Investing · Debt · Savings/Account Balances
 * plus a net-worth summary strip and the Google Sheet link (which feeds all
 * sections: the sheet's Type column routes each row to debt vs. assets).
 *
 * Progress charts are driven by /api/finance/history — a point per day per
 * series (debt / investment / savings), recorded automatically whenever a
 * balance changes (manual edit, CSV import, sheet sync).
 *
 * Data flow: each section owns its data fetching; mutations bubble up via
 * onChanged() → bumpRefresh(), and the shared refreshKey re-triggers every
 * section's fetch plus the summary strip. Simple and consistent over
 * clever — all reads are small Redis keys.
 *
 * NEXT STEPS — full integration plan in lib/finance/types.ts:
 * - Teller Connect for live bank/card balances (the disabled "Connect bank"
 *   button in the Debt section), then Plaid Liabilities for card terms.
 * - Sheet sync: nightly cron refresh (run-cron pattern) + private-sheet
 *   support via the lib/google-calendar.ts service-account flow.
 * - Investing: pull live brokerage value from the existing SnapTrade data
 *   (Trading tab) so the Investing section tracks itself.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  FileSpreadsheet,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import {
  DebtAccount,
  BalanceAccount,
  FinanceHistory,
  SheetLink,
  PayoffComparison,
  FinanceSettings,
} from '@/lib/finance/types';
import DebtSection from '@/components/finance/DebtSection';
import AssetSection from '@/components/finance/AssetSection';
import { TellerConnectButton, BrokerageSyncButton } from '@/components/finance/ConnectButtons';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type SectionId = 'investing' | 'debt' | 'savings';

const SECTIONS: { id: SectionId; label: string; icon: typeof TrendingUp }[] = [
  { id: 'investing', label: 'Investing', icon: TrendingUp },
  { id: 'debt', label: 'Debt', icon: TrendingDown },
  { id: 'savings', label: 'Savings', icon: PiggyBank },
];

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FinanceCard() {
  const [section, setSection] = useState<SectionId>('debt');
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Summary strip + history data
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [balanceAccounts, setBalanceAccounts] = useState<BalanceAccount[]>([]);
  const [history, setHistory] = useState<FinanceHistory>({ debt: [], investment: [], savings: [] });
  const [debtFreeDate, setDebtFreeDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Google Sheet link
  const [sheetLink, setSheetLink] = useState<SheetLink | null>(null);
  const [sheetPanelOpen, setSheetPanelOpen] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const [debtsRes, balancesRes, historyRes, planRes, sheetRes] = await Promise.all([
        fetch('/api/finance/accounts'),
        fetch('/api/finance/balance-accounts'),
        fetch('/api/finance/history'),
        fetch('/api/finance/payoff-plan'),
        fetch('/api/finance/sheet-sync'),
      ]);
      const debtsJson = await debtsRes.json();
      const balancesJson = await balancesRes.json();
      const historyJson = await historyRes.json();
      const planJson = await planRes.json();
      const sheetJson = await sheetRes.json();

      if (debtsJson.success) setDebtAccounts(debtsJson.accounts);
      if (balancesJson.success) setBalanceAccounts(balancesJson.accounts);
      if (historyJson.success) setHistory(historyJson.history);
      if (planJson.success && planJson.comparison) {
        const settings: FinanceSettings = planJson.settings;
        const comparison: PayoffComparison = planJson.comparison;
        const active =
          settings.strategy === 'snowball'
            ? comparison.snowball
            : settings.strategy === 'minimum-only'
              ? comparison.minimumOnly
              : comparison.avalanche;
        setDebtFreeDate(active.debtFreeDate);
      } else {
        setDebtFreeDate(null);
      }
      if (sheetJson.success) {
        setSheetLink(sheetJson.sheetLink);
        setSheetUrlInput((prev) => prev || sheetJson.sheetLink?.url || '');
      }
    } catch (e) {
      console.error('Finances summary fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshKey]);

  const syncSheet = async (sheetUrl?: string) => {
    setSheetSyncing(true);
    setSheetError(null);
    try {
      const res = await fetch('/api/finance/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetUrl ? { sheetUrl } : {}),
      });
      const json = await res.json();
      if (json.sheetLink) setSheetLink(json.sheetLink);
      if (!json.success) {
        setSheetError(json.error || 'Sync failed');
      } else {
        bumpRefresh();
      }
    } catch (e) {
      console.error('Sheet sync error:', e);
      setSheetError('Sync failed');
    } finally {
      setSheetSyncing(false);
    }
  };

  const unlinkSheet = async () => {
    if (!confirm('Unlink the Google Sheet? Accounts keep their current numbers and become manually editable.')) return;
    try {
      await fetch('/api/finance/sheet-sync', { method: 'DELETE' });
      setSheetLink(null);
      setSheetUrlInput('');
      setSheetPanelOpen(false);
      bumpRefresh();
    } catch (e) {
      console.error('Sheet unlink error:', e);
    }
  };

  const totalDebt = debtAccounts.reduce((s, a) => s + a.balance, 0);
  const totalInvest = balanceAccounts.filter((a) => a.kind === 'investment').reduce((s, a) => s + a.balance, 0);
  const totalSavings = balanceAccounts.filter((a) => a.kind !== 'investment').reduce((s, a) => s + a.balance, 0);
  const netWorth = totalInvest + totalSavings - totalDebt;

  if (loading) {
    return (
      <div className="rounded-lg border p-8 text-center" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)', color: 'var(--text-tertiary)' }}>
        Loading finances…
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* ── Net worth summary strip ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat
          label="Net worth"
          value={usd.format(netWorth)}
          tone={netWorth > 0 ? 'positive' : netWorth < 0 ? 'negative' : undefined}
        />
        <SummaryStat label="Investments" value={usd.format(totalInvest)} />
        <SummaryStat label="Savings & cash" value={usd.format(totalSavings)} />
        <SummaryStat
          label={debtFreeDate ? 'Debt · free by' : 'Total debt'}
          value={debtFreeDate ? `${usd.format(totalDebt)} · ${fmtDate(debtFreeDate)}` : usd.format(totalDebt)}
          tone={totalDebt > 0 ? 'negative' : 'positive'}
        />
      </div>

      {/* ── Section nav + sheet link ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: section === s.id ? 'var(--accent-dim)' : 'transparent',
                color: section === s.id ? 'var(--accent-light)' : 'var(--text-secondary)',
              }}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TellerConnectButton onChanged={bumpRefresh} />
          <button
            onClick={() => setSheetPanelOpen(!sheetPanelOpen)}
            title="Sync balances from a Google Sheet"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              border: `1px solid ${sheetLink ? 'var(--positive)' : 'var(--border-default)'}`,
              color: sheetLink ? 'var(--positive)' : 'var(--text-secondary)',
            }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {sheetLink ? 'Sheet linked' : 'Link Google Sheet'}
          </button>
        </div>
      </div>

      {/* Google Sheet link panel */}
      {sheetPanelOpen && (
        <div className="p-4 rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Keep balances in a Google Sheet and sync them here. Columns: <span className="font-semibold">Name, Type, Balance, APR, Min Payment, Due Day</span> (header row required).
            The Type column routes each row — debt types (credit, auto, student…) land in Debt; asset types (savings, checking, 401k, brokerage…) land in Investing/Savings.
            Share the sheet as <span className="font-semibold">“Anyone with the link — Viewer”</span>, then paste its URL.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={sheetUrlInput}
              onChange={(e) => setSheetUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="flex-1 min-w-[260px] px-2.5 py-1.5 rounded-md text-sm outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => syncSheet(sheetUrlInput)}
              disabled={sheetSyncing || !sheetUrlInput.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sheetSyncing ? 'animate-spin' : ''}`} />
              {sheetLink ? 'Sync now' : 'Link & sync'}
            </button>
            {sheetLink && (
              <button
                onClick={unlinkSheet}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}
              >
                <Unlink className="w-3.5 h-3.5" />
                Unlink
              </button>
            )}
          </div>
          {sheetError && <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>{sheetError}</p>}
          {sheetLink?.lastSyncedAt && !sheetError && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Last synced {fmtDate(sheetLink.lastSyncedAt.slice(0, 10))} — {sheetLink.lastResult}
            </p>
          )}
        </div>
      )}

      {/* ── Active section ────────────────────────────────────────────── */}
      {section === 'investing' && (
        <AssetSection
          title="Investing"
          subtitle="Balance changes only — true returns need contribution data (coming with brokerage sync)"
          icon={TrendingUp}
          kinds={['investment']}
          chartColor="#00C896"
          gradientId="investGrad"
          history={history.investment}
          refreshKey={refreshKey}
          onChanged={bumpRefresh}
          emptyHint="No investment accounts yet. Add your 401(k), IRA, or brokerage — or put a row typed “401k” / “Brokerage” in your linked sheet."
          actions={<BrokerageSyncButton onChanged={bumpRefresh} />}
        />
      )}
      {section === 'debt' && (
        <DebtSection refreshKey={refreshKey} onChanged={bumpRefresh} debtHistory={history.debt} />
      )}
      {section === 'savings' && (
        <AssetSection
          title="Savings & Account Balances"
          subtitle="Savings, checking, and cash accounts"
          icon={PiggyBank}
          kinds={['savings', 'checking', 'other']}
          chartColor="#38BDF8"
          gradientId="savingsGrad"
          history={history.savings}
          refreshKey={refreshKey}
          onChanged={bumpRefresh}
          emptyHint="No cash accounts yet. Add your savings, checking, or emergency fund — or put a row typed “Savings” / “Checking” in your linked sheet."
        />
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className="rounded-lg border p-3.5" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)' }}>
      <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>{label}</p>
      <p
        className="mt-1 text-lg font-semibold num"
        style={{ color: tone === 'negative' ? 'var(--negative)' : tone === 'positive' ? 'var(--positive)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  );
}
