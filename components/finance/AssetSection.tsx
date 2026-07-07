'use client';

/**
 * Asset-side section of the Finances tab — parameterized so one component
 * renders both Investing (kind: investment) and Savings / Account Balances
 * (kinds: savings, checking, other).
 *
 * Shows a growth chart from the recorded history series, change stats
 * (30-day and since tracking began), and account CRUD. Accounts synced from
 * the Google Sheet carry a "sheet" badge (Type column routes rows here —
 * e.g. "Savings", "401k", "Brokerage").
 *
 * NOTE on investing numbers: without contribution history, "change" mixes
 * deposits with market returns. True time-weighted returns need transaction
 * data — that arrives with aggregator sync (see lib/finance/types.ts next
 * steps). The subtitle makes this honest in the UI.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, LucideIcon } from 'lucide-react';
import { BalanceAccount, BalanceKind, HistoryPoint } from '@/lib/finance/types';
import { BalanceTrendChart } from './charts';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const KIND_LABELS: Record<BalanceKind, string> = {
  investment: 'Investment',
  savings: 'Savings',
  checking: 'Checking',
  other: 'Other',
};

function changeSince(history: HistoryPoint[], sinceDate: string | null): number | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const base = sinceDate ? history.filter((p) => p.date <= sinceDate).pop() ?? history[0] : history[0];
  if (base.date === latest.date) return null;
  return Math.round((latest.value - base.value) * 100) / 100;
}

interface FormState {
  id: string | null;
  name: string;
  kind: BalanceKind;
  balance: string;
  institution: string;
}

export default function AssetSection({
  title,
  subtitle,
  icon: Icon,
  kinds,
  chartColor,
  gradientId,
  history,
  refreshKey,
  onChanged,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  kinds: BalanceKind[];
  chartColor: string;
  gradientId: string;
  history: HistoryPoint[];
  refreshKey: number;
  onChanged: () => void;
  emptyHint: string;
}) {
  const [accounts, setAccounts] = useState<BalanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const emptyForm: FormState = { id: null, name: '', kind: kinds[0], balance: '', institution: '' };
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/balance-accounts');
      const json = await res.json();
      if (json.success) {
        setAccounts(json.accounts.filter((a: BalanceAccount) => kinds.includes(a.kind)));
      }
    } catch (e) {
      console.error(`${title} fetch error:`, e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join(','), title]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts, refreshKey]);

  const submit = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/finance/balance-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id ?? undefined,
          name: form.name,
          kind: form.kind,
          balance: parseFloat(form.balance),
          institution: form.institution,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setFormError(json.error || 'Failed to save');
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      onChanged();
    } catch (e) {
      console.error('Balance account save error:', e);
      setFormError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this account from the tracker?')) return;
    try {
      await fetch(`/api/finance/balance-accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      console.error('Balance account delete error:', e);
    }
  };

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const today = new Date();
  const d30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const change30 = changeSince(history, d30);
  const changeAll = changeSince(history, null);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border" style={{ background: 'var(--surface-1)', borderColor: 'var(--border-default)' }}>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setForm(emptyForm);
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

          {/* Stats row */}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>Total</p>
              <p className="text-lg font-semibold num" style={{ color: 'var(--text-primary)' }}>{usd.format(total)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>30-day change</p>
              <p className="text-lg font-semibold num" style={{ color: change30 == null ? 'var(--text-tertiary)' : change30 >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {change30 == null ? '—' : `${change30 >= 0 ? '+' : ''}${usd.format(change30)}`}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>Since tracking began</p>
              <p className="text-lg font-semibold num" style={{ color: changeAll == null ? 'var(--text-tertiary)' : changeAll >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {changeAll == null ? '—' : `${changeAll >= 0 ? '+' : ''}${usd.format(changeAll)}`}
              </p>
            </div>
          </div>

          {/* Growth chart */}
          <div className="mt-4">
            <BalanceTrendChart data={history} color={chartColor} gradientId={gradientId} name={title} />
          </div>

          {/* Add / edit form */}
          {showForm && (
            <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Name
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={kinds[0] === 'investment' ? 'Fidelity 401(k)' : 'Ally HYSA'}
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                {kinds.length > 1 && (
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    Type
                    <select
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value as BalanceKind })}
                      className="px-2 py-1.5 rounded-md text-sm outline-none"
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                    >
                      {kinds.map((k) => (
                        <option key={k} value={k}>{KIND_LABELS[k]}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Balance ($)
                  <input
                    type="number" min="0" step="0.01"
                    value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })}
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none num"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Institution (optional)
                  <input
                    value={form.institution}
                    onChange={(e) => setForm({ ...form, institution: e.target.value })}
                    className="px-2.5 py-1.5 rounded-md text-sm outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </label>
              </div>
              {formError && <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>{formError}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={submit}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)' }}
                >
                  {form.id ? 'Save changes' : 'Add account'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setForm(emptyForm); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Account list */}
          {loading ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>{emptyHint}</p>
          ) : (
            <div className="mt-4 space-y-1.5">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {a.name}
                      {a.source === 'gsheet' && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle" style={{ background: 'rgba(0,200,150,0.12)', color: 'var(--positive)' }}>
                          sheet
                        </span>
                      )}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {KIND_LABELS[a.kind]}{a.institution ? ` · ${a.institution}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-sm font-semibold num mr-2" style={{ color: 'var(--text-primary)' }}>{usd.format(a.balance)}</span>
                    <button
                      onClick={() => {
                        setForm({ id: a.id, name: a.name, kind: a.kind, balance: a.balance.toString(), institution: a.institution ?? '' });
                        setFormError(null);
                        setShowForm(true);
                      }}
                      className="p-1.5 rounded-md" style={{ color: 'var(--text-tertiary)' }} title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(a.id)} className="p-1.5 rounded-md" style={{ color: 'var(--text-tertiary)' }} title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
