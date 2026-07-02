'use client';

import { useState } from 'react';
import { Pencil, Check, X, Layers, LineChart } from 'lucide-react';
import type { AccountType } from '@/lib/db/account-settings';

export interface PerfAccount {
  id: string; // 'all' | 'manual' | broker account id
  label: string; // resolved display label
  sublabel?: string; // masked account number / brokerage
  type: AccountType; // 'all' is treated as day-trading and is not editable
  editable: boolean; // false for the combined "All Accounts" entry
}

interface AccountToggleProps {
  accounts: PerfAccount[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSave: (accountId: string, updates: { label: string; type: AccountType }) => Promise<void> | void;
}

export default function AccountToggle({ accounts, selectedId, onSelect, onSave }: AccountToggleProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftType, setDraftType] = useState<AccountType>('day-trading');
  const [saving, setSaving] = useState(false);

  // Render the toggle whenever there's at least one real account beyond the
  // combined "All Accounts" view — that's the point at which switching, and
  // classifying an account as long-term, becomes meaningful. (`accounts`
  // always includes the 'all' entry, so length < 2 means nothing to toggle.)
  if (accounts.length < 2) return null;

  function beginEdit(acct: PerfAccount) {
    setEditingId(acct.id);
    setDraftLabel(acct.label);
    setDraftType(acct.type);
  }

  async function commitEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      await onSave(editingId, { label: draftLabel.trim(), type: draftType });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', width: 'fit-content', maxWidth: '100%' }}>
        {accounts.map((acct) => {
          const active = selectedId === acct.id;
          return (
            <div key={acct.id} className="flex items-center">
              <button
                onClick={() => onSelect(acct.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'white' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 4px rgba(255,107,0,0.3)' : 'none',
                }}
              >
                <span>{acct.label}</span>
                {acct.type === 'long-term' && acct.id !== 'all' && (
                  <span
                    className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded"
                    style={{
                      background: active ? 'rgba(255,255,255,0.2)' : 'var(--accent-dim)',
                      color: active ? 'white' : 'var(--accent-light)',
                    }}
                  >
                    LT
                  </span>
                )}
              </button>
              {acct.editable && (
                <button
                  onClick={() => (editingId === acct.id ? setEditingId(null) : beginEdit(acct))}
                  className="p-1 rounded transition-colors"
                  style={{ color: active ? 'rgba(255,255,255,0.8)' : 'var(--text-tertiary)' }}
                  title="Edit label & type"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editingId && (
        <div
          className="rounded-xl p-4 space-y-3 w-full max-w-sm"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
        >
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Account Label
            </label>
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
              maxLength={60}
              className="w-full rounded px-2.5 py-1.5 text-sm focus:outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-focus)', color: 'var(--text-primary)' }}
              placeholder="e.g. Retirement, Swing Account"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Account Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'day-trading' as const, label: 'Day Trading', icon: LineChart },
                { value: 'long-term' as const, label: 'Long-Term', icon: Layers },
              ]).map(({ value, label, icon: Icon }) => {
                const on = draftType === value;
                return (
                  <button
                    key={value}
                    onClick={() => setDraftType(value)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: on ? 'var(--accent-dim)' : 'var(--surface-2)',
                      border: `1px solid ${on ? 'rgba(255,107,0,0.4)' : 'var(--border-default)'}`,
                      color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Long-term swaps day-trading stats for per-security profitability, open positions, and ticker news.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setEditingId(null)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              onClick={commitEdit}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
