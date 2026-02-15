'use client';

import { useState, useEffect } from 'react';
import { Activity, Timer, TrendingUp, Mountain, Flame, RefreshCw, MapPin } from 'lucide-react';

interface StravaStats {
  totalActivities: number;
  totalDistance: number;
  totalTime: number;
  totalElevation: number;
  totalCalories: number;
  runs: number;
  rides: number;
  workouts: number;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  distance: string;
  duration: string;
  elevation: string;
  date: string;
  avgHr?: number;
  calories?: number;
}

interface StravaData {
  stats: StravaStats;
  activities: StravaActivity[];
}

export default function StravaCard() {
  const [data, setData] = useState<StravaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchStravaData();
  }, [days]);

  const fetchStravaData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/strava-activities?days=${days}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.message || 'Failed to load Strava data');
      }
    } catch (err) {
      setError('Strava integration not configured');
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'Run':
        return '🏃';
      case 'Ride':
        return '🚴';
      case 'Workout':
      case 'WeightTraining':
        return '💪';
      case 'Swim':
        return '🏊';
      case 'Hike':
        return '🥾';
      default:
        return '⚡';
    }
  };

  if (loading) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-[#ff6b35] animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-[#fc4c02]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#fc4c02]" />
          </div>
          <h2 className="text-lg font-semibold text-white">Strava Activity</h2>
        </div>
        <div className="text-center py-6">
          <p className="text-sm text-[#8b949e] mb-2">{error}</p>
          <p className="text-xs text-[#8b949e]">Connect your Strava account to see activity here</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, activities } = data;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#fc4c02]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#fc4c02]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Strava Activity</h2>
            <p className="text-xs text-[#8b949e]">Last {days} days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm text-white"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button
            onClick={fetchStravaData}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-[#8b949e]" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0d1117] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-[#fc4c02]" />
            <span className="text-xs text-[#8b949e]">Distance</span>
          </div>
          <p className="text-lg font-semibold text-white">{formatDistance(stats.totalDistance)}</p>
        </div>

        <div className="bg-[#0d1117] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Timer className="w-4 h-4 text-[#fc4c02]" />
            <span className="text-xs text-[#8b949e]">Time</span>
          </div>
          <p className="text-lg font-semibold text-white">{formatTime(stats.totalTime)}</p>
        </div>

        <div className="bg-[#0d1117] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Mountain className="w-4 h-4 text-[#fc4c02]" />
            <span className="text-xs text-[#8b949e]">Elevation</span>
          </div>
          <p className="text-lg font-semibold text-white">{Math.round(stats.totalElevation)} m</p>
        </div>

        <div className="bg-[#0d1117] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-[#fc4c02]" />
            <span className="text-xs text-[#8b949e]">Calories</span>
          </div>
          <p className="text-lg font-semibold text-white">{stats.totalCalories.toLocaleString()}</p>
        </div>
      </div>

      {/* Activity Type Breakdown */}
      <div className="flex gap-2 mb-4">
        {stats.runs > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-[#0d1117] rounded text-xs">
            <span>🏃</span>
            <span className="text-white">{stats.runs} runs</span>
          </div>
        )}
        {stats.rides > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-[#0d1117] rounded text-xs">
            <span>🚴</span>
            <span className="text-white">{stats.rides} rides</span>
          </div>
        )}
        {stats.workouts > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-[#0d1117] rounded text-xs">
            <span>💪</span>
            <span className="text-white">{stats.workouts} workouts</span>
          </div>
        )}
      </div>

      {/* Recent Activities */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white mb-2">Recent Activities</h3>
        
        {activities.length === 0 ? (
          <p className="text-sm text-[#8b949e] text-center py-4">No activities found</p>
        ) : (
          activities.slice(0, 5).map((activity) => (
            <div
              key={activity.id}
              className="flex items-center justify-between p-2 bg-[#0d1117] rounded-lg hover:bg-[#21262d] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{getActivityIcon(activity.type)}</span>
                <div>
                  <p className="text-sm font-medium text-white truncate max-w-[150px]">{activity.name}</p>
                  <p className="text-xs text-[#8b949e]">{activity.date} • {activity.type}</p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-sm font-medium text-white">{activity.distance}</p>
                <p className="text-xs text-[#8b949e]">{activity.duration}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
