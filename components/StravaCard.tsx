'use client';

import React, { useState, useEffect } from 'react';
import { Activity, MapPin, Timer, TrendingUp, Heart, Zap, Flame, RefreshCw, Bike, Footprints, Waves, Mountain } from 'lucide-react';

interface ActivitySummary {
  id: number;
  name: string;
  type: string;
  sportType: string;
  date: string;
  distance: number; // miles
  duration: number; // minutes
  elevation: number; // feet
  avgSpeed: number; // mph
  maxSpeed: number; // mph
  avgHeartrate?: number;
  maxHeartrate?: number;
  avgWatts?: number;
  maxWatts?: number;
  calories?: number;
  hasHeartrate: boolean;
  hasPower: boolean;
}

interface ActivityStats {
  totalActivities: number;
  totalDistance: number;
  totalDuration: number;
  totalElevation: number;
  totalCalories: number;
  activitiesWithHeartrate: number;
  activitiesWithPower: number;
  byType: Record<string, number>;
}

interface StravaData {
  success: boolean;
  activities: ActivitySummary[];
  stats: ActivityStats | null;
  error?: string;
  message?: string;
  lastUpdated: string;
}

type ConnectionStatus = 'loading' | 'connected' | 'disconnected';

// Format duration from minutes to HH:MM or MM
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Format distance with 1 decimal
function formatDistance(miles: number): string {
  return miles.toFixed(1);
}

// Format relative time
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Get activity icon based on type
function getActivityIcon(type: string) {
  const lowerType = type.toLowerCase();
  
  if (lowerType.includes('ride') || lowerType.includes('bike')) {
    return <Bike className="w-4 h-4" />;
  } else if (lowerType.includes('run')) {
    return <Footprints className="w-4 h-4" />;
  } else if (lowerType.includes('swim')) {
    return <Waves className="w-4 h-4" />;
  } else if (lowerType.includes('hike') || lowerType.includes('walk')) {
    return <Mountain className="w-4 h-4" />;
  }
  return <Activity className="w-4 h-4" />;
}

// Get activity color based on type
function getActivityColor(type: string): string {
  const lowerType = type.toLowerCase();
  
  if (lowerType.includes('ride') || lowerType.includes('bike')) {
    return 'text-[#58a6ff] bg-[#58a6ff]/10';
  } else if (lowerType.includes('run')) {
    return 'text-[#ff6b35] bg-[#ff6b35]/10';
  } else if (lowerType.includes('swim')) {
    return 'text-[#58a6ff] bg-[#58a6ff]/10';
  } else if (lowerType.includes('hike')) {
    return 'text-[#d29922] bg-[#d29922]/10';
  } else if (lowerType.includes('walk')) {
    return 'text-[#22c55e] bg-[#22c55e]/10';
  }
  return 'text-[#8b949e] bg-[#8b949e]/10';
}

// Placeholder component for disconnected state
function StravaPlaceholder({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#ff6b35]/10 flex items-center justify-center">
        <Activity className="w-8 h-8 text-[#ff6b35]" />
      </div>
      <h3 className="text-sm font-medium text-white mb-2">Strava Activities</h3>
      <p className="text-xs text-[#8b949e] mb-1">Connect your Strava account to track your workouts here.</p>
      <p className="text-[10px] text-[#8b949e]/60 mb-4">Strava integration coming soon</p>
      <button
        onClick={onRetry}
        className="text-xs px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] rounded-lg transition-colors"
      >
        Check Connection
      </button>
    </div>
  );
}

