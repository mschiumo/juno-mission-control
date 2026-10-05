'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Loader2, Target, CalendarCheck, Flame, SkipForward, TrendingUp, Trophy, BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { getTodayInEST } from '@/lib/date-utils';
import { frequencyLabel, shiftDate, weekStartFor } from '@/lib/habit-frequency';
import {
  type HabitDef, type HistoryDays, type RangeId, type RangeSummary, type HeatDay, type HabitScore,
  buildTimeline, rangeWindow, summarize, heatmap, insights, dateSpan,
} from '@/lib/habit-progress';

// Long-range habit progress, opened from the Habits card. Everything is
// computed client-side (lib/habit-progress.ts) from one /api/habits/history
// payload. Ranges end yesterday — today is still in progress.

const RANGES: { id: RangeId; label: string }[] = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'YTD' },
];

const ACCENT = '#F97316';
const DONE = '#22c55e';
const SKIP = '#da3633';
const AXIS_TICK = { fill: '#8b949e', fontSize: 10 };

function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  // Date-only strings: format in UTC so viewers east of ET don't shift a day.
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

function DeltaPts({ cur, prev }: { cur: number | null; prev: number | null | undefined }) {
  if (cur === null || prev === null || prev === undefined) return <span className="text-[10px] text-[#484f58]">—</span>;
  const d = cur - prev;
  if (d === 0) return <span className="text-[10px] text-[#8b949e] tabular-nums">± 0 pts</span>;
  return (
    <span className={`text-[10px] tabular-nums ${d > 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)} pts
    </span>
  );
}

function StatTile({ icon, label, value, sub, delta }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; delta?: React.ReactNode;
}) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-white tabular-nums mt-1 truncate">{value}</p>
      <div className="flex items-center gap-2 mt-0.5 min-h-[14px] min-w-0">
        {delta}
        {sub && <span className="text-[10px] text-[#8b949e] truncate">{sub}</span>}
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 sm:p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-[11px] uppercase tracking-wider text-[#8b949e] font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function pctColor(pct: number | null): string {
  if (pct === null) return '#8b949e';
  if (pct >= 80) return DONE;
  if (pct >= 60) return '#d29922';
  return '#f85149';
}

// ── Heatmap ───────────────────────────────────────────────────────────────

function heatFill(d: HeatDay | undefined): { bg: string; opacity: number } {
  if (!d || !d.covered) return { bg: 'transparent', opacity: 1 };
  if (d.noData) return { bg: SKIP, opacity: 0.3 };
  if (d.allSkipped) return { bg: SKIP, opacity: 0.65 };
  if (d.ratio === null) return { bg: '#21262d', opacity: 1 };
  if (d.ratio === 0) return { bg: '#30363d', opacity: 1 };
  if (d.ratio < 0.5) return { bg: DONE, opacity: 0.25 };
  if (d.ratio < 1) return { bg: DONE, opacity: 0.55 };
  return { bg: DONE, opacity: 1 };
}

function heatTitle(d: HeatDay): string {
  const date = fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!d.covered) return `${date} · before your history`;
  if (d.noData) return `${date} · app not opened — counted as skipped`;
  if (d.allSkipped) return `${date} · everything skipped`;
  if (d.ratio === null) return `${date} · nothing due`;
  return `${date} · ${d.done}/${d.due} done`;
}

function Heatmap({ days, from, to }: { days: HeatDay[]; from: string; to: string }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks: string[] = [];
  for (let w = weekStartFor(from); w <= to; w = shiftDate(w, 7)) weeks.push(w);

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="inline-flex gap-[3px]">
        <div className="flex flex-col gap-[3px] pr-1 pt-[14px]">
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((l, i) => (
            <span key={i} className="h-3 text-[9px] leading-3 text-[#8b949e]">{l}</span>
          ))}
        </div>
        {weeks.map((w) => {
          const dates = dateSpan(w, shiftDate(w, 6));
          const monthStart = dates.find((d) => d.endsWith('-01') && d >= from && d <= to);
          const isFirst = w === weeks[0];
          return (
            <div key={w} className="flex flex-col gap-[3px]">
              <span className="h-[11px] text-[9px] leading-[11px] text-[#8b949e] whitespace-nowrap">
                {monthStart ? fmtDate(monthStart, { month: 'short' }) : isFirst ? fmtDate(from < w ? w : from, { month: 'short' }) : ''}
              </span>
              {dates.map((date) => {
                const inRange = date >= from && date <= to;
                const d = inRange ? byDate.get(date) : undefined;
                const { bg, opacity } = heatFill(d);
                return (
                  <div
                    key={date}
                    className={`w-3 h-3 rounded-[3px] ${!d || !d.covered ? 'border border-[#21262d]/60' : ''}`}
                    style={{ backgroundColor: bg, opacity: inRange ? opacity : 0 }}
                    title={d ? heatTitle(d) : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 flex-wrap mt-2 text-[10px] text-[#8b949e]">
        <span className="flex items-center gap-1">
          Less
          {[0, 0.25, 0.55, 1].map((o, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: i === 0 ? '#30363d' : DONE, opacity: i === 0 ? 1 : o }} />
          ))}
          More
        </span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: SKIP, opacity: 0.65 }} />All skipped</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: SKIP, opacity: 0.3 }} />App not opened</span>
      </div>
    </div>
  );
}

// ── Weekly trend ──────────────────────────────────────────────────────────

interface TrendRow { label: string; title: string; pct: number | null; avg: number | null }

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-[11px] shadow-xl">
      <p className="text-[#8b949e]">{r.title}</p>
      <p className="text-white font-semibold tabular-nums">{r.pct === null ? 'Nothing due' : `${r.pct}% complete`}</p>
      {r.avg !== null && <p className="text-[#8b949e] tabular-nums">4-wk avg {Math.round(r.avg)}%</p>}
    </div>
  );
}

function trendRows(s: RangeSummary): TrendRow[] {
  return s.weekly.map((w, i) => {
    const window = s.weekly.slice(Math.max(0, i - 3), i + 1).map((x) => x.pct).filter((p): p is number => p !== null);
    return {
      label: fmtDate(w.week < s.from ? s.from : w.week),
      title: `Week of ${fmtDate(w.week)}`,
      pct: w.pct,
      avg: i >= 3 && window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : null,
    };
  });
}

// ── Per-habit table ───────────────────────────────────────────────────────

function Sparkline({ values }: { values: (number | null)[] }) {
  const w = 4, gap = 2, h = 20;
  const vs = values.slice(-26);
  return (
    <svg width={vs.length * (w + gap)} height={h} className="block" aria-hidden>
      {vs.map((v, i) => {
        const bh = v === null ? 2 : Math.max(2, (v / 100) * h);
        return <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1} fill={v === null ? '#30363d' : pctColor(v)} opacity={v === null ? 1 : 0.85} />;
      })}
    </svg>
  );
}

function streakText(s: HabitScore, n: number): string {
  const unit = s.streakUnit === 'day' ? 'd' : s.streakUnit === 'week' ? 'w' : 'mo';
  return `${n}${unit}`;
}

function HabitTable({ scores, prev }: { scores: HabitScore[]; prev: Map<string, number | null> | null }) {
  const rows = [...scores].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[#8b949e] text-left">
            <th className="font-medium py-1.5 px-1">Habit</th>
            <th className="font-medium py-1.5 px-1 w-[38%]">Completion</th>
            <th className="font-medium py-1.5 px-1 hidden sm:table-cell">vs prior</th>
            <th className="font-medium py-1.5 px-1 text-right" title="Current / best in range">Streak</th>
            <th className="font-medium py-1.5 px-1 text-right hidden sm:table-cell">Skips</th>
            <th className="font-medium py-1.5 px-1 hidden md:table-cell">Weekly</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.habit.id} className="border-t border-[#21262d]">
              <td className="py-2 px-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="flex-shrink-0">{s.habit.icon}</span>
                  <span className="text-white truncate max-w-[9rem] sm:max-w-[14rem]">{s.habit.name}</span>
                  <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded-full bg-[#30363d] text-[#8b949e] flex-shrink-0">
                    {frequencyLabel(s.habit.frequency)}
                  </span>
                </div>
              </td>
              <td className="py-2 px-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden min-w-[40px]">
                    <div className="h-full rounded-full" style={{ width: `${s.pct ?? 0}%`, backgroundColor: pctColor(s.pct) }} />
                  </div>
                  <span className="tabular-nums font-semibold w-9 text-right" style={{ color: pctColor(s.pct) }}>
                    {s.pct === null ? '—' : `${s.pct}%`}
                  </span>
                </div>
                <p className="text-[10px] text-[#8b949e] mt-0.5 tabular-nums">
                  {s.daily ? `${s.done}/${s.due} days` : `${s.periodsHit}/${s.periodsTotal} ${s.streakUnit}s on goal`}
                </p>
              </td>
              <td className="py-2 px-1 hidden sm:table-cell"><DeltaPts cur={s.pct} prev={prev ? prev.get(s.habit.id) : null} /></td>
              <td className="py-2 px-1 text-right tabular-nums whitespace-nowrap">
                <span className={s.currentStreak > 0 ? 'text-[#F97316]' : 'text-[#8b949e]'}>{streakText(s, s.currentStreak)}</span>
                <span className="text-[#484f58]"> / </span>
                <span className="text-[#c9d1d9]">{streakText(s, s.longestStreak)}</span>
              </td>
              <td className="py-2 px-1 text-right tabular-nums hidden sm:table-cell" title={s.noDataSkips ? `${s.noDataSkips} from days the app wasn't opened` : undefined}>
                <span className={s.skips > 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}>{s.skips}</span>
              </td>
              <td className="py-2 px-1 hidden md:table-cell"><Sparkline values={s.weekly} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Weekday bars ──────────────────────────────────────────────────────────

function WeekdayBars({ days }: { days: RangeSummary['weekdays'] }) {
  return (
    <div className="grid grid-cols-7 gap-1.5 items-end h-28">
      {days.map((d) => (
        <div key={d.label} className="flex flex-col items-center gap-1 h-full justify-end" title={d.pct === null ? `${d.label}: nothing due` : `${d.label}: ${d.pct}%`}>
          <span className="text-[10px] tabular-nums" style={{ color: pctColor(d.pct) }}>{d.pct === null ? '—' : `${d.pct}%`}</span>
          <div className="w-full max-w-[28px] bg-[#21262d] rounded-sm flex-1 flex items-end overflow-hidden">
            <div className="w-full rounded-sm" style={{ height: `${d.pct ?? 0}%`, backgroundColor: pctColor(d.pct), opacity: 0.8 }} />
          </div>
          <span className="text-[10px] text-[#8b949e]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

export default function HabitProgressModal({ habits, onClose }: { habits: HabitDef[]; onClose: () => void }) {
  const [days, setDays] = useState<HistoryDays | null>(null);
  const [today, setToday] = useState(getTodayInEST);
  const [range, setRange] = useState<RangeId>('3m');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/habits/history');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load history');
      setDays(data.days || {});
      if (data.today) setToday(data.today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
      setDays((prev) => prev ?? {});
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Esc closes; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const timeline = useMemo(() => {
    if (!days) return null;
    return buildTimeline(days, habits, shiftDate(today, -400), today);
  }, [days, habits, today]);

  const view = useMemo(() => {
    if (!timeline || !timeline.firstDate) return null;
    const win = rangeWindow(range, today);
    // Clip to where history starts so the range doesn't read as empty months.
    const from = win.from < timeline.firstDate ? timeline.firstDate : win.from;
    if (from > win.to) return null;
    const cur = summarize(timeline, from, win.to, today);
    const prevRaw = summarize(timeline, win.prevFrom, win.prevTo, today);
    // Only compare against a prior window that's mostly covered by history.
    const prevLen = dateSpan(win.prevFrom, win.prevTo).length;
    const prev = prevRaw.coveredDays >= prevLen / 2 && prevRaw.due > 0 ? prevRaw : null;
    const best = [...cur.scores].filter((s) => s.daily).sort((a, b) => b.longestStreak - a.longestStreak)[0];
    return {
      from, to: win.to, clipped: from !== win.from,
      cur, prev,
      prevPct: prev ? new Map(prev.scores.map((s) => [s.habit.id, s.pct])) : null,
      heat: heatmap(timeline, from, win.to),
      trend: trendRows(cur),
      insights: insights(cur, prev),
      best,
    };
  }, [timeline, range, today]);

  const content = (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-2 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Habit progress"
        className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-4 h-4 flex-shrink-0 text-[#F97316]" />
            <h2 className="text-sm font-semibold text-white">Habit Progress</h2>
            {view && (
              <span className="hidden sm:inline text-[10px] text-[#8b949e] truncate">
                {fmtDate(view.from)} – {fmtDate(view.to, { month: 'short', day: 'numeric', year: 'numeric' })}
                {view.clipped && ' · since your history starts'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={load}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-50"
              title="Reload"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Range */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#30363d] flex-shrink-0">
          <div className="flex items-center gap-0.5 bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                  range === r.id ? 'bg-[#F97316]/25 text-[#F97316]' : 'text-[#8b949e] hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-[#8b949e]">Through yesterday — today is still in progress.</span>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-3">
          {days === null ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-[#8b949e]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs">Loading your habit history…</p>
            </div>
          ) : error && !view ? (
            <p className="text-sm text-[#f85149] text-center py-16">{error}</p>
          ) : !view ? (
            <p className="text-sm text-[#8b949e] text-center py-16">
              Not enough history yet — progress shows up once you&apos;ve tracked a full day.
            </p>
          ) : (
            <>
              {error && <p className="text-xs text-[#f85149]">{error}</p>}

              {/* Headline stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <StatTile
                  icon={<Target className="w-3 h-3" />}
                  label="Completion"
                  value={view.cur.pct === null ? '—' : `${view.cur.pct}%`}
                  delta={<DeltaPts cur={view.cur.pct} prev={view.prev?.pct} />}
                  sub={view.prev ? 'vs prior' : 'no prior data'}
                />
                <StatTile
                  icon={<CalendarCheck className="w-3 h-3" />}
                  label="Perfect days"
                  value={String(view.cur.perfectDays)}
                  sub={`of ${view.cur.scoredDays} days`}
                />
                <StatTile
                  icon={<Flame className="w-3 h-3" />}
                  label="Longest streak"
                  value={view.best ? `${view.best.longestStreak}d` : '—'}
                  sub={view.best && view.best.longestStreak > 0 ? `${view.best.habit.icon} ${view.best.habit.name}` : undefined}
                />
                <StatTile
                  icon={<SkipForward className="w-3 h-3" />}
                  label="Skips"
                  value={String(view.cur.skips)}
                  sub={view.cur.noDataSkips > 0 ? `${view.cur.noDataSkips} from app not opened` : `${view.cur.forgot} unchecked misses`}
                />
              </div>

              {/* Callouts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Section title="Places to improve">
                  <ul className="space-y-2">
                    {view.insights.improve.map((i, idx) => (
                      <li key={idx} className="flex gap-2 text-xs text-[#c9d1d9] leading-snug">
                        <TrendingUp className="w-3.5 h-3.5 text-[#d29922] flex-shrink-0 mt-0.5" />
                        <span>{i.text}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Wins">
                  {view.insights.wins.length === 0 ? (
                    <p className="text-xs text-[#8b949e]">Wins show up as habits pass 80% or streaks build.</p>
                  ) : (
                    <ul className="space-y-2">
                      {view.insights.wins.map((i, idx) => (
                        <li key={idx} className="flex gap-2 text-xs text-[#c9d1d9] leading-snug">
                          <Trophy className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0 mt-0.5" />
                          <span>{i.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              {/* Weekly trend */}
              <Section
                title="Weekly completion"
                right={
                  <div className="flex items-center gap-3 text-[10px] text-[#c9d1d9]">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ACCENT, opacity: 0.7 }} />Week</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-white" />4-wk avg</span>
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={view.trend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="14%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TrendTooltip />} />
                    <Bar dataKey="pct" fill={ACCENT} fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Line dataKey="avg" stroke="#ffffff" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Section>

              {/* Calendar */}
              <Section title="Daily calendar">
                <Heatmap days={view.heat} from={view.from} to={view.to} />
              </Section>

              {/* Per habit */}
              <Section title="By habit" right={<span className="text-[10px] text-[#8b949e]">Weakest first · streak = current / best</span>}>
                <HabitTable scores={view.cur.scores} prev={view.prevPct} />
              </Section>

              {/* Weekday pattern */}
              <Section title="By day of week" right={<span className="text-[10px] text-[#8b949e]">Daily habits</span>}>
                <WeekdayBars days={view.cur.weekdays} />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
