'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, RefreshCw } from 'lucide-react';

interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  type: 'cron' | 'api' | 'user' | 'system';
}

export default function ActivityLogCard() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
    // Refresh every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivities = async () => {
    try {
      const response = await fetch('/api/activity-log');
      const data = await response.json();
      if (data.success) {
        setActivities(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cron':
        return <span className="text-[#238636]">🤖</span>;
      case 'api':
        return <span className="text-[#58a6ff]">🔌</span>;
      case 'user':
        return <span className="text-[#ff6b35]">👤</span>;
      case 'system':
        return <span className="text-[#8b949e]">⚙️</span>;
      default:
        return <span>📝</span>;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'cron': return 'Cron Job';
      case 'api': return 'API Call';
      case 'user': return 'User Action';
      case 'system': return 'System';
      default: return type;
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Activity Log</h2>
            <p className="text-xs text-[#8b949e]">
              {activities.length} activity{activities.length !== 1 ? 'ies' : 'y'} today
            </p>
          </div>
        </div>
        
        <button
          onClick={fetchActivities}
          disabled={loading}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh activities"
        >
          <RefreshCw className={`w-5 h-5 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="text-center py-4 text-[#8b949e]">Loading...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-4 text-[#8b949e]">No activities today</div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d]"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getTypeIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{activity.action}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full">
                      {getTypeLabel(activity.type)}
                    </span>
                  </div>
                  <p className="text-xs text-[#8b949e] mt-1">{activity.details}</p>
                  <div className="flex items-center gap-1 text-[10px] text-[#8b949e] mt-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(activity.timestamp)} EST
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
