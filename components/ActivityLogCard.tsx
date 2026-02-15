'use client';

import React, { useState, useEffect } from 'react';
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
  const parts: React.ReactNode[] = [];
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
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).replace(',', ' @');
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

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'cron': return 'bg-[#238636]/20 text-[#238636]';
      case 'api': return 'bg-[#58a6ff]/20 text-[#58a6ff]';
      case 'user': return 'bg-[#ff6b35]/20 text-[#ff6b35]';
      case 'system': return 'bg-[#8b949e]/20 text-[#8b949e]';
      default: return 'bg-[#30363d] text-[#8b949e]';
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
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Activity Log</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {activities.length} activit{activities.length === 1 ? 'y' : 'ies'}
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
          className="pill p-2"
          title="Refresh activities"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Activity Type Summary */}
      {Object.keys(typeCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 p-3 bg-[#0d1117] rounded-xl">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span 
              key={type} 
              className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${getTypeBadgeColor(type)}`}
            >
              {count} {pluralizeType(type, count)}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {loading && activities.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p className="text-sm">Loading activities...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-10">
            <Activity className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e] mb-1">No activities today</p>
            <p className="text-xs text-[#8b949e]/70">Activities will appear here when cron jobs run or actions are logged</p>
          </div>
        ) : (
          sortedActivities.map((activity) => (
            <div
              key={activity.id}
              className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#30363d]/80 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center bg-[#21262d] rounded-lg">
                  {getTypeIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">{renderWithPRLinks(activity.action)}</span>
                    {activity.url ? (
                      <a 
                        href={activity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 bg-[#58a6ff]/20 text-[#58a6ff] hover:bg-[#58a6ff]/30 rounded-full transition-colors font-medium"
                      >
                        Open →
                      </a>
                    ) : (
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${getTypeBadgeColor(activity.type)}`}>
                        {getTypeLabel(activity.type)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8b949e] mt-2 leading-relaxed">{renderWithPRLinks(activity.details)}</p>
                  <div className="flex items-center gap-1 text-[10px] text-[#8b949e]/70 mt-3">
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
