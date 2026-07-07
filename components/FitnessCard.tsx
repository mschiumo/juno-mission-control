'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dumbbell, RefreshCw, Link2, Unlink, Loader2, Check,
  CheckCircle2, AlertTriangle, Zap, Trophy,
} from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import {
  type ActivitySummary, RUN_SPORTS, WALK_SPORTS,
  fmtMiles, fmtDuration, fmtPace, paceSecPerMile, speedMph, metersToMiles,
  distanceTotals, runRecords, weekDailyDistance, monthDailyDistance, activityDate,
} from '@/lib/strava-metrics';

type StravaActivity = ActivitySummary;

interface CompletedHabit {
  id: string;
  name: string;
  icon: string;
}

interface WorkoutSchedule {
  groups: string[];
  nextIndex: number;
  nextGroup: string;
  completedToday: boolean;
  todayGroup: string | null;
}

const SPORT_ICONS: Record<string, string> = {
  Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃',
  Ride: '🚴', MountainBikeRide: '🚵', VirtualRide: '🚴', GravelRide: '🚴',
  WeightTraining: '🏋️', Workout: '💪', Crossfit: '💪', HighIntensityIntervalTraining: '💪',
  Swim: '🏊', Walk: '🚶', Hike: '🥾', Yoga: '🧘', Golf: '⛳', Tennis: '🎾',
};

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function sportIcon(sport: string): string {
  return SPORT_ICONS[sport] || '⚡';
}

