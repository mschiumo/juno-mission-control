'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Loader2, Flame, Timer, Route, Mountain, CalendarCheck, Activity, ExternalLink } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { getTodayInEST } from '@/lib/date-utils';
import {
  type ActivitySummary, activityDate, fmtDuration, fmtMiles, fmtPace, sportIcon, sportLabel,
} from '@/lib/strava-metrics';
import {
  type SportCategory, type ProgressMetric, type Totals, type Bucket,
  CATEGORY_ORDER, sportCategory, totalsOf, metricValue, inRange, addMonths,
  monthlyBuckets, weeklyBuckets, sportBreakdown, weekdayTotals, consistency, progressRecords,
} from '@/lib/strava-progress';

// Full-history Strava progress, opened from the Fitness card. Everything is
// computed client-side from one /api/strava/history payload (24 months).

const CATEGORY_META: Record<SportCategory, { label: string; color: string }> = {
  // Validated categorical set on #0d1117 (adjacent CVD ΔE ≥ 8.4, normal ≥ 19.8).
  run: { label: 'Run', color: '#e8590c' },
  ride: { label: 'Ride', color: '#3987e5' },
  walk: { label: 'Walk / Hike', color: '#199e70' },
  strength: { label: 'Strength', color: '#c98500' },
  other: { label: 'Other', color: '#9085e9' },
};

type RangeId = '3m' | '6m' | 'ytd' | '12m' | '24m';
const RANGES: { id: RangeId; label: string }[] = [
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'YTD' },
  { id: '12m', label: '12M' },
  { id: '24m', label: '2Y' },
];

const METRICS: { id: ProgressMetric; label: string }[] = [
  { id: 'distance', label: 'Distance' },
  { id: 'time', label: 'Time' },
  { id: 'count', label: 'Activities' },
  { id: 'calories', label: 'Calories' },
  { id: 'elevation', label: 'Elevation' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + n, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayCount(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00').getTime();
  const b = new Date(to + 'T12:00:00').getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/** [from, to] for the range plus the equal-length window right before it. */
function rangeWindow(range: RangeId, today: string): { from: string; to: string; prevFrom: string; prevTo: string } {
  // Calendar-month aligned (current month to date + the N-1 before it) so the
  // monthly chart never starts on a partial month.
  let from: string;
  if (range === 'ytd') from = `${today.slice(0, 4)}-01-01`;
  else {
    const months = range === '3m' ? 3 : range === '6m' ? 6 : range === '12m' ? 12 : 24;
    from = `${addMonths(today.slice(0, 7), -(months - 1))}-01`;
  }
  if (range === 'ytd') {
    const lastYear = String(Number(today.slice(0, 4)) - 1);
    return { from, to: today, prevFrom: `${lastYear}-01-01`, prevTo: `${lastYear}${today.slice(4)}` };
  }
  const len = dayCount(from, today);
  const prevTo = shiftDays(from, -1);
  return { from, to: today, prevFrom: shiftDays(prevTo, -(len - 1)), prevTo };
}

function fmtMetric(v: number, metric: ProgressMetric, compact = false): string {
  switch (metric) {
    case 'distance': return `${v.toFixed(v >= 100 ? 0 : 1)}${compact ? '' : ' mi'}`;
    case 'time': return compact ? `${v.toFixed(v >= 10 ? 0 : 1)}` : fmtDuration(v * 3600);
    case 'count': return `${Math.round(v)}`;
    case 'calories': return `${Math.round(v).toLocaleString()}${compact ? '' : ' cal'}`;
    case 'elevation': return `${Math.round(v).toLocaleString()}${compact ? '' : ' ft'}`;
  }
}

/** Y-axis ticks: whole numbers unless the scale is tiny. */
function axisTick(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function monthLabel(month: string, withYear = false): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' });
}

function shortDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Delta({ cur, prev, label }: { cur: number; prev: number | null; label: string }) {
  if (prev === null) return null;
  const pct = pctChange(cur, prev);
  if (pct === null) return <span className="text-[10px] text-[#8b949e]">no prior data</span>;
  return (
    <span className="text-[10px] text-[#8b949e] tabular-nums" title={`vs ${label}`}>
      <DeltaPct pct={pct} /> vs prior
    </span>
  );
}

function DeltaPct({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return <span className="text-[#8b949e]">— 0%</span>;
  const up = pct > 0;
  return <span className={up ? 'text-[#3fb950]' : 'text-[#f85149]'}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%</span>;
}

function StatTile({
  icon, label, value, sub, cur, prev, prevLabel,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  cur: number; prev: number | null; prevLabel: string;
}) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-white tabular-nums mt-1 truncate">{value}</p>
      <div className="flex items-center gap-2 mt-0.5 min-h-[14px]">
        <Delta cur={cur} prev={prev} label={prevLabel} />
        {sub && <span className="text-[10px] text-[#8b949e] truncate">{sub}</span>}
      </div>
    </div>
  );
}

function Pills<T extends string>({
  options, value, onChange,
}: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-[11px] font-semibold px-2 py-1 rounded-md transition-colors ${
            value === o.id ? 'bg-[#FC4C02]/25 text-[#FC4C02]' : 'text-[#8b949e] hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[11px] uppercase tracking-wider text-[#8b949e] font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Legend({ categories }: { categories: SportCategory[] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {categories.map((c) => (
        <span key={c} className="flex items-center gap-1.5 text-[10px] text-[#c9d1d9]">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY_META[c].color }} />
          {CATEGORY_META[c].label}
        </span>
      ))}
    </div>
  );
}

