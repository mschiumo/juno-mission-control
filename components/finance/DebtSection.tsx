'use client';

/**
 * Debt section of the Finances tab: debt accounts (manual CRUD + statement
 * CSV import), the payoff planner (avalanche/snowball/minimum-only with the
 * exact payment schedule), the paydown chart (actual history + projected
 * payoff curve), and the spending rollup from imported statements.
 *
 * Extracted from the original single-card FinanceCard when the tab grew
 * Investing and Savings sections. Data flow: this section owns its fetches;
 * mutations call onChanged() so the parent summary strip and sibling
 * sections refresh (refreshKey re-triggers the fetch here).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  TrendingDown,
  CalendarClock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Landmark,
  Upload,
  Receipt,
} from 'lucide-react';
import {
  DebtAccount,
  DebtType,
  PayoffStrategy,
  PayoffPlan,
  PayoffComparison,
  FinanceSettings,
  MonthlySpendSummary,
  HistoryPoint,
} from '@/lib/finance/types';
import { DebtProjectionChart } from './charts';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const TYPE_LABELS: Record<DebtType, string> = {
  'credit-card': 'Credit card',
  'auto-loan': 'Auto loan',
  'student-loan': 'Student loan',
  'personal-loan': 'Personal loan',
  mortgage: 'Mortgage',
  other: 'Other',
};

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMonth(month: string): string {
  const d = new Date(`${month}-01T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

interface AccountFormState {
  id: string | null;
  name: string;
  type: DebtType;
  balance: string;
  apr: string;
  minPayment: string;
  dueDay: string;
}

const EMPTY_FORM: AccountFormState = {
  id: null,
  name: '',
  type: 'credit-card',
  balance: '',
  apr: '',
  minPayment: '',
  dueDay: '1',
};

export default function DebtSection({
  refreshKey,
  onChanged,
  debtHistory,
}: {
  refreshKey: number;
  onChanged: () => void;
  debtHistory: HistoryPoint[];
}) {
  const [accounts, setAccounts] = useState<DebtAccount[]>([]);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [comparison, setComparison] = useState<PayoffComparison | null>(null);
  const [totalMinPayment, setTotalMinPayment] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);

  const [budgetInput, setBudgetInput] = useState('');
  const [monthsShown, setMonthsShown] = useState(6);

  // Statement CSV import
  const [importTarget, setImportTarget] = useState<DebtAccount | null>(null);
  const [importCsvText, setImportCsvText] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importNewBalance, setImportNewBalance] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [spendSummaries, setSpendSummaries] = useState<MonthlySpendSummary[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [accountsRes, planRes, spendRes] = await Promise.all([
        fetch('/api/finance/accounts'),
        fetch('/api/finance/payoff-plan'),
        fetch('/api/finance/transactions?months=6'),
      ]);
      const accountsJson = await accountsRes.json();
      const planJson = await planRes.json();
      const spendJson = await spendRes.json();
      if (accountsJson.success) setAccounts(accountsJson.accounts);
      if (planJson.success) {
        setSettings(planJson.settings);
        setComparison(planJson.comparison);
        setTotalMinPayment(planJson.totalMinPayment ?? 0);
        setBudgetInput((prev) => prev || (planJson.settings.monthlyBudget || '').toString());
      }
      if (spendJson.success) setSpendSummaries(spendJson.summaries);
    } catch (e) {
      console.error('Debt section fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshKey]);

  const savePlanSettings = async (monthlyBudget: number, strategy: PayoffStrategy) => {
    setSaving(true);
    try {
      const res = await fetch('/api/finance/payoff-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyBudget, strategy }),
      });
      const json = await res.json();
      if (json.success) {
        setSettings(json.settings);
        setComparison(json.comparison);
        setTotalMinPayment(json.totalMinPayment ?? 0);
      }
    } catch (e) {
      console.error('Plan save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const submitAccount = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/finance/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id ?? undefined,
          name: form.name,
          type: form.type,
          balance: parseFloat(form.balance),
          apr: parseFloat(form.apr),
          minPayment: parseFloat(form.minPayment),
          dueDay: parseInt(form.dueDay, 10),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setFormError(json.error || 'Failed to save account');
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      onChanged();
    } catch (e) {
      console.error('Account save error:', e);
      setFormError('Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Delete this account? Its payment history is not affected — this only removes it from the tracker.')) return;
    try {
      await fetch(`/api/finance/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      console.error('Account delete error:', e);
    }
  };

  const startEdit = (a: DebtAccount) => {
    setForm({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance.toString(),
      apr: a.apr.toString(),
      minPayment: a.minPayment.toString(),
      dueDay: a.dueDay.toString(),
    });
    setFormError(null);
    setShowForm(true);
  };

  const onCsvFileChosen = (file: File) => {
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => setImportCsvText(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsText(file);
  };

  const submitCsvImport = async () => {
    if (!importTarget || !importCsvText) return;
    setSaving(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: importTarget.id,
          csv: importCsvText,
          newBalance: importNewBalance.trim() === '' ? undefined : parseFloat(importNewBalance),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setImportResult(`Error: ${json.error}`);
        return;
      }
      setImportResult(
        `Imported ${json.imported} transactions (${json.duplicatesSkipped} duplicates skipped)` +
          (json.balanceUpdated ? ' — balance updated' : ''),
      );
      setImportCsvText(null);
      setImportFileName('');
      setImportNewBalance('');
      onChanged();
    } catch (e) {
      console.error('CSV import error:', e);
      setImportResult('Error: import failed');
    } finally {
      setSaving(false);
    }
  };

  const totalDebt = accounts.reduce((s, a) => s + a.balance, 0);
  const strategy = settings?.strategy ?? 'avalanche';
  const activePlan: PayoffPlan | null =
    comparison === null
      ? null
      : strategy === 'snowball'
        ? comparison.snowball
        : strategy === 'minimum-only'
          ? comparison.minimumOnly
          : comparison.avalanche;

  const interestSaved =
    comparison && activePlan
      ? comparison.minimumOnly.totalInterestPaid - activePlan.totalInterestPaid
      : 0;

  if (loading) {
    return (
      <div className="rounded-lg border p-8 text-center" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)', color: 'var(--text-tertiary)' }}>
        Loading debt data…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Accounts ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)' }}>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Debt Accounts</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* NEXT STEP: swap for Teller Connect (lib/finance/types.ts). */}
              <button
                disabled
                title="Coming soon — Teller/Plaid bank connection"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium opacity-40 cursor-not-allowed"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
              >
                <Landmark className="w-3.5 h-3.5" />
                Connect bank
              </button>
              <button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setFormError(null);
                  setShowForm(!showForm);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add account
              </button>
            </div>
          </div>

          {/* Add / edit form */}
          {showForm && (
            <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <label className="col-span-2 flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Name
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Chase Sapphire"
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Type
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as DebtType })}
                    className="px-2 py-1.5 rounded-md text-sm outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  >
                    {(Object.keys(TYPE_LABELS) as DebtType[]).map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Balance ($)
                  <input
                    type="number" min="0" step="0.01"
                    value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })}
                    placeholder="4200"
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none num"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  APR (%)
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={form.apr}
                    onChange={(e) => setForm({ ...form, apr: e.target.value })}
                    placeholder="24.99"
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none num"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Min payment ($)
                  <input
                    type="number" min="0" step="0.01"
                    value={form.minPayment}
                    onChange={(e) => setForm({ ...form, minPayment: e.target.value })}
                    placeholder="120"
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none num"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Due day (1–28)
                  <input
                    type="number" min="1" max="28" step="1"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none num"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
              </div>
              {formError && (
                <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>{formError}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={submitAccount}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)' }}
                >
                  {form.id ? 'Save changes' : 'Add account'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Account list */}
          {accounts.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No accounts yet. Add your credit cards and loans to build a payoff plan.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                    <th className="pb-2 pr-4 font-medium">Account</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium text-right">Balance</th>
                    <th className="pb-2 pr-4 font-medium text-right">APR</th>
                    <th className="pb-2 pr-4 font-medium text-right">Min / mo</th>
                    <th className="pb-2 pr-4 font-medium text-right">Due day</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {a.name}
                        {a.source === 'gsheet' && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle" style={{ background: 'rgba(0,200,150,0.12)', color: 'var(--positive)' }}>
                            sheet
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--text-secondary)' }}>{TYPE_LABELS[a.type]}</td>
                      <td className="py-2.5 pr-4 text-right num" style={{ color: a.balance > 0 ? 'var(--negative)' : 'var(--positive)' }}>
                        {usd.format(a.balance)}
                      </td>
                      <td className="py-2.5 pr-4 text-right num" style={{ color: 'var(--text-secondary)' }}>{a.apr.toFixed(2)}%</td>
                      <td className="py-2.5 pr-4 text-right num" style={{ color: 'var(--text-secondary)' }}>{usd.format(a.minPayment)}</td>
                      <td className="py-2.5 pr-4 text-right num" style={{ color: 'var(--text-secondary)' }}>{a.dueDay}</td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setImportTarget(importTarget?.id === a.id ? null : a);
                            setImportCsvText(null);
                            setImportFileName('');
                            setImportNewBalance('');
                            setImportResult(null);
                          }}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: importTarget?.id === a.id ? 'var(--accent-light)' : 'var(--text-tertiary)' }}
                          title="Import statement CSV (Apple Card export)"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => startEdit(a)} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--text-tertiary)' }} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteAccount(a.id)} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--text-tertiary)' }} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Statement CSV import panel */}
          {importTarget && (
            <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Import statement CSV → {importTarget.name}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                Apple Card: Wallet → Apple Card → statement → Export Transactions (CSV). Re-importing overlapping months is safe — duplicates are skipped.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onCsvFileChosen(e.target.files[0])}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importFileName || 'Choose CSV file'}
                </button>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  New balance from statement ($, optional)
                  <input
                    type="number" min="0" step="0.01"
                    value={importNewBalance}
                    onChange={(e) => setImportNewBalance(e.target.value)}
                    placeholder={importTarget.balance.toFixed(2)}
                    className="w-44 px-2.5 py-1.5 rounded-md text-sm outline-none num"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                <button
                  onClick={submitCsvImport}
                  disabled={saving || !importCsvText}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)' }}
                >
                  Import
                </button>
                <button
                  onClick={() => setImportTarget(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Close
                </button>
              </div>
              {importResult && (
                <p className="mt-2 text-xs" style={{ color: importResult.startsWith('Error') ? 'var(--negative)' : 'var(--positive)' }}>
                  {importResult}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Payoff planner ────────────────────────────────────────────── */}
      <div className="rounded-lg border" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)' }}>
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Payoff Planner</h2>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              Monthly debt budget ($)
              <input
                type="number" min="0" step="10"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder={totalMinPayment > 0 ? `min ${usd0.format(totalMinPayment)}` : '500'}
                className="w-40 px-2.5 py-1.5 rounded-md text-sm outline-none num"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
            </label>
            <button
              onClick={() => savePlanSettings(parseFloat(budgetInput) || 0, strategy)}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)' }}
            >
              Update plan
            </button>
            {interestSaved > 0.005 && (
              <span className="text-xs px-2.5 py-1 rounded-full num" style={{ background: 'rgba(0,200,150,0.12)', color: 'var(--positive)' }}>
                saves {usd0.format(interestSaved)} in interest vs. minimums only
              </span>
            )}
          </div>

          {comparison ? (
            <>
              {/* Paydown chart: actual + projected */}
              {activePlan && (
                <div className="mt-4">
                  <DebtProjectionChart
                    history={debtHistory}
                    projection={activePlan.months.map((m) => ({ month: m.month, balanceRemaining: m.balanceRemaining }))}
                    currentTotal={totalDebt}
                    todayDate={new Date().toISOString().slice(0, 10)}
                  />
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <StrategyOption
                  title="Avalanche"
                  subtitle="Highest APR first — least total interest"
                  plan={comparison.avalanche}
                  selected={strategy === 'avalanche'}
                  onSelect={() => savePlanSettings(parseFloat(budgetInput) || 0, 'avalanche')}
                />
                <StrategyOption
                  title="Snowball"
                  subtitle="Smallest balance first — quick wins"
                  plan={comparison.snowball}
                  selected={strategy === 'snowball'}
                  onSelect={() => savePlanSettings(parseFloat(budgetInput) || 0, 'snowball')}
                />
                <StrategyOption
                  title="Minimums only"
                  subtitle="Baseline for comparison"
                  plan={comparison.minimumOnly}
                  selected={strategy === 'minimum-only'}
                  onSelect={() => savePlanSettings(parseFloat(budgetInput) || 0, 'minimum-only')}
                />
              </div>

              {activePlan && activePlan.warnings.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {activePlan.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255,61,87,0.08)', color: 'var(--negative)' }}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-account payoff dates */}
              {activePlan && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activePlan.perAccount.map((p) => (
                    <div key={p.accountId} className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{p.accountName}</span>{' '}
                      <span className="font-semibold num" style={{ color: p.payoffDate ? 'var(--positive)' : 'var(--negative)' }}>
                        {p.payoffDate ? `paid off ${fmtDate(p.payoffDate)}` : 'not paid off'}
                      </span>{' '}
                      <span className="num" style={{ color: 'var(--text-tertiary)' }}>· {usd0.format(p.totalInterest)} interest</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Month-by-month schedule */}
              {activePlan && activePlan.months.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Payment schedule — exact amounts & dates
                    </h3>
                  </div>
                  <div className="mt-3 space-y-3">
                    {activePlan.months.slice(0, monthsShown).map((m) => (
                      <div key={m.month} className="rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMonth(m.month)}</span>
                          <span className="text-[11px] num" style={{ color: 'var(--text-tertiary)' }}>
                            pay {usd.format(m.totalPaid)} · balance after: {usd.format(m.balanceRemaining)}
                          </span>
                        </div>
                        <div className="px-3 py-1">
                          {m.payments.map((p, i) => (
                            <div key={`${p.accountId}-${i}`} className="py-1.5 flex items-center justify-between gap-3 text-xs" style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="num flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{fmtDate(p.date)}</span>
                                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{p.accountName}</span>
                                {p.isExtra && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}>
                                    +extra
                                  </span>
                                )}
                                {p.isPayoff && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ background: 'rgba(0,200,150,0.12)', color: 'var(--positive)' }}>
                                    paid off 🎉
                                  </span>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="font-semibold num" style={{ color: 'var(--text-primary)' }}>{usd.format(p.amount)}</span>
                                <span className="ml-2 num hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
                                  ({usd.format(p.principal)} principal / {usd.format(p.interest)} interest)
                                </span>
                              </div>
                            </div>
                          ))}
                          {m.payments.length === 0 && (
                            <p className="py-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>No payments due this month.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {activePlan.months.length > 6 && (
                    <button
                      onClick={() => setMonthsShown(monthsShown === 6 ? activePlan.months.length : 6)}
                      className="mt-3 flex items-center gap-1 text-xs font-medium transition-colors"
                      style={{ color: 'var(--accent-light)' }}
                    >
                      {monthsShown === 6 ? (
                        <>Show all {activePlan.months.length} months <ChevronDown className="w-3.5 h-3.5" /></>
                      ) : (
                        <>Show fewer <ChevronUp className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {accounts.length === 0
                ? 'Add at least one account, then set a monthly budget to see your payoff plan.'
                : 'Set a monthly debt budget above and hit “Update plan” to generate your payoff schedule.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Spending (from imported statements) ───────────────────────── */}
      {spendSummaries.length > 0 && (
        <div className="rounded-lg border" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)' }}>
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Spending</h2>
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>from imported statements</span>
            </div>
            <div className="mt-4 space-y-2">
              {spendSummaries.map((s) => {
                const topCategories = Object.entries(s.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4);
                return (
                  <div key={s.month} className="p-3 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                    <span className="text-xs font-semibold w-28" style={{ color: 'var(--text-primary)' }}>{fmtMonth(s.month)}</span>
                    <span className="text-xs num" style={{ color: 'var(--negative)' }}>
                      {usd.format(s.charges)} spent
                    </span>
                    <span className="text-xs num" style={{ color: 'var(--positive)' }}>
                      {usd.format(s.payments)} paid
                    </span>
                    <div className="flex flex-wrap gap-1.5 ml-auto">
                      {topCategories.map(([cat, amt]) => (
                        <span key={cat} className="px-2 py-0.5 rounded-full text-[10px] num" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          {cat} {usd0.format(amt)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyOption({
  title,
  subtitle,
  plan,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  plan: PayoffPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="text-left rounded-lg p-3.5 transition-all"
      style={{
        background: selected ? 'var(--accent-dim)' : 'var(--bg-base)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold" style={{ color: selected ? 'var(--accent-light)' : 'var(--text-primary)' }}>{title}</span>
        {selected && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'white' }}>ACTIVE</span>
        )}
      </div>
      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>
      <div className="mt-2.5 space-y-1 text-xs">
        <p className="num" style={{ color: 'var(--text-secondary)' }}>
          Debt-free:{' '}
          <span className="font-semibold" style={{ color: plan.debtFreeDate ? 'var(--positive)' : 'var(--negative)' }}>
            {plan.debtFreeDate ? `${fmtDate(plan.debtFreeDate)} (${plan.monthsToDebtFree} mo)` : '50+ years'}
          </span>
        </p>
        <p className="num" style={{ color: 'var(--text-secondary)' }}>
          Total interest: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{usd0.format(plan.totalInterestPaid)}</span>
        </p>
      </div>
    </button>
  );
}