export default function StravaCard() {
  const [data, setData] = useState<StravaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [daysFilter, setDaysFilter] = useState(30);

  useEffect(() => {
    fetchActivities();
    // Refresh every 5 minutes
    const interval = setInterval(fetchActivities, 300000);
    return () => clearInterval(interval);
  }, [daysFilter]);

  const fetchActivities = async () => {
    setLoading(true);
    
    try {
      const response = await fetch(`/api/strava-activities?days=${daysFilter}&limit=10`);
      const result = await response.json();
      
      if (result.success) {
        setData(result);
        setConnectionStatus('connected');
        setLastUpdated(new Date());
      } else {
        // Check for auth/configuration errors - treat as disconnected, not error
        const isAuthError = response.status === 401 || 
                           result.error?.includes('not configured') ||
                           result.error?.includes('authentication') ||
                           result.error?.includes('token') ||
                           result.message?.includes('not configured');
        
        if (isAuthError) {
          setConnectionStatus('disconnected');
          // Don't show error - just show placeholder
        } else {
          // Non-auth errors still show as disconnected (no error UI)
          setConnectionStatus('disconnected');
        }
        setData(result);
      }
    } catch (err) {
      // Network errors - show disconnected state, no error message
      setConnectionStatus('disconnected');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Loading state
  if (connectionStatus === 'loading' && loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Strava Activities</h2>
            <p className="text-xs text-[#8b949e]">Loading...</p>
          </div>
        </div>
        
        <div className="text-center py-8 text-[#8b949e]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
          <p className="text-sm">Loading activities...</p>
        </div>
      </div>
    );
  }

  // Disconnected state - show friendly placeholder
  if (connectionStatus === 'disconnected') {
    return (
      <div className="card">
        <StravaPlaceholder onRetry={fetchActivities} />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Strava Activities</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {data?.stats?.totalActivities || 0} activities
              </p>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#238636]">
                  updated {formatLastUpdated()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Days filter */}
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(parseInt(e.target.value))}
            className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white focus:outline-none focus:border-[#ff6b35]"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          
          <button
            onClick={fetchActivities}
            disabled={loading}
            className="pill p-2"
            title="Refresh activities"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {data?.stats && data.stats.totalActivities > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5 p-3 bg-[#0d1117] rounded-xl">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MapPin className="w-3 h-3 text-[#58a6ff]" />
            </div>
            <p className="text-sm font-semibold text-white">{formatDistance(data.stats.totalDistance)}</p>
            <p className="text-[10px] text-[#8b949e]">mi</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Timer className="w-3 h-3 text-[#d29922]" />
            </div>
            <p className="text-sm font-semibold text-white">{formatDuration(data.stats.totalDuration)}</p>
            <p className="text-[10px] text-[#8b949e]">time</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-[#22c55e]" />
            </div>
            <p className="text-sm font-semibold text-white">{Math.round(data.stats.totalElevation).toLocaleString()}</p>
            <p className="text-[10px] text-[#8b949e]">ft elev</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Flame className="w-3 h-3 text-[#ff6b35]" />
            </div>
            <p className="text-sm font-semibold text-white">{Math.round(data.stats.totalCalories).toLocaleString()}</p>
            <p className="text-[10px] text-[#8b949e]">cals</p>
          </div>
        </div>
      )}

      {/* Activities List */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {loading && !data?.activities?.length ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p className="text-sm">Loading activities...</p>
          </div>
        ) : data?.activities?.length === 0 ? (
          <div className="text-center py-10">
            <Activity className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e] mb-1">No activities found</p>
            <p className="text-xs text-[#8b949e]/70">Activities will appear here when you work out</p>
          </div>
        ) : (
          data?.activities?.map((activity) => (
            <a
              key={activity.id}
              href={`https://www.strava.com/activities/${activity.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#ff6b35]/50 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${getActivityColor(activity.type)}`}>
                  {getActivityIcon(activity.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white truncate group-hover:text-[#ff6b35] transition-colors">
                      {activity.name}
                    </h3>
                    <span className="text-[10px] text-[#8b949e]">{getRelativeTime(activity.date)}</span>
                  </div>
                  
                  <p className="text-xs text-[#8b949e] mt-0.5">{activity.type}</p>
                  
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    <span className="flex items-center gap-1 text-[#8b949e]">
                      <MapPin className="w-3 h-3" />
                      {formatDistance(activity.distance)} mi
                    </span>
                    
                    <span className="flex items-center gap-1 text-[#8b949e]">
                      <Timer className="w-3 h-3" />
                      {formatDuration(activity.duration)}
                    </span>
                    
                    {activity.avgSpeed > 0 && (
                      <span className="flex items-center gap-1 text-[#8b949e]">
                        <TrendingUp className="w-3 h-3" />
                        {activity.avgSpeed.toFixed(1)} mph
                      </span>
                    )}
                    
                    {activity.hasHeartrate && activity.avgHeartrate && (
                      <span className="flex items-center gap-1 text-[#da3633]">
                        <Heart className="w-3 h-3" />
                        {Math.round(activity.avgHeartrate)} bpm
                      </span>
                    )}
                    
                    {activity.hasPower && activity.avgWatts && (
                      <span className="flex items-center gap-1 text-[#d29922]">
                        <Zap className="w-3 h-3" />
                        {Math.round(activity.avgWatts)}w
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      {/* Activity Type Breakdown */}
      {data?.stats?.byType && Object.keys(data.stats.byType).length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#30363d]">
          <p className="text-xs text-[#8b949e] mb-2">Activity Types</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.stats.byType).map(([type, count]) => (
              <span
                key={type}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${getActivityColor(type)}`}
              >
                {count} {type}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
