'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ShieldCheck, RefreshCw, Link2, Unlink, Loader2,
  TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import {
  type ActivitySummary, RUN_SPORTS,
  fmtMiles, fmtDuration, fmtPace, paceSecPerMile, speedMph,
  distanceTotals, runRecords,
} from '@/lib/strava-metrics';

interface DisciplineDay {
  date: string;
  score: number | null;
  habitScore: number | null;
  journaled: boolean;
}

type StravaActivity = ActivitySummary;

interface CompletedHabit {
  id: string;
  name: string;
  icon: string;
}

const SPORT_ICONS: Record<string, string> = {
  Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃',
  Ride: '🚴', MountainBikeRide: '🚵', VirtualRide: '🚴', GravelRide: '🚴',
  WeightTraining: '🏋️', Workout: '💪', Crossfit: '💪', HighIntensityIntervalTraining: '💪',
  Swim: '🏊', Walk: '🚶', Hike: '🥾', Yoga: '🧘', Golf: '⛳', Tennis: '🎾',
};

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

function scoreColor(score: number | null): string {
  if (score === null) return '#21262d';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#d29922';
  if (score >= 20) return '#F97316';
  return '#ef4444';
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'No data yet';
  if (score >= 85) return 'Elite';
  if (score >= 70) return 'Dialed in';
  if (score >= 50) return 'Building';
  if (score >= 30) return 'Slipping';
  return 'Off track';
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function DisciplineCard() {
  const [days, setDays] = useState<DisciplineDay[]>([]);
  const [loading, setLoading] = useState(true);

  // Strava state
  const [stravaLoading, setStravaLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [athleteName, setAthleteName] = useState('');
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const syncedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/discipline?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) setDays(data.days || []);
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
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
    load();
    loadStravaStatus();
    const interval = setInterval(load, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [load, loadStravaStatus]);

  // Refresh the score when habits or the journal change elsewhere on the dashboard.
  useEffect(() => {
    window.addEventListener('ct:habits-updated', load);
    window.addEventListener('ct:discipline-updated', load);
    return () => {
      window.removeEventListener('ct:habits-updated', load);
      window.removeEventListener('ct:discipline-updated', load);
    };
  }, [load]);

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

  const today = days.length > 0 ? days[days.length - 1] : null;
  const todayScore = today?.score ?? null;

  // 7-day momentum: this week's average vs the prior week's.
  const momentum = useMemo(() => {
    const scores = days.map((d) => d.score);
    const thisWeek = scores.slice(-7).filter((s): s is number => s !== null);
    const lastWeek = scores.slice(-14, -7).filter((s): s is number => s !== null);
    const a = avg(thisWeek);
    const b = avg(lastWeek);
    if (a === null || b === null) return null;
    return Math.round(a - b);
  }, [days]);

  const ringColor = scoreColor(todayScore);
  const circumference = 2 * Math.PI * 26;
  const dashOffset = todayScore === null ? circumference : circumference * (1 - todayScore / 100);

  // Distance totals + run records over the synced window (~this month / 30d).
  const metrics = useMemo(() => {
    if (activities.length === 0) return null;
    const todayEST = getTodayInEST();
    return {
      totals: distanceTotals(activities, todayEST),
      records: runRecords(activities),
    };
  }, [activities]);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header — title, momentum, Strava connection */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-[#F97316] flex-shrink-0" />
          <h2 className="text-sm font-semibold text-white">Discipline</h2>
          {momentum !== null && (
            <span
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{
                background: momentum > 2 ? 'rgba(34,197,94,0.12)' : momentum < -2 ? 'rgba(239,68,68,0.12)' : 'rgba(139,148,158,0.12)',
                color: momentum > 2 ? '#22c55e' : momentum < -2 ? '#ef4444' : '#8b949e',
              }}
              title="7-day average vs the week before"
            >
              {momentum > 2 ? <TrendingUp className="w-3 h-3" /> : momentum < -2 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {momentum > 0 ? `+${momentum}` : momentum}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Strava connection */}
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
          <button
            onClick={() => { setLoading(true); load(); }}
            disabled={loading}
            className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Refresh score"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
          </button>
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
          {/* Today's score */}
          <div className="flex items-center gap-4 bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
                <circle cx="30" cy="30" r="26" fill="none" stroke="#21262d" strokeWidth="6" />
                <circle
                  cx="30" cy="30" r="26" fill="none"
                  stroke={ringColor} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold tabular-nums" style={{ color: todayScore === null ? '#8b949e' : ringColor }}>
                  {todayScore === null ? '—' : todayScore}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">Today&apos;s Score</p>
              <p className="text-sm font-semibold text-white">{scoreLabel(todayScore)}</p>
              <p className="text-[10px] text-[#8b949e] mt-0.5 leading-relaxed">Habits · journal</p>
            </div>
          </div>

          {/* Distance + run records */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium mb-2">Distance</p>
            {!connected || !metrics ? (
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {stravaLoading ? 'Loading…' : connected ? 'No activities yet this month.' : 'Connect Strava to track distance and pace here.'}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  {[
                    { label: 'Today', meters: metrics.totals.today },
                    { label: 'Week', meters: metrics.totals.week },
                    { label: 'Month', meters: metrics.totals.month },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#161b22] border border-[#30363d] rounded-lg px-1.5 py-2 text-center">
                      <div className="text-sm font-bold text-[#FC4C02] tabular-nums">{fmtMiles(s.meters)}</div>
                      <div className="text-[10px] text-[#8b949e] mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 text-[11px] text-[#8b949e]">
                  {metrics.records.bestPace && (
                    <p className="truncate" title={metrics.records.bestPace.activity.name}>
                      <span className="text-[#c9d1d9] font-medium">Best pace</span>{' '}
                      {fmtPace(metrics.records.bestPace.secPerMile)}
                      <span className="text-[#484f58]"> · {fmtDay(metrics.records.bestPace.activity.start_date_local)}</span>
                    </p>
                  )}
                  {metrics.records.longest && (
                    <p className="truncate" title={metrics.records.longest.name}>
                      <span className="text-[#c9d1d9] font-medium">Longest run</span>{' '}
                      {fmtMiles(metrics.records.longest.distance)}
                      <span className="text-[#484f58]"> · {fmtDay(metrics.records.longest.start_date_local)}</span>
                    </p>
                  )}
                  {!metrics.records.bestPace && !metrics.records.longest && (
                    <p>No runs in the window yet.</p>
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
                activity syncs — no manual check-off, the score just moves.
              </p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-[#8b949e]">No recent activities. Log a workout and it&apos;ll appear here.</p>
            ) : (
              <ul className="divide-y divide-[#21262d] max-h-28 overflow-y-auto pr-1">
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
