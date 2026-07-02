'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Quote, Pencil, Plus, Trash2, X } from 'lucide-react';

const QUOTES: { text: string; author: string }[] = [
  { text: 'The market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
  { text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", author: 'George Soros' },
  { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
  { text: 'Losers average losers.', author: 'Paul Tudor Jones' },
  { text: 'Amateurs think about how much money they can make. Professionals think about how much money they could lose.', author: 'Jack Schwager' },
  { text: "I'm only rich because I know when I'm wrong.", author: 'George Soros' },
  { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
  { text: 'Risk comes from not knowing what you are doing.', author: 'Warren Buffett' },
  { text: 'The trend is your friend until the end when it bends.', author: 'Ed Seykota' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'Every battle is won before it is ever fought — by preparation.', author: 'Sun Tzu' },
  { text: "Don't focus on making money; focus on protecting what you have.", author: 'Paul Tudor Jones' },
];

function quoteForDay(ymd: string): { text: string; author: string } {
  let hash = 0;
  for (let i = 0; i < ymd.length; i++) hash = (hash * 31 + ymd.charCodeAt(i)) | 0;
  return QUOTES[Math.abs(hash) % QUOTES.length];
}

const DEFAULT_RULES = [
  "Don't double trade",
  "Don't force entries",
  "Don't exit early or trail too tightly on runners",
  "Remain neutral, even after wins or losses",
  "After 3R total loss, stop trading for the day",
  "If up 3R on the day, preserve AT LEAST 1R of profit",
];

const MAX_RULE_LENGTH = 240;
const MAX_RULES = 30;

// US market holidays for 2026. Kept inline (not imported from lib/cron-helpers)
// because that module pulls in server-only deps. Keep in sync.
const US_MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

const TRIGGER_HOUR = 9;
const TRIGGER_MINUTE = 15;
const STORAGE_PREFIX = 'trading_rules_ack_';

type EtParts = { weekday: string; hour: number; minute: number; ymd: string };

function getEtParts(date: Date): EtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return {
    weekday: get('weekday'),
    hour,
    minute: parseInt(get('minute'), 10),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function isTradingDay(et: EtParts): boolean {
  if (et.weekday === 'Sat' || et.weekday === 'Sun') return false;
  return !US_MARKET_HOLIDAYS.has(et.ymd);
}

// Two-tone "opening bell" chime, synthesized via Web Audio API so no audio
// asset needs to be bundled. Fails silently if the API isn't available or
// the browser blocks audio for autoplay reasons — the modal still opens.
function playOpeningBell(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();

    const playTone = (frequency: number, startAt: number, duration: number, peak = 0.35) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      // Bell-like envelope: fast attack, exponential decay
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    const t0 = ctx.currentTime;
    playTone(880, t0, 1.4);             // A5
    playTone(1318.51, t0 + 0.12, 1.3);  // E6 — perfect fifth above

    // Close the context after the chime finishes so we don't leak audio nodes.
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1800);
  } catch {
    // Audio is non-critical; ignore any failure.
  }
}

export default function TradingRulesModal() {
  const [show, setShow] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rules, setRules] = useState<string[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftRules, setDraftRules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load rules from server, then schedule the modal
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function loadAndSchedule() {
      let loaded: string[] = DEFAULT_RULES;
      try {
        const res = await fetch('/api/user/prefs');
        const data = await res.json();
        if (data?.success && Array.isArray(data.prefs?.tradingRules)) {
          loaded = data.prefs.tradingRules;
        }
      } catch {
        // Fall back to defaults
      }
      if (cancelled) return;
      setRules(loaded);

      const et = getEtParts(new Date());
      if (!isTradingDay(et)) return;

      const storageKey = `${STORAGE_PREFIX}${et.ymd}`;
      if (localStorage.getItem(storageKey)) return;

      const minutesNow = et.hour * 60 + et.minute;
      const triggerMinutes = TRIGGER_HOUR * 60 + TRIGGER_MINUTE;
      const msUntil = Math.max(0, (triggerMinutes - minutesNow) * 60 * 1000);

      timer = setTimeout(() => {
        if (cancelled) return;
        playOpeningBell();
        setShow(true);
      }, msUntil);
    }

    loadAndSchedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  function persistDismissal() {
    const et = getEtParts(new Date());
    localStorage.setItem(`${STORAGE_PREFIX}${et.ymd}`, new Date().toISOString());
    setShow(false);
    setIsEditing(false);
  }

  function handleAcknowledge() {
    if (!acknowledged) return;
    persistDismissal();
  }

  function enterEditMode() {
    setDraftRules([...(rules ?? [])]);
    setSaveError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setSaveError(null);
  }

  function updateDraft(i: number, value: string) {
    setDraftRules((prev) => prev.map((r, idx) => (idx === i ? value : r)));
  }

  function deleteDraft(i: number) {
    setDraftRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addDraft() {
    if (draftRules.length >= MAX_RULES) return;
    setDraftRules((prev) => [...prev, '']);
  }

  async function saveRules() {
    const cleaned = draftRules
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .slice(0, MAX_RULES);

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/user/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingRules: cleaned }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Save failed');
      setRules(cleaned);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!show || rules === null) return null;

  const quote = quoteForDay(getEtParts(new Date()).ymd);
  const canSave = !saving && draftRules.every((r) => r.length <= MAX_RULE_LENGTH);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-[#F97316]/10 rounded-xl flex-shrink-0">
                <ShieldCheck className="w-6 h-6 text-[#F97316]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-white">
                  {isEditing ? 'Edit Trading Rules' : 'Trading Rules'}
                </h2>
                <p className="text-sm text-[#8b949e]">
                  {isEditing
                    ? 'Add, remove, or update your rules.'
                    : 'Review before the open. Acknowledge to continue.'}
                </p>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={enterEditMode}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors flex-shrink-0"
                title="Edit rules"
              >
                <Pencil className="w-4 h-4 text-[#8b949e]" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {!isEditing && (
            <div className="flex items-start gap-3 p-4 bg-[#F97316]/5 border border-[#F97316]/20 rounded-lg">
              <Quote className="w-4 h-4 text-[#F97316] flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm text-[#e6edf3] italic leading-relaxed">
                  &ldquo;{quote.text}&rdquo;
                </p>
                <p className="text-xs text-[#8b949e] mt-1.5">— {quote.author}</p>
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-2">
              {draftRules.length === 0 && (
                <p className="text-sm text-[#8b949e] text-center py-4">
                  No rules yet. Add your first one below.
                </p>
              )}
              {draftRules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 bg-[#0d1117] border border-[#21262d] rounded-lg"
                >
                  <span className="text-xs font-bold text-[#F97316] bg-[#F97316]/10 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 tabular-nums mt-1">
                    {i + 1}
                  </span>
                  <textarea
                    value={rule}
                    onChange={(e) => updateDraft(i, e.target.value)}
                    maxLength={MAX_RULE_LENGTH}
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-[#e6edf3] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 rounded px-2 py-1 min-w-0"
                    placeholder="Enter a rule..."
                  />
                  <button
                    onClick={() => deleteDraft(i)}
                    className="p-1.5 hover:bg-[#f85149]/10 rounded transition-colors flex-shrink-0 mt-0.5"
                    title="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#f85149]" />
                  </button>
                </div>
              ))}
              {draftRules.length < MAX_RULES && (
                <button
                  onClick={addDraft}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#30363d] hover:border-[#F97316]/50 text-sm text-[#8b949e] hover:text-[#F97316] rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add rule
                </button>
              )}
              {saveError && (
                <p className="text-xs text-[#f85149]">{saveError}</p>
              )}
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-6 px-4 border border-dashed border-[#30363d] rounded-lg">
              <p className="text-sm text-[#c9d1d9] font-medium mb-1">No rules set</p>
              <p className="text-xs text-[#8b949e] mb-4">
                Add your trading rules to get a daily reminder.
              </p>
              <button
                onClick={enterEditMode}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F97316] hover:bg-[#ea580c] text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add your first rule
              </button>
            </div>
          ) : (
            <ol className="space-y-2">
              {rules.map((rule, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 p-3 bg-[#0d1117] border border-[#21262d] rounded-lg"
                >
                  <span className="text-xs font-bold text-[#F97316] bg-[#F97316]/10 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[#e6edf3] leading-relaxed">{rule}</span>
                </li>
              ))}
            </ol>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveRules}
                disabled={!canSave}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#484f58] bg-[#F97316] hover:bg-[#ea580c] text-white"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : rules.length > 0 ? (
            <>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-[#30363d] bg-[#0d1117] accent-[#F97316] flex-shrink-0"
                />
                <span className="text-sm text-[#c9d1d9] leading-snug">
                  I&apos;ve reviewed my rules and commit to following them today.
                </span>
              </label>

              <button
                onClick={handleAcknowledge}
                disabled={!acknowledged}
                className="w-full py-3 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#484f58] bg-[#F97316] hover:bg-[#ea580c] text-white"
              >
                Start Trading
              </button>

              <button
                onClick={persistDismissal}
                className="flex items-center gap-1.5 mx-auto text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
              >
                <X className="w-3 h-3" />
                Not trading today — dismiss
              </button>
            </>
          ) : (
            <button
              onClick={persistDismissal}
              className="flex items-center gap-1.5 mx-auto text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
            >
              <X className="w-3 h-3" />
              Dismiss for today
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
