'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, RefreshCw } from 'lucide-react';

interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  type: 'cron' | 'api' | 'user' | 'system';
  url?: string;
}

// Helper to render text with PR links
function renderWithPRLinks(text: string, repoUrl: string = 'https://github.com/mschiumo/juno-mission-control') {
  // Match PR #XXX patterns
  const prPattern = /#(\d+)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = prPattern.exec(text)) !== null) {
    const prNumber = match[1];
    const beforeText = text.slice(lastIndex, match.index);
    
    if (beforeText) {
      parts.push(beforeText);
    }
    
    parts.push(
      <a 
        key={match.index}
        href={`${repoUrl}/pull/${prNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#58a6ff] hover:underline hover:text-[#79c0ff]"
      >
        #{prNumber}
      </a>
    );
    
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function ActivityLogCard() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchActivities();
    // Refresh every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/activity-log');
      const data = await response.json();
      if (data.success) {
        setActivities(data.data);
      }
      setLastUpdated(new Date());
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

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
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

  const pluralizeType = (type: string, count: number) => {
    const label = getTypeLabel(type);
    if (count === 1) return label;
    // Pluralize
    if (label === 'Cron Job') return 'Cron Jobs';
    if (label === 'API Call') return 'API Calls';
    if (label === 'User Action') return 'User Actions';
    return label + 's';
  };

  const getTypeCounts = () => {
    const counts: Record<string, number> = {};
    activities.forEach(a => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return counts;
  };

  const typeCounts = getTypeCounts();

  // Sort activities by timestamp descending (newest first)
  const sortedActivities = [...activities].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Activity Log</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {activities.length} activit{activities.length === 1 ? 'y' : 'ies'} today
                {Object.keys(typeCounts).length > 0 && (
                  <span className="ml-1">
                    ({Object.entries(typeCounts).map(([type, count]) => `${count} ${pluralizeType(type, count)}`).join(', ')})
                  </span>
                )}
              </p>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#238636]">
                  updated {formatLastUpdated()}
                </span>
              )}
            </div>
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

      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {loading && activities.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            Loading activities...
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <p>No activities today</p>
            <p className="text-xs mt-1">Activities will appear here when cron jobs run or actions are logged</p>
          </div>
        ) : (
          sortedActivities.map((activity) => (
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
                    <span className="font-medium text-white text-sm">{renderWithPRLinks(activity.action)}</span>
                    {activity.url ? (
                      <a 
                        href={activity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-1.5 py-0.5 bg-[#30363d] text-[#58a6ff] hover:bg-[#58a6ff]/20 rounded-full transition-colors"
                      >
                        Open →
                      </a>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full">
                        {getTypeLabel(activity.type)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8b949e] mt-1">{renderWithPRLinks(activity.details)}</p>
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
