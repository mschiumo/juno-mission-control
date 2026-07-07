'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dumbbell, RefreshCw, Link2, Unlink, Loader2, Check,
  CheckCircle2, AlertTriangle, Zap, Trophy,
} from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import {
  type ActivitySummary, RUN_SPORTS,
  fmtMiles, fmtDuration, fmtPace, paceSecPerMile, speedMph, metersToMiles,
  distanceTotals, runRecords, weekDailyDistance,
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

// Inline stat line for one activity: runs get pace, rides get mph, everything
// else just duration.
function activityStats(a: StravaActivity): string {
  const parts: string[] = [];
  if (a.distance > 0) parts.push(fmtMiles(a.distance));
  if (RUN_SPORTS.has(a.sport_type)) {
    const pace = paceSecPerMile(a);
    if (pace !== null) parts.push(fmtPace(pace));
  } else if (a.sport_type.includes('Ride')) {
    const mph = speedMph(a);
    if (mph !== null) parts.push(`${mph.toFixed(1)} mph`);
  }
  parts.push(fmtDuration(a.moving_time));
  return parts.join(' · ');
}

export default function FitnessCard() {
  // Workout split state
  const [workout, setWorkout] = useState<WorkoutSchedule | null>(null);
  const [workoutBusy, setWorkoutBusy] = useState(false);

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

  // Distance totals, run records, and the week's daily mileage.
  const metrics = useMemo(() => {
    if (activities.length === 0) return null;
    const todayEST = getTodayInEST();
    return {
      today: todayEST,
      totals: distanceTotals(activities, todayEST),
      records: runRecords(activities),
      week: weekDailyDistance(activities, todayEST),
    };
  }, [activities]);

  const maxDayMeters = metrics ? Math.max(...metrics.week.map((d) => d.meters), 1) : 1;

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
              <p className="text-[10px] uppercase tracking-wider text-[#FC4C02] font-semibold">This Week</p>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-80" fill="#FC4C02" aria-hidden>
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </div>
            {!connected || !metrics ? (
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {stravaLoading ? 'Loading…' : connected ? 'No activities yet this month.' : 'Connect Strava to track distance and pace here.'}
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
                    {metersToMiles(metrics.totals.week).toFixed(1)}
                  </span>
                  <span className="text-sm font-semibold text-[#FC4C02]">mi</span>
                  <span className="ml-auto text-[10px] text-[#8b949e] tabular-nums text-right leading-tight">
                    today {fmtMiles(metrics.totals.today)}
                    <br />
                    month {fmtMiles(metrics.totals.month)}
                  </span>
                </div>

                {/* Week mileage bars */}
                <div className="flex items-end gap-1 h-12 mt-2">
                  {metrics.week.map((d) => {
                    const isToday = d.date === metrics.today;
                    const pct = d.meters > 0 ? Math.max((d.meters / maxDayMeters) * 100, 12) : 0;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${fmtMiles(d.meters)}`}>
                        <div
                          className="w-full rounded-t-sm transition-all duration-500"
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

                {/* Records */}
                <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-white/5 text-[11px]">
                  {metrics.records.bestPace && (
                    <span className="flex items-center gap-1 text-[#c9d1d9]" title={`Fastest avg pace: ${metrics.records.bestPace.activity.name}`}>
                      <Zap className="w-3 h-3 text-[#FC4C02]" />
                      {fmtPace(metrics.records.bestPace.secPerMile)}
                    </span>
                  )}
                  {metrics.records.longest && (
                    <span className="flex items-center gap-1 text-[#c9d1d9]" title={`Longest run: ${metrics.records.longest.name}`}>
                      <Trophy className="w-3 h-3 text-[#FC4C02]" />
                      {fmtMiles(metrics.records.longest.distance)}
                    </span>
                  )}
                  {!metrics.records.bestPace && !metrics.records.longest && (
                    <span className="text-[#8b949e]">No runs in the window yet.</span>
                  )}
                </div>
              </>
            )}
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
                      <span className="text-[10px] text-[#484f58] flex-shrink-0">{fmtDay(a.start_date_local)}</span>
                    </div>
                    <p className="text-[10px] text-[#8b949e] tabular-nums pl-6">{activityStats(a)}</p>
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
