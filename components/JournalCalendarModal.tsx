'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Loader2, CalendarDays, Target, Check, Minus, BookOpen, Moon } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import { hasContent, moodOf, sleepOf, type JournalPrompt, type GoalReview } from '@/lib/journal-prompts';

// Read-only journal archive, opened from the Daily Journal card: a month
// calendar on the left (mood emoji on days with an entry) and the selected
// day's entry on the right. Entries come from the personal journal only.

interface Entry {
  date: string;
  prompts: JournalPrompt[];
  goalReviews: GoalReview[];
  updatedAt?: string;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Date-only string helpers (UTC-anchored so viewers east of ET never shift a day)

function toUTC(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(date: string, opts: Intl.DateTimeFormatOptions): string {
  return toUTC(date).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}
function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
/** Mon-start grid for a month: leading blanks (null) then every date. */
function monthGrid(month: string): (string | null)[] {
  const first = toUTC(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ── Reader ────────────────────────────────────────────────────────────────

function SleepDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Sleep quality ${value}/5`}>
      <Moon className="w-3.5 h-3.5 text-[#8b949e]" />
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`w-2 h-2 rounded-full ${n <= value ? 'bg-[#F97316]' : 'bg-[#30363d]'}`} />
        ))}
      </span>
    </span>
  );
}

function EntryPage({ entry, date }: { entry: Entry | undefined; date: string }) {
  const mood = moodOf(entry?.prompts);
  const sleep = sleepOf(entry?.prompts);
  const answered = (entry?.prompts || []).filter((p) => p.id !== 'mood' && p.id !== 'sleep' && p.answer?.trim());
  const reviews = entry?.goalReviews || [];

  return (
    <article key={date} className="animate-[fadeIn_200ms_ease-out]">
      {/* Masthead */}
      <header className="flex items-start gap-4 pb-5 mb-5 border-b border-[#30363d]">
        <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F97316]/25 to-[#f59e0b]/10 ring-1 ring-[#F97316]/30 flex items-center justify-center text-3xl leading-none">
          {entry ? mood || '📓' : '·'}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#F97316] font-semibold">
            {fmt(date, { weekday: 'long' })}
          </p>
          <h3 className="font-serif text-2xl sm:text-[28px] leading-tight text-white mt-0.5">
            {fmt(date, { month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          {entry && sleep > 0 && (
            <div className="mt-2">
              <SleepDots value={sleep} />
            </div>
          )}
        </div>
      </header>

      {!entry ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-2">
          <BookOpen className="w-8 h-8 text-[#30363d]" />
          <p className="font-serif text-lg text-[#8b949e]">No entry this day</p>
          <p className="text-xs text-[#6e7681]">Pick a day with a mood on the calendar to read it.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {answered.length === 0 && reviews.length === 0 && (
            <p className="font-serif italic text-[#8b949e]">Only a mood was logged this day.</p>
          )}
          {answered.map((p) => (
            <section key={p.id}>
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-[#F97316]/90 font-semibold mb-2">
                {p.id === 'other' ? 'Other thoughts' : p.question}
              </h4>
              <p className="font-serif text-[15px] sm:text-base leading-[1.75] text-[#e6edf3] whitespace-pre-wrap pl-4 border-l-2 border-[#F97316]/30">
                {p.answer}
              </p>
            </section>
          ))}

          {reviews.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-[#F97316]/90 font-semibold mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Goals reviewed
              </h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {reviews.map((r) => {
                  const tone = r.madeProgress === true ? '#3fb950' : r.madeProgress === false ? '#f85149' : '#8b949e';
                  return (
                    <li key={r.goalId} className="flex items-start gap-2 p-2.5 rounded-lg border" style={{ borderColor: `${tone}33`, backgroundColor: `${tone}0d` }}>
                      <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${tone}33`, color: tone }}>
                        {r.madeProgress === true ? <Check className="w-3 h-3" strokeWidth={3} />
                          : r.madeProgress === false ? <X className="w-3 h-3" strokeWidth={3} />
                          : <Minus className="w-3 h-3" strokeWidth={3} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#c9d1d9] leading-snug">{r.title}</p>
                        {r.note && <p className="text-[11px] text-[#8b949e] mt-0.5 leading-relaxed">{r.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </article>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

export default function JournalCalendarModal({ onClose }: { onClose: () => void }) {
  const today = getTodayInEST();
  const [entries, setEntries] = useState<Record<string, Entry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string>(today);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/personal-journal?_t=${Date.now()}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load journal');
        const map: Record<string, Entry> = {};
        for (const e of data.entries || []) {
          // Blank stubs don't count as journaled anywhere else either.
          if (!hasContent(e.prompts)) continue;
          map[e.date] = { date: e.date, prompts: e.prompts || [], goalReviews: e.goalReviews || [], updatedAt: e.updatedAt };
        }
        if (cancelled) return;
        setEntries(map);
        // Open on the most recent entry so there's something to read.
        const latest = Object.keys(map).sort().pop();
        if (latest) {
          setSelected(latest);
          setMonth(latest.slice(0, 7));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load journal');
          setEntries({});
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dates = useMemo(() => Object.keys(entries || {}).sort(), [entries]);
  const firstMonth = dates[0]?.slice(0, 7) ?? today.slice(0, 7);
  const thisMonth = today.slice(0, 7);
  const prevEntry = [...dates].reverse().find((d) => d < selected);
  const nextEntry = dates.find((d) => d > selected);

  const go = useCallback((date: string | undefined) => {
    if (!date) return;
    setSelected(date);
    setMonth(date.slice(0, 7));
  }, []);

  // Esc closes, ← / → step between entries; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(prevEntry);
      else if (e.key === 'ArrowRight') go(nextEntry);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, prevEntry, nextEntry]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const grid = monthGrid(month);
  const monthCount = dates.filter((d) => d.startsWith(month)).length;

  const content = (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-2 sm:p-4" onClick={onClose}>
      <style>{'@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Journal calendar"
        className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-4 h-4 text-[#F97316] flex-shrink-0" />
            <h2 className="text-sm font-semibold text-white">Journal</h2>
            {entries && (
              <span className="text-[10px] text-[#8b949e]">
                {dates.length} {dates.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {entries === null ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-[#8b949e]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs">Opening your journal…</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] md:grid-rows-[minmax(0,1fr)] md:h-[min(720px,calc(92vh-50px))]">
            {/* Calendar */}
            <aside className="p-4 border-b md:border-b-0 md:border-r border-[#30363d] bg-[#0d1117]/40 md:overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setMonth((m) => addMonths(m, -1))}
                  disabled={month <= firstMonth}
                  className="p-1.5 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <p className="font-serif text-lg text-white leading-tight">{fmt(`${month}-01`, { month: 'long' })}</p>
                  <p className="text-[10px] text-[#8b949e] tabular-nums">{fmt(`${month}-01`, { year: 'numeric' })}</p>
                </div>
                <button
                  onClick={() => setMonth((m) => addMonths(m, 1))}
                  disabled={month >= thisMonth}
                  className="p-1.5 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {DOW.map((d) => (
                  <span key={d} className="text-center text-[9px] uppercase tracking-wider text-[#6e7681] font-medium">{d.slice(0, 2)}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((date, i) => {
                  if (!date) return <span key={`b${i}`} />;
                  const entry = entries[date];
                  const isSel = date === selected;
                  const isToday = date === today;
                  const isFuture = date > today;
                  const mood = entry ? moodOf(entry.prompts) : '';
                  return (
                    <button
                      key={date}
                      onClick={() => setSelected(date)}
                      disabled={isFuture}
                      title={fmt(date, { weekday: 'long', month: 'short', day: 'numeric' }) + (entry ? '' : ' — no entry')}
                      className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all duration-150 disabled:cursor-default ${
                        isSel
                          ? 'bg-[#F97316]/25 ring-2 ring-[#F97316] shadow-[0_4px_14px_-4px_rgba(249,115,22,0.55)]'
                          : entry
                            ? 'bg-gradient-to-br from-[#F97316]/20 to-[#f59e0b]/5 ring-1 ring-[#F97316]/25 hover:ring-[#F97316]/60 hover:scale-105'
                            : isFuture
                              ? 'opacity-30'
                              : 'hover:bg-[#21262d]'
                      } ${isToday && !isSel ? 'ring-1 ring-white/40' : ''}`}
                    >
                      {entry && mood ? (
                        <>
                          <span className="text-lg leading-none">{mood}</span>
                          <span className="text-[9px] leading-none mt-0.5 text-[#c9d1d9] tabular-nums">{Number(date.slice(8))}</span>
                        </>
                      ) : (
                        <>
                          <span className={`text-xs tabular-nums ${entry ? 'text-white font-semibold' : 'text-[#6e7681]'}`}>{Number(date.slice(8))}</span>
                          {entry && <span className="w-1 h-1 rounded-full bg-[#F97316] mt-1" />}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-4 text-[11px] text-[#8b949e]">
                <span className="tabular-nums">
                  {monthCount === 0 ? 'No entries this month' : `${monthCount} ${monthCount === 1 ? 'entry' : 'entries'} this month`}
                </span>
                {month !== thisMonth && (
                  <button onClick={() => setMonth(thisMonth)} className="text-[#F97316] hover:underline">Today</button>
                )}
              </div>
              {error && <p className="text-xs text-[#f85149] mt-3">{error}</p>}
            </aside>

            {/* Reader */}
            <div className="flex flex-col min-h-0">
              <div className="flex-1 md:overflow-y-auto px-5 sm:px-8 py-6">
                <div className="max-w-2xl mx-auto">
                  <EntryPage entry={entries[selected]} date={selected} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-[#30363d] flex-shrink-0">
                <button
                  onClick={() => go(prevEntry)}
                  disabled={!prevEntry}
                  className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-white px-2 py-1 rounded-md hover:bg-[#21262d] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {prevEntry ? fmt(prevEntry, { month: 'short', day: 'numeric' }) : 'Older'}
                </button>
                <span className="hidden sm:inline text-[10px] text-[#484f58]">← → to flip entries</span>
                <button
                  onClick={() => go(nextEntry)}
                  disabled={!nextEntry}
                  className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-white px-2 py-1 rounded-md hover:bg-[#21262d] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {nextEntry ? fmt(nextEntry, { month: 'short', day: 'numeric' }) : 'Newer'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
