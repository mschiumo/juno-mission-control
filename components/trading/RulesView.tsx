'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Pencil, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Clock } from 'lucide-react';
import {
  DEFAULT_TRADING_RULES,
  MAX_RULE_LENGTH,
  MAX_RULES,
  TRADING_RULES_UPDATED_EVENT,
  fetchTradingRules,
  saveTradingRules,
} from '@/lib/trading/trading-rules';

/**
 * Trading → Rules sub-tab: view and edit the personal rules shown in the
 * 9:15 AM ET pre-market acknowledgement modal, any time of day.
 */
export default function RulesView() {
  const [rules, setRules] = useState<string[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTradingRules().then((loaded) => {
      if (!cancelled) setRules(loaded);
    });
    // Stay in sync with edits made from the pre-market modal.
    const onUpdated = (e: Event) => {
      const next = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(next)) setRules(next);
    };
    window.addEventListener(TRADING_RULES_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(TRADING_RULES_UPDATED_EVENT, onUpdated);
    };
  }, []);

  function startEdit(seed?: string[]) {
    setDraft([...(seed ?? rules ?? [])]);
    setSaveError(null);
    setSavedAt(null);
    setIsEditing(true);
  }

  function update(i: number, value: string) {
    setDraft((prev) => prev.map((r, idx) => (idx === i ? value : r)));
  }

  function remove(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setDraft((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function add() {
    if (draft.length >= MAX_RULES) return;
    setDraft((prev) => [...prev, '']);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      setRules(await saveTradingRules(draft));
      setIsEditing(false);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && draft.every((r) => r.length <= MAX_RULE_LENGTH);

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div
          className="flex items-start sm:items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
              style={{ background: 'var(--accent-dim)' }}
            >
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {isEditing ? 'Edit Trading Rules' : 'Trading Rules'}
              </h2>
              <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Clock className="w-3 h-3 flex-shrink-0" />
                Shown for acknowledgement every trading day at 9:15 AM ET, before the open.
              </p>
            </div>
          </div>
          {!isEditing && rules !== null && rules.length > 0 && (
            <button
              onClick={() => startEdit()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 hover:bg-[var(--surface-hover)]"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>

        <div className="p-5 space-y-3">
          {rules === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 rounded-lg animate-pulse" style={{ background: 'var(--surface-2)' }} />
              ))}
            </div>
          ) : isEditing ? (
            <>
              {draft.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
                  No rules yet. Add your first one below.
                </p>
              )}
              {draft.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-lg"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  <span
                    className="text-xs font-bold w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 tabular-nums mt-1"
                    style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
                  >
                    {i + 1}
                  </span>
                  <textarea
                    value={rule}
                    onChange={(e) => update(i, e.target.value)}
                    maxLength={MAX_RULE_LENGTH}
                    rows={1}
                    aria-label={`Rule ${i + 1}`}
                    className="flex-1 bg-transparent text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-2 py-1 min-w-0"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="Enter a rule..."
                  />
                  <div className="flex items-center flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="p-1.5 rounded transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === draft.length - 1}
                      className="p-1.5 rounded transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={() => remove(i)}
                      className="p-1.5 rounded transition-colors hover:bg-[#f85149]/10 group"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[#f85149]" />
                    </button>
                  </div>
                </div>
              ))}
              {draft.length < MAX_RULES ? (
                <button
                  onClick={add}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed rounded-lg text-sm transition-colors border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus className="w-4 h-4" />
                  Add rule
                </button>
              ) : (
                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                  Maximum of {MAX_RULES} rules reached.
                </p>
              )}
              {saveError && <p className="text-xs" style={{ color: 'var(--negative)' }}>{saveError}</p>}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-2">
                <button
                  onClick={() => setDraft([...DEFAULT_TRADING_RULES])}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 text-xs transition-colors sm:mr-auto py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to defaults
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!canSave}
                  className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors bg-[#F97316] hover:bg-[#ea580c] text-white disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#484f58]"
                >
                  {saving ? 'Saving…' : 'Save rules'}
                </button>
              </div>
            </>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 px-4 border border-dashed rounded-lg" style={{ borderColor: 'var(--border-default)' }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No rules set</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                Add your trading rules to get a reminder before every open.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => startEdit([''])}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F97316] hover:bg-[#ea580c] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add your first rule
                </button>
                <button
                  onClick={() => startEdit(DEFAULT_TRADING_RULES)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Start from defaults
                </button>
              </div>
            </div>
          ) : (
            <>
              <ol className="space-y-2">
                {rules.map((rule, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  >
                    <span
                      className="text-xs font-bold w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 tabular-nums"
                      style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed break-words min-w-0" style={{ color: 'var(--text-primary)' }}>
                      {rule}
                    </span>
                  </li>
                ))}
              </ol>
              {savedAt && (
                <p className="text-xs" style={{ color: 'var(--positive)' }}>
                  Saved — your pre-market check will use these rules.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
