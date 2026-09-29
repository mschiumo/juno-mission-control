'use client';

import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import {
  ShieldCheck,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  Clock,
  ListChecks,
  Lightbulb,
} from 'lucide-react';
import {
  DEFAULT_TRADING_RULES,
  MAX_RULE_LENGTH,
  MAX_RULES,
  TRADING_RULES_UPDATED_EVENT,
  fetchTradingRules,
  saveTradingRules,
} from '@/lib/trading/trading-rules';

function sameRules(a: string[], b: string[]) {
  const clean = (l: string[]) => l.map((r) => r.trim()).filter(Boolean);
  const ca = clean(a);
  const cb = clean(b);
  return ca.length === cb.length && ca.every((r, i) => r === cb[i]);
}

/** Textarea that grows with its content so rules wrap instead of scrolling sideways. */
function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // Wrapping changes with width, so re-fit when the viewport resizes.
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

const CARD_STYLE = { background: 'var(--surface-1)', border: '1px solid var(--border-default)' };

/**
 * Trading → Rules sub-tab: edit the personal rules shown in the 9:15 AM ET
 * pre-market acknowledgement. Rules are a grid of editable cards; the side
 * panel holds save state and context.
 */
export default function RulesView() {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [newRuleIndex, setNewRuleIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTradingRules().then((loaded) => {
      if (cancelled) return;
      setSaved(loaded);
      setDraft(loaded);
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

  function addRule() {
    if (draft.length >= MAX_RULES) return;
    const index = draft.length;
    edit((prev) => [...prev, '']);
    setNewRuleIndex(index);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const stored = await saveTradingRules(draft);
      setSaved(stored);
      setDraft(stored);
      setJustSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const dirty = saved !== null && !sameRules(draft, saved);
  const canSave = dirty && !saving && draft.every((r) => r.length <= MAX_RULE_LENGTH);
  const ruleCount = draft.filter((r) => r.trim()).length;

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      {/* Rules */}
      <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <header
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
              style={{ background: 'var(--accent-dim)' }}
            >
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Trading Rules
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                The commitments you review before every open.
              </p>
            </div>
          </div>
          <span
            className="text-xs tabular-nums px-2 py-1 rounded-md flex-shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
          >
            {ruleCount} / {MAX_RULES}
          </span>
        </header>

        <div className="p-5">
          {saved === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--surface-2)' }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {draft.map((rule, i) => (
                <div
                  key={i}
                  className="group flex flex-col rounded-lg transition-colors focus-within:border-[#F97316]/60"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between px-3 pt-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                      Rule {i + 1}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#30363d] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8b949e] transition-colors"
                        title="Move earlier"
                        aria-label={`Move rule ${i + 1} earlier`}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === draft.length - 1}
                        className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#30363d] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8b949e] transition-colors"
                        title="Move later"
                        aria-label={`Move rule ${i + 1} later`}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => edit((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors"
                        title="Delete rule"
                        aria-label={`Delete rule ${i + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <AutoGrowTextarea
                    value={rule}
                    autoFocus={i === newRuleIndex}
                    onChange={(e) => edit((prev) => prev.map((r, idx) => (idx === i ? e.target.value : r)))}
                    maxLength={MAX_RULE_LENGTH}
                    aria-label={`Rule ${i + 1}`}
                    placeholder="Write a rule you'll hold yourself to…"
                    className="w-full flex-shrink-0 bg-transparent px-3 pt-1 pb-3 text-sm leading-relaxed text-white placeholder-[#6e7681] resize-none overflow-hidden focus:outline-none"
                  />
                </div>
              ))}

              {draft.length < MAX_RULES && (
                <button
                  type="button"
                  onClick={addRule}
                  className="min-h-[88px] flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#30363d] text-[#8b949e] hover:border-[#F97316]/60 hover:text-[#F97316] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Add rule</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Side panel */}
      <aside className="space-y-4 lg:sticky lg:top-4">
        <div className="rounded-xl p-5 space-y-4" style={CARD_STYLE}>
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                9:15 AM ET check
              </p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Every trading day these rules pop up for you to acknowledge before the open.
              </p>
            </div>
          </div>

          <div className="pt-4 space-y-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="h-5 text-xs">
              {saveError ? (
                <span className="text-[#f85149]">{saveError}</span>
              ) : justSaved && !dirty ? (
                <span className="flex items-center gap-1 text-[#3fb950]">
                  <Check className="w-3.5 h-3.5" />
                  Saved
                </span>
              ) : dirty ? (
                <span className="flex items-center gap-1.5 text-[#d29922]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d29922]" />
                  Unsaved changes
                </span>
              ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>All changes saved</span>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors bg-[#F97316] hover:bg-[#ea580c] text-white disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#484f58]"
            >
              {saving ? 'Saving…' : 'Save rules'}
            </button>
            {dirty && saved && (
              <button
                type="button"
                onClick={() => edit(() => [...saved])}
                disabled={saving}
                className="w-full py-2 rounded-lg text-sm font-medium border border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] transition-colors disabled:opacity-50"
              >
                Discard changes
              </button>
            )}
            <button
              type="button"
              onClick={() => edit(() => [...DEFAULT_TRADING_RULES])}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 pt-1 text-xs text-[#8b949e] hover:text-white transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to default rules
            </button>
          </div>
        </div>

        <div className="rounded-xl p-5" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Writing good rules
            </p>
          </div>
          <ul className="space-y-2">
            {[
              'Make them checkable — "Stop after 3R loss", not "Trade well".',
              'Put the rules you break most often first.',
              'Keep the list short enough to actually read each morning.',
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <ListChecks className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
