'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, ChevronLeft, ChevronRight, Loader2, Pencil, Check, Flame,
} from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import JournalReportModal from '@/components/JournalReportModal';

interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

interface Entry {
  prompts: JournalPrompt[];
  updatedAt: string;
}

// A friendly spread of moods for the quick-pick. The chosen emoji becomes the
// day's badge in the weekly strip.
const MOODS = ['🤩', '😄', '🙂', '😌', '😐', '😕', '😫', '😴'];

// Mood (emoji) + reflective text prompts. Mindset/goals oriented.
const DEFAULT_PROMPTS: JournalPrompt[] = [
  { id: 'mood', question: 'How are you feeling today?', answer: '' },
  { id: 'focus', question: "What's your main focus or goal today?", answer: '' },
  { id: 'challenge', question: 'What challenge are you working through?', answer: '' },
  { id: 'grateful', question: "One thing you're grateful for?", answer: '' },
  { id: 'other', question: 'Other', answer: '' },
];
const TEXT_PROMPTS = DEFAULT_PROMPTS.filter((p) => p.id !== 'mood');

const DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function mergePrompts(saved: JournalPrompt[]): JournalPrompt[] {
  return DEFAULT_PROMPTS.map((d) => saved.find((p) => p.id === d.id) ?? { ...d });
}