function fmtDay(dateLocal: string): string {
  return new Date(dateLocal.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

const DOT = <span className="text-[#30363d]"> · </span>;

// Inline stat line for one activity: runs get pace (emphasized), rides get
// mph, everything else just duration.
function ActivityStatLine({ a }: { a: StravaActivity }) {
  const pace = RUN_SPORTS.has(a.sport_type) ? paceSecPerMile(a) : null;
  const mph = pace === null && a.sport_type.includes('Ride') ? speedMph(a) : null;
  return (
    <p className="text-[10px] text-[#8b949e] tabular-nums pl-6">
      {a.distance > 0 && <>{fmtMiles(a.distance)}{DOT}</>}
      {pace !== null && <><span className="text-[#FC4C02] font-semibold cursor-help" title="Avg. Pace">{fmtPace(pace)}</span>{DOT}</>}
      {mph !== null && <><span className="cursor-help" title="Avg. Speed">{mph.toFixed(1)} mph</span>{DOT}</>}
      {fmtDuration(a.moving_time)}
    </p>
  );
}

// Strava-style achievement badges: PRs (best efforts) take precedence, other
// achievements (segments etc.) get a medal count.
function AchievementBadge({ a }: { a: StravaActivity }) {
  const prs = a.pr_count ?? 0;
  const achievements = a.achievement_count ?? 0;
  if (prs > 0) {
    return (
      <span
        className="flex-shrink-0 text-[9px] font-bold px-1.5 py-px rounded-full bg-gradient-to-r from-[#FC4C02] to-[#f59e0b] text-white"
        title={`${prs} personal record${prs > 1 ? 's' : ''} (best effort) on this activity`}
      >
        PR{prs > 1 ? ` ×${prs}` : ''}
      </span>
    );
  }
  if (achievements > 0) {
    return (
      <span
        className="flex-shrink-0 text-[9px] font-semibold px-1 py-px rounded-full bg-[#d29922]/15 text-[#d29922]"
        title={`${achievements} achievement${achievements > 1 ? 's' : ''} on this activity`}
      >
        🏅{achievements > 1 ? ` ${achievements}` : ''}
      </span>
    );
  }
  return null;
}

const PERIODS = [
  { id: 'day' as const, label: 'Day' },
  { id: 'week' as const, label: 'Week' },
  { id: 'month' as const, label: 'Month' },
];

const ACTIVITY_TYPES = [
  { id: 'all' as const, label: 'All' },
  { id: 'run' as const, label: 'Run' },
  { id: 'walk' as const, label: 'Walk' },
];

// Native-tooltip text for a single activity bar in the Day view.
function activityBarTooltip(a: ActivitySummary): string {
  const parts = [fmtMiles(a.distance)];
  const pace = a.distance > 0 ? paceSecPerMile(a) : null;
  if (pace !== null && !a.sport_type.includes('Ride')) parts.push(`${fmtPace(pace)} avg`);
  const mph = a.sport_type.includes('Ride') ? speedMph(a) : null;
  if (mph !== null) parts.push(`${mph.toFixed(1)} mph avg`);
  parts.push(fmtDuration(a.moving_time));
  return `${a.name} — ${parts.join(' · ')}`;
}

// Native-tooltip text for an aggregated day bar in the Week/Month views.
function dayBarTooltip(d: { date: string; meters: number; seconds: number }): string {
  if (d.meters <= 0) return `${d.date}: no distance`;
  const parts = [fmtMiles(d.meters)];
  if (d.seconds > 0) parts.push(`${fmtPace(d.seconds / metersToMiles(d.meters))} avg`);
  return `${d.date}: ${parts.join(' · ')}`;
}

function hourLabel(dateLocal: string): string {
  const h = parseInt(dateLocal.slice(11, 13), 10);
  if (Number.isNaN(h)) return '';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${h < 12 ? 'a' : 'p'}`;
}

export default function FitnessCard() {
  // Workout split state
  const [workout, setWorkout] = useState<WorkoutSchedule | null>(null);
  const [workoutBusy, setWorkoutBusy] = useState(false);

  // Distance panel period + activity-type toggles
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [actType, setActType] = useState<'all' | 'run' | 'walk'>('all');

  // Strava state
  const [stravaLoading, setStravaLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [athleteName, setAthleteName] = useState('');
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const syncedOnce = useRef(false);

  const loadWorkout = useCallback(async () => {
    try {
      const res = await fetch(`/api/workout-schedule?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) setWorkout(data);
    } catch {
      // leave as-is
    }
  }, []);

  const workoutAction = useCallback(async (action: 'complete' | 'undo' | 'skip') => {
    setWorkoutBusy(true);
    try {
      const res = await fetch('/api/workout-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setWorkout(data);
        const done: CompletedHabit[] = data.completedHabits || [];
        if (action === 'complete' && done.length > 0) {
          setBanner({
            kind: 'success',
            text: `Checked off with your workout: ${done.map((h) => `${h.icon} ${h.name}`).join(', ')}`,
          });
        }
        if (action !== 'skip') {
          // Completing/undoing a workout can flip habits — refresh the Habits card.
          window.dispatchEvent(new Event('ct:habits-updated'));
        }
      }
    } catch {
      // leave as-is; user can retry
    } finally {
      setWorkoutBusy(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setBanner({ kind: 'error', text: 'Strava sync failed — try again shortly.' });
        return;
      }
      if (!data.connected) {
        setConnected(false);
        return;
      }
      setActivities(data.activities || []);
      const done: CompletedHabit[] = data.completedHabits || [];
      if (done.length > 0) {
        setBanner({
          kind: 'success',
          text: `Auto-completed from Strava: ${done.map((h) => `${h.icon} ${h.name}`).join(', ')}`,
        });
        window.dispatchEvent(new Event('ct:habits-updated'));
      }
    } catch {
      setBanner({ kind: 'error', text: 'Strava sync failed — network error.' });
    } finally {
      setSyncing(false);
    }
  }, []);

  const loadStravaStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/strava/status?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success && data.connected) {
        setConnected(true);
        setAthleteName(data.athlete?.name || '');
        if (!syncedOnce.current) {
          syncedOnce.current = true;
          sync();
        }
      } else {
        setConnected(false);
      }
    } catch {
      // leave disconnected
    } finally {
      setStravaLoading(false);
    }
  }, [sync]);

  useEffect(() => {
    // Surface the OAuth result if we just came back from Strava.
    const params = new URLSearchParams(window.location.search);
    const result = params.get('strava');
    if (result) {
      if (result === 'connected') setBanner({ kind: 'success', text: 'Strava connected.' });
      if (result === 'denied') setBanner({ kind: 'error', text: 'Strava authorization was denied.' });
      if (result === 'error') setBanner({ kind: 'error', text: 'Strava connection failed — check server logs.' });
      params.delete('strava');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    loadWorkout();
    loadStravaStatus();
  }, [loadWorkout, loadStravaStatus]);

  async function disconnect() {
    if (!confirm('Disconnect Strava? Habit auto-complete will stop.')) return;
    try {
      await fetch('/api/strava/status', { method: 'DELETE' });
      setConnected(false);
      setActivities([]);
      setAthleteName('');
      syncedOnce.current = false;
    } catch {
      /* leave state */
    }
  }

  // Distance totals, records, and per-day mileage — scoped by the Run/Walk toggle.
  const metrics = useMemo(() => {
    if (activities.length === 0) return null;
    const filtered = actType === 'run'
      ? activities.filter((a) => RUN_SPORTS.has(a.sport_type))
      : actType === 'walk'
        ? activities.filter((a) => WALK_SPORTS.has(a.sport_type))
        : activities;
    const todayEST = getTodayInEST();
    return {
      today: todayEST,
      totals: distanceTotals(filtered, todayEST),
      records: runRecords(filtered, actType === 'walk' ? WALK_SPORTS : RUN_SPORTS),
      week: weekDailyDistance(filtered, todayEST),
      month: monthDailyDistance(filtered, todayEST),
      todays: filtered.filter((a) => activityDate(a) === todayEST).slice().reverse(), // chronological
    };
  }, [activities, actType]);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header — title + Strava connection */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <Dumbbell className="w-4 h-4 text-[#F97316] flex-shrink-0" />
          <h2 className="text-sm font-semibold text-white">Fitness</h2>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!stravaLoading && (connected ? (
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0d1117] border border-[#30363d]">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="#FC4C02" aria-hidden>
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                <span className="text-[10px] text-[#c9d1d9] font-medium truncate max-w-[120px]">
                  {athleteName || 'Strava'}
                </span>
              </span>
              <button
                onClick={sync}
                disabled={syncing}
                className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
                title="Sync Strava now"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#FC4C02] ${syncing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={disconnect}
                className="p-1.5 hover:bg-[#da3633]/20 rounded-lg transition-colors"
                title="Disconnect Strava"
              >
                <Unlink className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#da3633]" />
              </button>
            </div>
          ) : (
            <a
              href="/api/strava/auth"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: '#FC4C02' }}
              title="Connect Strava to auto-complete Exercise / Run habits"
            >
              <Link2 className="w-3 h-3" />
              Connect Strava
            </a>
          ))}
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 px-4 py-2 text-xs border-b border-[#30363d] ${
            banner.kind === 'success' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#ef4444]/10 text-[#ef4444]'
          }`}
        >
          {banner.kind === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0" />
            : <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />}
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-[10px] opacity-70 hover:opacity-100">dismiss</button>
        </div>
      )}

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Workout split */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 flex flex-col">
            <p className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium mb-2">Workout Split</p>
            {!workout ? (
              <div className="flex items-center justify-center py-4 text-[#8b949e]">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <>
                {workout.completedToday ? (
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="w-8 h-8 rounded-full bg-[#22c55e]/15 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-[#22c55e]" strokeWidth={3} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{workout.todayGroup} done today</p>
                      <p className="text-[11px] text-[#8b949e]">
                        Up next: {workout.nextGroup}
                        <button
                          onClick={() => workoutAction('undo')}
                          disabled={workoutBusy}
                          className="ml-2 text-[10px] text-[#484f58] hover:text-[#ef4444] underline disabled:opacity-50"
                        >
                          undo
                        </button>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#8b949e]">Up next</p>
                      <p className="text-lg font-bold text-white leading-tight truncate">{workout.nextGroup}</p>
                    </div>
                    <button
                      onClick={() => workoutAction('complete')}
                      disabled={workoutBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F97316] hover:bg-[#ff8c5a] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {workoutBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      Done
                    </button>
                  </div>
                )}

                {/* Rotation strip */}
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {workout.groups.map((g, i) => {
                    const isNext = i === workout.nextIndex && !workout.completedToday;
                    const doneToday = workout.completedToday && g === workout.todayGroup;
                    return (
                      <span
                        key={g}
                        className={`text-[10px] px-2 py-1 rounded-full border font-medium ${
                          doneToday
                            ? 'bg-[#22c55e]/15 border-[#22c55e]/40 text-[#22c55e]'
                            : isNext
                              ? 'bg-[#F97316]/15 border-[#F97316]/50 text-[#F97316]'
                              : 'bg-transparent border-[#30363d] text-[#8b949e]'
                        }`}
                      >
                        {g}
                      </span>
                    );
                  })}
                </div>
                {!workout.completedToday && (
                  <button
                    onClick={() => workoutAction('skip')}
                    disabled={workoutBusy}
                    className="self-start mt-2 text-[10px] text-[#484f58] hover:text-[#8b949e] underline disabled:opacity-50"
                  >
                    skip {workout.nextGroup.toLowerCase()}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Distance — Strava-inspired */}
          <div
            className="rounded-lg p-3 border flex flex-col"
            style={{
              borderColor: 'rgba(252,76,2,0.35)',
              background: 'linear-gradient(145deg, rgba(252,76,2,0.14) 0%, rgba(252,76,2,0.05) 35%, #0d1117 70%)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-0.5 bg-[#0d1117]/60 border border-white/5 rounded-lg p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md transition-colors ${
                      period === p.id ? 'bg-[#FC4C02]/25 text-[#FC4C02]' : 'text-[#8b949e] hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 bg-[#0d1117]/60 border border-white/5 rounded-lg p-0.5">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActType(t.id)}
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md transition-colors ${
                      actType === t.id ? 'bg-[#FC4C02]/25 text-[#FC4C02]' : 'text-[#8b949e] hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {!connected || !metrics ? (
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {stravaLoading ? 'Loading…' : connected ? 'No activities yet this month.' : 'Connect Strava to track distance and pace here.'}
              </p>
            ) : (() => {
              const heroMeters = period === 'day' ? metrics.totals.today : period === 'week' ? metrics.totals.week : metrics.totals.month;
              const chartDays = period === 'month' ? metrics.month : metrics.week;
              const maxChartMeters = Math.max(...chartDays.map((d) => d.meters), 1);
              const maxTodayMeters = Math.max(...metrics.todays.map((a) => a.distance), 1);
              return (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
                      {metersToMiles(heroMeters).toFixed(1)}
                    </span>
                    <span className="text-sm font-semibold text-[#FC4C02]">mi</span>
                  </div>

                  {period === 'day' ? (
                    /* Today's activities as bars */
                    metrics.todays.length === 0 ? (
                      <div className="flex items-center justify-center h-[70px] mt-2 rounded-md border border-dashed border-white/10">
                        <p className="text-[10px] text-[#8b949e]">No activity yet today.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-1.5 h-12 mt-2 px-2">
                          {metrics.todays.map((a) => {
                            const pct = a.distance > 0 ? Math.max((a.distance / maxTodayMeters) * 100, 14) : 14;
                            return (
                              <div key={a.id} className="flex-1 max-w-14 flex flex-col items-center justify-end h-full" title={activityBarTooltip(a)}>
                                <div
                                  className="w-full rounded-t-sm transition-all duration-500"
                                  style={{
                                    height: `${pct}%`,
                                    minHeight: '5px',
                                    background: 'linear-gradient(180deg, #FC4C02 0%, #b23502 100%)',
                                    boxShadow: '0 0 8px rgba(252,76,2,0.4)',
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-1.5 mt-1 px-2">
                          {metrics.todays.map((a) => (
                            <span key={a.id} className="flex-1 max-w-14 text-center text-[9px] font-medium text-[#484f58]">
                              {sportIcon(a.sport_type)} {hourLabel(a.start_date_local)}
                            </span>
                          ))}
                        </div>
                      </>
                    )
                  ) : (
                    /* Daily mileage bars for the week or month */
                    <>
                      <div className={`flex items-end h-12 mt-2 ${period === 'month' ? 'gap-px' : 'gap-1'}`}>
                        {chartDays.map((d) => {
                          const isToday = d.date === metrics.today;
                          const pct = d.meters > 0 ? Math.max((d.meters / maxChartMeters) * 100, 12) : 0;
                          return (
                            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={dayBarTooltip(d)}>
                              <div
                                className={`w-full transition-all duration-500 ${period === 'month' ? 'rounded-t-[2px]' : 'rounded-t-sm'}`}
                                style={{
                                  height: `${pct}%`,
                                  minHeight: d.meters > 0 ? '4px' : '2px',
                                  background: d.meters > 0
                                    ? 'linear-gradient(180deg, #FC4C02 0%, #b23502 100%)'
                                    : '#21262d',
                                  boxShadow: isToday && d.meters > 0 ? '0 0 8px rgba(252,76,2,0.6)' : 'none',
                                  opacity: d.date > metrics.today ? 0.35 : 1,
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {period === 'week' ? (
                        <div className="flex gap-1 mt-1">
                          {DAY_LETTERS.map((l, i) => (
                            <span
                              key={i}
                              className={`flex-1 text-center text-[9px] font-medium ${
                                metrics.week[i]?.date === metrics.today ? 'text-[#FC4C02]' : 'text-[#484f58]'
                              }`}
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex justify-between mt-1 text-[9px] font-medium text-[#484f58]">
                          <span>1</span>
                          <span className="text-[#FC4C02]">{parseInt(metrics.today.slice(8), 10)}</span>
                          <span>{chartDays.length}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Records (30-day window) */}
                  <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-white/5 text-[11px]">
                    <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">30d best</span>
                    {metrics.records.bestPace && (
                      <span className="flex items-center gap-1 text-[#c9d1d9]" title={`Fastest avg pace (30d): ${metrics.records.bestPace.activity.name}`}>
                        <Zap className="w-3 h-3 text-[#FC4C02]" />
                        {fmtPace(metrics.records.bestPace.secPerMile)}
                      </span>
                    )}
                    {metrics.records.longest && (
                      <span className="flex items-center gap-1 text-[#c9d1d9]" title={`Longest run (30d): ${metrics.records.longest.name}`}>
                        <Trophy className="w-3 h-3 text-[#FC4C02]" />
                        {fmtMiles(metrics.records.longest.distance)}
                      </span>
                    )}
                    {!metrics.records.bestPace && !metrics.records.longest && (
                      <span className="text-[#8b949e]">No runs in the window yet.</span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Recent activity — compact, inline stats per entry */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium mb-2">Recent Activity</p>
            {stravaLoading ? (
              <div className="flex items-center justify-center py-4 text-[#8b949e]">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : !connected ? (
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Connect Strava (top right) and your Exercise / Run habits auto-complete when an
                activity syncs — no manual check-off needed.
              </p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-[#8b949e]">No recent activities. Log a workout and it&apos;ll appear here.</p>
            ) : (
              <ul className="divide-y divide-[#21262d] max-h-32 overflow-y-auto pr-1">
                {activities.map((a) => (
                  <li key={a.id} className="py-1.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex-shrink-0">{sportIcon(a.sport_type)}</span>
                      <a
                        href={`https://www.strava.com/activities/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 text-xs font-medium text-white truncate hover:text-[#FC4C02] transition-colors"
                      >
                        {a.name}
                      </a>
                      <AchievementBadge a={a} />
                      <span className="text-[10px] text-[#484f58] flex-shrink-0">{fmtDay(a.start_date_local)}</span>
                    </div>
                    <ActivityStatLine a={a} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
