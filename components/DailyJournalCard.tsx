'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, ChevronLeft, ChevronRight, Flame, Check, Settings } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import {
  hasContent, moodOf, DEFAULT_TEXT_PROMPTS,
  type JournalPrompt, type PromptDef,
} from '@/lib/journal-prompts';
import JournalReportModal from '@/components/JournalReportModal';
import JournalEntryModal from '@/components/JournalEntryModal';
import ManagePromptsModal from '@/components/ManagePromptsModal';

interface Entry {
  prompts: JournalPrompt[];
  updatedAt: string;
}

const DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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

export default function DailyJournalCard() {
  const today = getTodayInEST();
  const thisMonday = mondayOf(today);

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [textPrompts, setTextPrompts] = useState<PromptDef[]>(DEFAULT_TEXT_PROMPTS);
  const [weekStart, setWeekStart] = useState<string>(thisMonday);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const loadAll = useCallback(async () => {
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
    } catch {
      /* leave map as-is */
    }
  }, []);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/personal-journal-prompts?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.prompts)) setTextPrompts(data.prompts);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadPrompts();
  }, [loadAll, loadPrompts]);

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

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent">
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
        <div className="flex items-center gap-1">
          <div className="relative group">
            <button
              onClick={() => setShowManage(true)}
              className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-[#8b949e] group-hover:text-[#F97316]" />
            </button>
            <div className="absolute top-full right-0 mt-1.5 px-2 py-1 bg-[#30363d] text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Manage prompts
            </div>
          </div>
          <div className="relative group">
            <button
              onClick={() => setShowReport(true)}
              className="p-1.5 bg-[#F97316]/15 hover:bg-[#F97316]/30 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
            </button>
            <div className="absolute top-full right-0 mt-1.5 px-2 py-1 bg-[#30363d] text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Generate Report
            </div>
          </div>
        </div>
      </div>

      {/* Week strip */}
      <div className="px-4 pt-3 pb-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <button
            onClick={() => setWeekStart((w) => shift(w, -7))}
            className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-[#c9d1d9]">Week of {shortWeekLabel(weekStart)}</span>
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
            return (
              <button
                key={d}
                onClick={() => !isFuture && setModalDate(d)}
                disabled={isFuture}
                className="flex flex-col items-center gap-1 group disabled:cursor-not-allowed"
                title={isFuture ? longDayLabel(d) : `${longDayLabel(d)} — ${done ? 'view / edit' : 'add entry'}`}
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
                    ${isToday ? 'ring-1 ring-[#F97316]/60' : ''}
                  `}
                >
                  {done ? mood || <Check className="w-4 h-4" strokeWidth={3} /> : dayNum(d)}
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

      {modalDate && (
        <JournalEntryModal
          date={modalDate}
          initialPrompts={entries[modalDate]?.prompts || null}
          textPrompts={textPrompts}
          onClose={() => setModalDate(null)}
          onSaved={loadAll}
        />
      )}
      {showReport && <JournalReportModal onClose={() => setShowReport(false)} />}
      {showManage && (
        <ManagePromptsModal
          initial={textPrompts}
          onClose={() => setShowManage(false)}
          onSaved={(p) => setTextPrompts(p)}
        />
      )}
    </div>
  );
}
