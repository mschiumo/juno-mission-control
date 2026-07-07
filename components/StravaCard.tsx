'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link2, Loader2, RefreshCw, Unlink, CheckCircle2, AlertTriangle } from 'lucide-react';

interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number;
  start_date_local: string;
}

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

function fmtDistance(meters: number): string {
  if (!meters) return '';
  const miles = meters / 1609.344;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDay(dateLocal: string): string {
  return new Date(dateLocal.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function StravaCard() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [athleteName, setAthleteName] = useState('');
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const syncedOnce = useRef(false);

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

  const loadStatus = useCallback(async () => {
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
      setLoading(false);
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
    loadStatus();
  }, [loadStatus]);

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

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-2">
          {/* Strava mark */}
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#FC4C02" aria-hidden>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <h2 className="text-sm font-semibold text-white">Strava</h2>
          {connected && athleteName && (
            <span className="text-[10px] text-[#8b949e] truncate max-w-[140px]">{athleteName}</span>
          )}
        </div>
        {connected && (
          <div className="flex items-center gap-1">
            <button
              onClick={sync}
              disabled={syncing}
              className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              title="Sync now"
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
        )}
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

      {loading ? (
        <div className="flex items-center justify-center py-8 text-[#8b949e]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !connected ? (
        <div className="text-center py-6 px-4">
          <p className="text-xs text-[#8b949e] mb-3">
            Connect Strava to auto-complete your Exercise and Run habits when an activity syncs.
          </p>
          <a
            href="/api/strava/auth"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: '#FC4C02' }}
          >
            <Link2 className="w-4 h-4" />
            Connect Strava
          </a>
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-6 px-4">
          <p className="text-xs text-[#8b949e]">No activities in the last 7 days.</p>
          <p className="text-[11px] text-[#484f58] mt-0.5">Log a workout and it&apos;ll appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#21262d] max-h-56 overflow-y-auto">
          {activities.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2">
              <span className="text-base flex-shrink-0">{sportIcon(a.sport_type)}</span>
              <div className="flex-1 min-w-0">
                <a
                  href={`https://www.strava.com/activities/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-white truncate block hover:text-[#FC4C02] transition-colors"
                >
                  {a.name}
                </a>
                <p className="text-[11px] text-[#8b949e]">{fmtDay(a.start_date_local)}</p>
              </div>
              <div className="text-right flex-shrink-0 text-[11px] text-[#8b949e] tabular-nums">
                {a.distance > 0 && <p>{fmtDistance(a.distance)}</p>}
                <p>{fmtDuration(a.moving_time)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