interface StackRow {
  label: string;
  title: string;
  total: number;
  [cat: string]: number | string;
}

function StackTooltip({
  active, payload, metric, categories,
}: {
  active?: boolean; payload?: Array<{ payload: StackRow }>; metric: ProgressMetric; categories: SportCategory[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 shadow-xl text-[11px] min-w-[150px]">
      <p className="font-semibold text-white mb-1">{row.title}</p>
      {categories.filter((c) => Number(row[c]) > 0).map((c) => (
        <div key={c} className="flex items-center justify-between gap-4 text-[#c9d1d9]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: CATEGORY_META[c].color }} />
            {CATEGORY_META[c].label}
          </span>
          <span className="tabular-nums">{fmtMetric(Number(row[c]), metric)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-[#30363d] text-white font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{fmtMetric(row.total, metric)}</span>
      </div>
    </div>
  );
}

function stackRows(buckets: Bucket[], metric: ProgressMetric, categories: SportCategory[], label: (b: Bucket) => string, title: (b: Bucket) => string): StackRow[] {
  return buckets.map((b) => {
    const row: StackRow = { label: label(b), title: title(b), total: 0 };
    for (const c of categories) {
      const v = metricValue(b.byCategory[c], metric);
      row[c] = v;
      row.total += v;
    }
    return row;
  });
}

const AXIS_TICK = { fill: '#8b949e', fontSize: 10 };

function StackedChart({
  rows, metric, categories, height = 220,
}: { rows: StackRow[]; metric: ProgressMetric; categories: SportCategory[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44}
          tickFormatter={axisTick} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<StackTooltip metric={metric} categories={categories} />} />
        {categories.map((c, i) => (
          <Bar
            key={c}
            dataKey={c}
            stackId="s"
            fill={CATEGORY_META[c].color}
            stroke="#0d1117"
            strokeWidth={1}
            radius={i === categories.length - 1 ? [3, 3, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface WeekRow { label: string; title: string; value: number; avg: number | null }

function WeekTooltip({ active, payload, metric }: { active?: boolean; payload?: Array<{ payload: WeekRow }>; metric: ProgressMetric }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 shadow-xl text-[11px]">
      <p className="font-semibold text-white mb-1">{row.title}</p>
      <div className="flex justify-between gap-4 text-[#c9d1d9]"><span>This week</span><span className="tabular-nums">{fmtMetric(row.value, metric)}</span></div>
      {row.avg !== null && (
        <div className="flex justify-between gap-4 text-[#c9d1d9]"><span>4-wk avg</span><span className="tabular-nums">{fmtMetric(row.avg, metric)}</span></div>
      )}
    </div>
  );
}

export default function StravaProgressModal({ onClose }: { onClose: () => void }) {
  const [activities, setActivities] = useState<ActivitySummary[] | null>(null);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [caloriesPending, setCaloriesPending] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [range, setRange] = useState<RangeId>('6m');
  const [sport, setSport] = useState<'all' | SportCategory>('all');
  const [metric, setMetric] = useState<ProgressMetric>('distance');

  const load = useCallback(async (refresh = false) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/strava/history${refresh ? '?refresh=1' : ''}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load history');
      setConnected(data.connected);
      setActivities(data.activities || []);
      setCaloriesPending(data.caloriesPending || 0);
      setFetchedAt(data.fetchedAt || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
      setActivities((prev) => prev ?? []);
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

  const today = getTodayInEST();
  const win = useMemo(() => rangeWindow(range, today), [range, today]);

  const view = useMemo(() => {
    if (!activities) return null;
    // Oldest date the history payload covers (1st of the month, 24 months back).
    const dataStart = `${addMonths(today.slice(0, 7), -24)}-01`;
    const bySport = sport === 'all' ? activities : activities.filter((a) => sportCategory(a.sport_type) === sport);
    const current = inRange(bySport, win.from, win.to);
    const prevAvailable = win.prevFrom >= dataStart;
    const previous = prevAvailable ? inRange(bySport, win.prevFrom, win.prevTo) : null;

    const presentCats = CATEGORY_ORDER.filter((c) => activities.some((a) => sportCategory(a.sport_type) === c));
    const chartCats = sport === 'all' ? CATEGORY_ORDER.filter((c) => current.some((a) => sportCategory(a.sport_type) === c)) : [sport];

    const months = monthlyBuckets(current, win.from.slice(0, 7), win.to.slice(0, 7));
    const weeks = weeklyBuckets(current, win.from, win.to);
    const weekValues = weeks.map((w) => metricValue(w.totals, metric));
    const weekRows: WeekRow[] = weeks.map((w, i) => ({
      label: shortDate(w.key),
      title: `Week of ${shortDate(w.key)}`,
      value: weekValues[i],
      avg: i >= 3 ? (weekValues[i] + weekValues[i - 1] + weekValues[i - 2] + weekValues[i - 3]) / 4 : null,
    }));

    return {
      current,
      totals: totalsOf(current),
      prevTotals: previous ? totalsOf(previous) : null,
      prevConsistency: previous ? consistency(previous, win.prevFrom, win.prevTo) : null,
      consistency: consistency(current, win.from, win.to),
      presentCats,
      chartCats,
      months,
      monthRows: stackRows(months, metric, chartCats, (b) => monthLabel(b.key, months.length > 12 || b.key.endsWith('-01')), (b) => monthLabel(b.key, true)),
      weekRows,
      sports: sportBreakdown(current),
      weekdays: weekdayTotals(current),
      records: progressRecords(current),
    };
  }, [activities, sport, win, metric, today]);

  const prevLabel = range === 'ytd' ? 'same period last year' : 'previous period';
  const t = view?.totals;
  const p = view?.prevTotals ?? null;

  const content = (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-2 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fitness progress"
        className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="#FC4C02" aria-hidden>
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            <h2 className="text-sm font-semibold text-white">Fitness Progress</h2>
            {fetchedAt && (
              <span className="hidden sm:inline text-[10px] text-[#484f58]">
                synced {new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-50"
              title="Re-pull from Strava"
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

        {/* Filters — one row above everything they affect */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#30363d] flex-shrink-0">
          <Pills options={RANGES} value={range} onChange={setRange} />
          <Pills
            options={[{ id: 'all' as const, label: 'All' }, ...(view?.presentCats ?? []).map((c) => ({ id: c, label: CATEGORY_META[c].label }))]}
            value={sport}
            onChange={setSport}
          />
          <div className="sm:ml-auto">
            <Pills options={METRICS} value={metric} onChange={setMetric} />
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-3">
          {activities === null ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-[#8b949e]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs">Pulling your Strava history…</p>
            </div>
          ) : !connected ? (
            <p className="text-sm text-[#8b949e] text-center py-16">Strava isn&apos;t connected. Connect it from the Fitness card.</p>
          ) : error && activities.length === 0 ? (
            <p className="text-sm text-[#f85149] text-center py-16">{error}</p>
          ) : view && t ? (
            <>
              {error && <p className="text-xs text-[#f85149]">{error}</p>}

              {/* Headline stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                <StatTile icon={<Route className="w-3 h-3" />} label="Distance" value={fmtMiles(t.meters)}
                  cur={t.meters} prev={p ? p.meters : null} prevLabel={prevLabel} />
                <StatTile icon={<Timer className="w-3 h-3" />} label="Moving time" value={fmtDuration(t.seconds)}
                  cur={t.seconds} prev={p ? p.seconds : null} prevLabel={prevLabel} />
                <StatTile icon={<Activity className="w-3 h-3" />} label="Activities" value={String(t.count)}
                  cur={t.count} prev={p ? p.count : null} prevLabel={prevLabel} />
                <StatTile icon={<CalendarCheck className="w-3 h-3" />} label="Active days" value={String(view.consistency.activeDays)}
                  sub={`of ${dayCount(win.from, win.to)}`}
                  cur={view.consistency.activeDays} prev={view.prevConsistency ? view.prevConsistency.activeDays : null} prevLabel={prevLabel} />
                <StatTile icon={<Flame className="w-3 h-3" />} label="Calories" value={Math.round(t.calories).toLocaleString()}
                  cur={t.calories} prev={p ? p.calories : null} prevLabel={prevLabel} />
                <StatTile icon={<Mountain className="w-3 h-3" />} label="Elevation" value={`${Math.round(t.elevation * 3.28084).toLocaleString()} ft`}
                  cur={t.elevation} prev={p ? p.elevation : null} prevLabel={prevLabel} />
              </div>
              {caloriesPending > 0 && (
                <p className="text-[10px] text-[#8b949e]">
                  Calories still backfilling for {caloriesPending} older {caloriesPending === 1 ? 'activity' : 'activities'} — totals fill in over the next few opens.
                </p>
              )}

              {view.current.length === 0 ? (
                <p className="text-sm text-[#8b949e] text-center py-12">No activities in this range.</p>
              ) : (
                <>
                  {/* By month */}
                  <Section title={`${METRICS.find((m) => m.id === metric)?.label} by month`} right={view.chartCats.length > 1 ? <Legend categories={view.chartCats} /> : null}>
                    <StackedChart rows={view.monthRows} metric={metric} categories={view.chartCats} />
                  </Section>

                  {/* By week */}
                  <Section
                    title="Weekly trend"
                    right={
                      <div className="flex items-center gap-3 text-[10px] text-[#c9d1d9]">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#FC4C02]/70" />Week</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-white" />4-wk avg</span>
                      </div>
                    }
                  >
                    <ResponsiveContainer width="100%" height={180}>
                      <ComposedChart data={view.weekRows} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barCategoryGap="12%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={axisTick} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<WeekTooltip metric={metric} />} />
                        <Bar dataKey="value" fill="#FC4C02" fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        <Line dataKey="avg" stroke="#ffffff" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Section>

                  {/* By exercise type */}
                  <Section title="By exercise type">
                    <SportTable rows={view.sports} metric={metric} />
                  </Section>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Weekday pattern + consistency */}
                    <Section title="Consistency">
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <MiniStat label="Current streak" value={`${view.consistency.currentStreak}d`} />
                        <MiniStat label="Longest streak" value={`${view.consistency.longestStreak}d`} />
                        <MiniStat label="Active weeks" value={`${view.consistency.activeWeeks}/${view.consistency.totalWeeks}`} />
                      </div>
                      <WeekdayChart totals={view.weekdays} metric={metric} />
                    </Section>

                    {/* Records */}
                    <Section title="Bests in range">
                      <RecordsList records={view.records} />
                    </Section>
                  </div>

                  {/* Monthly table */}
                  <Section title="Month by month">
                    <MonthTable months={view.months} currentMonth={today.slice(0, 7)} />
                  </Section>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-md px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-[#8b949e]">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

function WeekdayChart({ totals, metric }: { totals: Totals[]; metric: ProgressMetric }) {
  const rows = totals.map((tt, i) => ({ label: WEEKDAYS[i], value: metricValue(tt, metric), count: tt.count }));
  return (
    <>
      <p className="text-[10px] text-[#8b949e] mb-1">{METRICS.find((m) => m.id === metric)?.label} by weekday</p>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={axisTick} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 shadow-xl text-[11px] text-[#c9d1d9]">
                  <p className="font-semibold text-white">{r.label}</p>
                  <p className="tabular-nums">{fmtMetric(r.value, metric)} · {r.count} {r.count === 1 ? 'activity' : 'activities'}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" fill="#FC4C02" fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function SportTable({ rows, metric }: { rows: ReturnType<typeof sportBreakdown>; metric: ProgressMetric }) {
  const max = Math.max(...rows.map((r) => metricValue(r.totals, metric)), 0);
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[#8b949e] text-left">
            <th className="font-medium px-1 pb-2">Type</th>
            <th className="font-medium px-1 pb-2 text-right">Count</th>
            <th className="font-medium px-1 pb-2 text-right">Distance</th>
            <th className="font-medium px-1 pb-2 text-right">Time</th>
            <th className="font-medium px-1 pb-2 text-right">Avg pace / speed</th>
            <th className="font-medium px-1 pb-2 text-right">Avg HR</th>
            <th className="font-medium px-1 pb-2 text-right">Calories</th>
            <th className="font-medium px-1 pb-2 w-[22%]">Share · {METRICS.find((m) => m.id === metric)?.label.toLowerCase()}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#21262d]">
          {rows.map((r) => {
            const v = metricValue(r.totals, metric);
            return (
              <tr key={r.sport} className="text-[#c9d1d9]">
                <td className="px-1 py-1.5">
                  <span className="flex items-center gap-1.5 text-white font-medium whitespace-nowrap">
                    <span>{sportIcon(r.sport)}</span>
                    {sportLabel(r.sport)}
                  </span>
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{r.totals.count}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{r.totals.meters > 0 ? fmtMiles(r.totals.meters) : '—'}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtDuration(r.totals.seconds)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {r.avgPaceSecPerMile !== null ? fmtPace(r.avgPaceSecPerMile) : r.avgMph !== null ? `${r.avgMph.toFixed(1)} mph` : '—'}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{r.avgHeartrate ? `${Math.round(r.avgHeartrate)} bpm` : '—'}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{r.totals.calories > 0 ? Math.round(r.totals.calories).toLocaleString() : '—'}</td>
                <td className="px-1 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[#21262d] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${max > 0 ? (v / max) * 100 : 0}%`, background: CATEGORY_META[r.category].color }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-[#8b949e] w-14 text-right">{fmtMetric(v, metric, metric !== 'time')}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MonthTable({ months, currentMonth }: { months: Bucket[]; currentMonth: string }) {
  const rows = [...months].reverse();
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[#8b949e] text-left">
            <th className="font-medium px-1 pb-2">Month</th>
            <th className="font-medium px-1 pb-2 text-right">Activities</th>
            <th className="font-medium px-1 pb-2 text-right">Distance</th>
            <th className="font-medium px-1 pb-2 text-right">vs prior</th>
            <th className="font-medium px-1 pb-2 text-right">Time</th>
            <th className="font-medium px-1 pb-2 text-right">Run pace</th>
            <th className="font-medium px-1 pb-2 text-right">Calories</th>
            <th className="font-medium px-1 pb-2 text-right">Elevation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#21262d]">
          {rows.map((m, i) => {
            const prior = rows[i + 1];
            const isCurrent = m.key === currentMonth;
            // A month in progress vs a full month is apples to oranges — skip it.
            const delta = prior && !isCurrent ? pctChange(m.totals.meters, prior.totals.meters) : null;
            const run = m.byCategory.run;
            const runMiles = run.meters / 1609.344;
            return (
              <tr key={m.key} className="text-[#c9d1d9]">
                <td className="px-1 py-1.5 text-white font-medium whitespace-nowrap">
                  {monthLabel(m.key, true)}
                  {isCurrent && <span className="ml-1.5 text-[9px] font-semibold text-[#FC4C02]">MTD</span>}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{m.totals.count}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtMiles(m.totals.meters)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {delta === null ? <span className="text-[#484f58]">—</span> : (
                    <DeltaPct pct={delta} />
                  )}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtDuration(m.totals.seconds)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{runMiles >= 0.25 ? fmtPace(run.seconds / runMiles) : '—'}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{m.totals.calories > 0 ? Math.round(m.totals.calories).toLocaleString() : '—'}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{m.totals.elevation > 0 ? `${Math.round(m.totals.elevation * 3.28084).toLocaleString()} ft` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function fmtRecord(id: string, value: number): string {
  switch (id) {
    case 'fastestPace': return fmtPace(value);
    case 'fastestRide': return `${value.toFixed(1)} mph`;
    case 'longestRun':
    case 'longestRide': return fmtMiles(value);
    case 'longestSession': return fmtDuration(value);
    case 'mostElevation': return `${Math.round(value * 3.28084).toLocaleString()} ft`;
    case 'mostCalories': return `${Math.round(value).toLocaleString()} cal`;
    default: return String(value);
  }
}

function RecordsList({ records }: { records: ReturnType<typeof progressRecords> }) {
  if (records.length === 0) return <p className="text-xs text-[#8b949e]">No records in this range yet.</p>;
  return (
    <ul className="divide-y divide-[#21262d]">
      {records.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-[#8b949e]">{r.label}</p>
            <a
              href={`https://www.strava.com/activities/${r.activity.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-[#c9d1d9] hover:text-[#FC4C02] transition-colors truncate"
            >
              <span className="truncate">{sportIcon(r.activity.sport_type)} {r.activity.name}</span>
              <span className="text-[#484f58] flex-shrink-0">· {shortDate(activityDate(r.activity))}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
            </a>
          </div>
          <span className="text-sm font-bold text-white tabular-nums flex-shrink-0">{fmtRecord(r.id, r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
