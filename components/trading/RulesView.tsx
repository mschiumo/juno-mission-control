'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Check } from 'lucide-react';
import {
  DEFAULT_TRADING_RULES,
  MAX_RULE_LENGTH,
  MAX_RULES,
  TRADING_RULES_UPDATED_EVENT,
  fetchTradingRules,
  saveTradingRules,
} from '@/lib/trading/trading-rules';

const INPUT_CLASS =
  'w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors';

function sameRules(a: string[], b: string[]) {
  const clean = (l: string[]) => l.map((r) => r.trim()).filter(Boolean);
  const ca = clean(a);
  const cb = clean(b);
  return ca.length === cb.length && ca.every((r, i) => r === cb[i]);
}

/**
 * Trading → Rules sub-tab: an always-editable form for the personal rules
 * shown in the 9:15 AM ET pre-market acknowledgement.
 */
export default function RulesView() {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTradingRules().then((loaded) => {
      if (cancelled) return;
      setSaved(loaded);
      setDraft(loaded.length > 0 ? loaded : ['']);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the saved baseline current if another view saves rules.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const next = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(next)) setSaved(next);
    };
    window.addEventListener(TRADING_RULES_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(TRADING_RULES_UPDATED_EVENT, onUpdated);
  }, []);

  function edit(fn: (prev: string[]) => string[]) {
    setDraft(fn);
    setJustSaved(false);
    setSaveError(null);
  }

  function move(i: number, dir: -1 | 1) {
    edit((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const stored = await saveTradingRules(draft);
      setSaved(stored);
      setDraft(stored.length > 0 ? stored : ['']);
      setJustSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const dirty = saved !== null && !sameRules(draft, saved);
  const canSave = dirty && !saving && draft.every((r) => r.length <= MAX_RULE_LENGTH);

  return (
    <div className="max-w-5xl mx-auto">
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div
          className="flex items-center gap-3 px-5 py-3.5 sm:px-6 sm:py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.01)' }}
        >
          <div className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Trading Rules
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              You&apos;ll review these every trading day at 9:15 AM ET, before the open.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {saved === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 rounded-lg animate-pulse bg-[#0d1117]" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Rules</label>
                <div className="space-y-2">
                  {draft.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs tabular-nums text-[#8b949e] flex-shrink-0">{i + 1}.</span>
                      <input
                        type="text"
                        value={rule}
                        onChange={(e) => edit((prev) => prev.map((r, idx) => (idx === i ? e.target.value : r)))}
                        maxLength={MAX_RULE_LENGTH}
                        aria-label={`Rule ${i + 1}`}
                        placeholder="e.g. Stop trading after 3R total loss"
                        className={`${INPUT_CLASS} min-w-0`}
                      />
                      <div className="flex items-center flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="p-1.5 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8b949e] hidden sm:block"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === draft.length - 1}
                          className="p-1.5 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8b949e] hidden sm:block"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => edit((prev) => prev.filter((_, idx) => idx !== i))}
                          className="p-1.5 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {draft.length < MAX_RULES ? (
                <button
                  type="button"
                  onClick={() => edit((prev) => [...prev, ''])}
                  className="flex items-center gap-1.5 text-sm text-[#8b949e] hover:text-[#F97316] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add rule
                </button>
              ) : (
                <p className="text-xs text-[#8b949e]">Maximum of {MAX_RULES} rules reached.</p>
              )}

              <div
                className="flex flex-wrap items-center gap-3 pt-4"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={() => edit(() => [...DEFAULT_TRADING_RULES])}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to defaults
                </button>
                <div className="ml-auto flex items-center gap-3">
                  {saveError ? (
                    <span className="text-xs text-[#f85149]">{saveError}</span>
                  ) : justSaved && !dirty ? (
                    <span className="flex items-center gap-1 text-xs text-[#3fb950]">
                      <Check className="w-3.5 h-3.5" />
                      Saved
                    </span>
                  ) : dirty ? (
                    <span className="text-xs text-[#8b949e]">Unsaved changes</span>
                  ) : null}
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => edit(() => (saved.length > 0 ? [...saved] : ['']))}
                      disabled={saving}
                      className="px-3 py-2 rounded-lg text-sm font-medium border border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] transition-colors disabled:opacity-50"
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={save}
                    disabled={!canSave}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-[#F97316] hover:bg-[#ea580c] text-white disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#484f58]"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