// ---- date helpers (anchored at noon to dodge DST) ----
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parse(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}
function shift(dateStr: string, days: number): string {
  const d = parse(dateStr);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
function mondayOf(dateStr: string): string {
  const d = parse(dateStr);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return ymd(d);
}
function dayNum(dateStr: string): number {
  return parse(dateStr).getDate();
}
function longDayLabel(dateStr: string): string {
  return parse(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function shortWeekLabel(dateStr: string): string {
  return parse(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

const hasContent = (prompts?: JournalPrompt[]) => !!prompts?.some((p) => p.answer?.trim());
const moodOf = (prompts?: JournalPrompt[]) => prompts?.find((p) => p.id === 'mood')?.answer || '';

export default function DailyJournalCard() {
  const today = getTodayInEST();
  const thisMonday = mondayOf(today);

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [weekStart, setWeekStart] = useState<string>(thisMonday);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [prompts, setPrompts] = useState<JournalPrompt[]>(DEFAULT_PROMPTS.map((p) => ({ ...p })));
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Seed the editor/view for a given day from the entries map.
  const seed = useCallback((d: string, map: Record<string, Entry>) => {
    const saved = map[d];
    if (saved && hasContent(saved.prompts)) {
      setPrompts(mergePrompts(saved.prompts));
      setUpdatedAt(saved.updatedAt || null);
      setMode('view');
    } else {
      setPrompts(DEFAULT_PROMPTS.map((p) => ({ ...p })));
      setUpdatedAt(null);
      setMode('edit');
    }
    setSelectedDate(d);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personal-journal?_t=${Date.now()}`);
      const data = await res.json();
      const map: Record<string, Entry> = {};
      if (data.success) {
        for (const e of data.entries || []) {
          map[e.date] = { prompts: e.prompts || [], updatedAt: e.updatedAt };
        }
      }
      setEntries(map);
      seed(selectedDate, map);
    } catch {
      seed(selectedDate, {});
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectDay(d: string) {
    if (d > today) return; // can't journal the future
    seed(d, entries);
  }

  const updateAnswer = (id: string, answer: string) =>
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, answer } : p)));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/personal-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, prompts }),
      });
      const data = await res.json();
      if (data.success) {
        const ua = data.entry?.updatedAt || new Date().toISOString();
        setEntries((prev) => ({ ...prev, [selectedDate]: { prompts, updatedAt: ua } }));
        setUpdatedAt(ua);
        setMode(hasContent(prompts) ? 'view' : 'edit');
      }
    } catch {
      /* keep editing on failure */
    } finally {
      setSaving(false);
    }
  }

  // ---- derived ----
  const weekDays = Array.from({ length: 7 }, (_, i) => shift(weekStart, i));
  const weekDoneCount = weekDays.filter((d) => hasContent(entries[d]?.prompts)).length;

  // streak: consecutive journaled days ending today (an unfinished today doesn't break it)
  let streak = 0;
  {
    let d = today;
    if (!hasContent(entries[d]?.prompts)) d = shift(d, -1);
    while (hasContent(entries[d]?.prompts)) {
      streak++;
      d = shift(d, -1);
    }
  }

  const selectedMood = moodOf(prompts);
  const isTodaySel = selectedDate === today;
  const answeredText = prompts.filter((p) => p.id !== 'mood' && p.answer.trim());

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">📓</span>
          <h2 className="text-sm font-semibold text-white">Daily Journal</h2>
          {streak > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#F97316]/15 text-[#F97316] font-semibold">
              <Flame className="w-3 h-3" />
              {streak}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowReport(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F97316] hover:bg-[#ea6c08] text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate Report
        </button>
      </div>

      {/* Week strip */}
      <div className="px-4 pt-3 pb-3 border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <button
            onClick={() => setWeekStart((w) => shift(w, -7))}
            className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-[#c9d1d9]">
            Week of {shortWeekLabel(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart((w) => shift(w, 7))}
            disabled={weekStart >= thisMonday}
            className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const done = hasContent(entries[d]?.prompts);
            const mood = moodOf(entries[d]?.prompts);
            const isToday = d === today;
            const isFuture = d > today;
            const isSelected = d === selectedDate;
            return (
              <button
                key={d}
                onClick={() => selectDay(d)}
                disabled={isFuture}
                className="flex flex-col items-center gap-1 group disabled:cursor-not-allowed"
                title={longDayLabel(d)}
              >
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${
                    isToday ? 'text-[#F97316]' : 'text-[#6e7681]'
                  }`}
                >
                  {DOW_LABELS[i]}
                </span>
                <span
                  className={`
                    w-9 h-9 rounded-2xl flex items-center justify-center text-sm transition-all duration-200
                    ${!isFuture && 'group-hover:scale-110'}
                    ${
                      done
                        ? 'bg-gradient-to-br from-[#F97316]/40 to-[#f59e0b]/25 ring-1 ring-[#F97316]/50 shadow-[0_2px_8px_-2px_rgba(249,115,22,0.4)] text-white'
                        : isFuture
                          ? 'bg-[#0d1117]/40 text-[#484f58]'
                          : 'bg-[#0d1117] border border-dashed border-[#30363d] text-[#8b949e] group-hover:border-[#F97316]/40'
                    }
                    ${isSelected ? 'ring-2 ring-offset-2 ring-offset-[#161b22] ring-[#F97316] scale-105' : ''}
                    ${isToday && !isSelected ? 'ring-1 ring-[#F97316]/60' : ''}
                  `}
                >
                  {done ? (mood || <Check className="w-4 h-4" strokeWidth={3} />) : dayNum(d)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Weekly progress */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-1.5 rounded-full bg-[#0d1117] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#F97316] to-[#f59e0b] transition-all duration-500"
              style={{ width: `${(weekDoneCount / 7) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-[#8b949e] font-medium tabular-nums">{weekDoneCount}/7</span>
        </div>
      </div>

      {/* Selected day */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#8b949e]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Day header */}
          <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {mode === 'view' && selectedMood && <span className="text-lg leading-none">{selectedMood}</span>}
              <span className="text-sm font-semibold text-white truncate">
                {isTodaySel ? 'Today' : longDayLabel(selectedDate)}
              </span>
              {mode === 'view' && updatedAt && (
                <span className="text-[10px] text-[#8b949e] flex-shrink-0">· {formatTime(updatedAt)}</span>
              )}
            </div>
            {mode === 'view' && (
              <button
                onClick={() => setMode('edit')}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            )}
          </div>

          {mode === 'view' ? (
            /* ---- read view ---- */
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3.5 min-h-0">
              {answeredText.map((prompt) => (
                <div key={prompt.id}>
                  <p className="text-xs font-medium text-[#F97316] mb-1">{prompt.question}</p>
                  <p className="text-sm text-[#c9d1d9] whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-[#F97316]/30">
                    {prompt.answer}
                  </p>
                </div>
              ))}
              {answeredText.length === 0 && (
                <p className="text-sm text-[#8b949e] italic">Mood logged — tap Edit to add a reflection.</p>
              )}
            </div>
          ) : (
            /* ---- edit form ---- */
            <>
              <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3 min-h-0">
                {/* Mood picker */}
                <div>
                  <p className="text-xs font-medium text-[#F97316] mb-1.5">How are you feeling today?</p>
                  <div className="flex gap-1">
                    {MOODS.map((m) => {
                      const active = selectedMood === m;
                      return (
                        <button
                          key={m}
                          onClick={() => updateAnswer('mood', active ? '' : m)}
                          className={`flex-1 aspect-square rounded-lg text-lg flex items-center justify-center transition-all ${
                            active
                              ? 'bg-[#F97316]/20 ring-1 ring-[#F97316] scale-110'
                              : 'bg-[#0d1117] hover:bg-[#30363d] grayscale hover:grayscale-0 opacity-80 hover:opacity-100'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {TEXT_PROMPTS.map((tp) => {
                  const prompt = prompts.find((p) => p.id === tp.id)!;
                  return (
                    <div key={tp.id}>
                      <label className="text-xs font-medium text-[#F97316] mb-1.5 block">
                        {tp.question}
                        {tp.id === 'other' && <span className="text-[#8b949e] font-normal ml-1">(optional)</span>}
                      </label>
                      <textarea
                        value={prompt.answer}
                        onChange={(e) => updateAnswer(tp.id, e.target.value)}
                        placeholder="Type here..."
                        rows={2}
                        className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] resize-none focus:outline-none focus:border-[#F97316] transition-colors"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
                {updatedAt && (
                  <button
                    onClick={() => seed(selectedDate, entries)}
                    disabled={saving}
                    className="px-3 py-1.5 text-[#8b949e] hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-1.5 bg-[#F97316] hover:bg-[#ea6c08] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showReport && <JournalReportModal onClose={() => setShowReport(false)} />}
    </div>
  );
}
