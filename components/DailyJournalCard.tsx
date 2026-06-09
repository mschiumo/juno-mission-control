'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Sparkles, ChevronLeft, ChevronRight, Loader2, Pencil, CheckCircle2,
} from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import JournalReportModal from '@/components/JournalReportModal';

interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

// Mindset / goals oriented prompts (distinct from the trading journal's prompts).
const DEFAULT_PROMPTS: JournalPrompt[] = [
  { id: 'feeling', question: 'How are you feeling today?', answer: '' },
  { id: 'focus', question: "What's your main focus or goal today?", answer: '' },
  { id: 'challenge', question: 'What challenge are you working through?', answer: '' },
  { id: 'grateful', question: "One thing you're grateful for?", answer: '' },
  { id: 'other', question: 'Other', answer: '' },
];

function mergePromptsWithDefaults(saved: JournalPrompt[]): JournalPrompt[] {
  return DEFAULT_PROMPTS.map((d) => saved.find((p) => p.id === d.id) ?? { ...d });
}

// Shift a YYYY-MM-DD date string by N calendar days (anchored at noon to dodge DST).
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function DailyJournalCard() {
  const today = getTodayInEST();
  const [date, setDate] = useState<string>(today);
  const [prompts, setPrompts] = useState<JournalPrompt[]>(DEFAULT_PROMPTS.map((p) => ({ ...p })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const isToday = date === today;

  const loadEntry = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personal-journal?date=${d}&_t=${Date.now()}`);
      const data = await res.json();
      const entry = data?.entry;
      const hasContent = entry?.prompts?.length && entry.prompts.some((p: JournalPrompt) => p.answer?.trim());
      if (hasContent) {
        setPrompts(mergePromptsWithDefaults(entry.prompts));
        setUpdatedAt(entry.updatedAt || null);
        setMode('view');
      } else {
        setPrompts(DEFAULT_PROMPTS.map((p) => ({ ...p })));
        setUpdatedAt(null);
        setMode('edit');
      }
    } catch {
      setPrompts(DEFAULT_PROMPTS.map((p) => ({ ...p })));
      setUpdatedAt(null);
      setMode('edit');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntry(date);
  }, [date, loadEntry]);

  const updateAnswer = (id: string, answer: string) => {
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, answer } : p)));
  };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/personal-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, prompts }),
      });
      const data = await res.json();
      if (data.success) {
        setUpdatedAt(data.entry?.updatedAt || new Date().toISOString());
        setMode(prompts.some((p) => p.answer.trim()) ? 'view' : 'edit');
      }
    } catch {
      // keep editing on failure
    } finally {
      setSaving(false);
    }
  }

  const answered = prompts.filter((p) => p.answer.trim());

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Daily Journal</h2>
        </div>
        <button
          onClick={() => setShowReport(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F97316] hover:bg-[#ea6c08] text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate Report
        </button>
      </div>

      {/* Date nav */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] flex-shrink-0">
        <button
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
          title="Previous day"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          {mode === 'view' && <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />}
          <span className="text-xs font-medium text-[#c9d1d9]">{formatDayLabel(date)}</span>
          {isToday && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#238636]/20 text-[#3fb950] font-medium uppercase tracking-wide">
              Today
            </span>
          )}
        </div>
        <button
          onClick={() => setDate((d) => shiftDate(d, 1))}
          disabled={isToday}
          className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next day"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#8b949e]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : mode === 'view' ? (
        /* ---- Submitted / read view ---- */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {/* Completed banner */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-[#238636]/25 bg-gradient-to-r from-[#238636]/15 to-transparent">
              <div className="w-9 h-9 rounded-full bg-[#238636]/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-[#3fb950]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {isToday ? "Today's reflection is in" : 'Reflection saved'}
                </p>
                <p className="text-xs text-[#8b949e]">
                  {answered.length} {answered.length === 1 ? 'prompt' : 'prompts'} answered
                  {updatedAt ? ` · ${formatTime(updatedAt)}` : ''}
                </p>
              </div>
            </div>

            {/* Answers */}
            {answered.map((prompt) => (
              <div key={prompt.id}>
                <p className="text-xs font-medium text-[#F97316] mb-1">{prompt.question}</p>
                <p className="text-sm text-[#c9d1d9] whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-[#F97316]/30">
                  {prompt.answer}
                </p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
            <span className="text-xs text-[#8b949e]">
              {isToday ? 'Nice work showing up today.' : ''}
            </span>
            <button
              onClick={() => setMode('edit')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] hover:border-[#8b949e] text-[#c9d1d9] text-xs font-medium rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
        </>
      ) : (
        /* ---- Edit form ---- */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            <p className="text-xs text-[#8b949e]">
              {isToday ? 'Take a moment to reflect on your day.' : `Add a reflection for ${formatDayLabel(date)}.`}
            </p>
            {prompts.map((prompt) => (
              <div key={prompt.id}>
                <label className="text-xs font-medium text-[#F97316] mb-1.5 block">
                  {prompt.question}
                  {prompt.id === 'other' && <span className="text-[#8b949e] font-normal ml-1">(optional)</span>}
                </label>
                <textarea
                  value={prompt.answer}
                  onChange={(e) => updateAnswer(prompt.id, e.target.value)}
                  placeholder="Type here..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] resize-none focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
            {updatedAt && (
              <button
                onClick={() => loadEntry(date)}
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

      {showReport && <JournalReportModal onClose={() => setShowReport(false)} />}
    </div>
  );
}
