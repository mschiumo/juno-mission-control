'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Clock, RefreshCw, Activity, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Subagent {
  sessionKey: string;
  task: string;
  status: 'working' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  lastUpdated: string;
}

export default function SubagentCard() {
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubagents();
    // Refresh every 10 seconds for near real-time updates
    const interval = setInterval(fetchSubagents, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchSubagents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/subagents');
      const data = await response.json();
      if (data.success) {
        setSubagents(data.data);
      } else {
        setError(data.error || 'Failed to fetch subagents');
      }
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch subagents:', error);
      setError('Network error');
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
      minute: '2-digit'
    });
  };

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-[#58a6ff] animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-[#238636]" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-[#f85149]" />;
      default:
        return <Activity className="w-4 h-4 text-[#8b949e]" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
      case 'in_progress':
        return 'bg-[#58a6ff]/20 text-[#58a6ff] border-[#58a6ff]/30';
      case 'completed':
        return 'bg-[#238636]/20 text-[#238636] border-[#238636]/30';
      case 'failed':
        return 'bg-[#f85149]/20 text-[#f85149] border-[#f85149]/30';
      default:
        return 'bg-[#30363d] text-[#8b949e] border-[#30363d]';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'working':
      case 'in_progress':
        return 'Working';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const activeSubagents = subagents.filter(s => s.status === 'working' || s.status === 'in_progress');
  const completedSubagents = subagents.filter(s => s.status === 'completed');
  const failedSubagents = subagents.filter(s => s.status === 'failed');

  // Sort: active first, then by lastUpdated descending
  const sortedSubagents = [...subagents].sort((a, b) => {
    const aActive = a.status === 'working' || a.status === 'in_progress';
    const bActive = b.status === 'working' || b.status === 'in_progress';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#58a6ff]/10 rounded-lg">
            <Bot className="w-5 h-5 text-[#58a6ff]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Active Subagents</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {activeSubagents.length > 0 ? (
                  <span className="text-[#58a6ff]">{activeSubagents.length} active</span>
                ) : (
                  <span>0 active</span>
                )}
                {completedSubagents.length > 0 && (
                  <span className="text-[#238636] ml-1">• {completedSubagents.length} completed</span>
                )}
                {failedSubagents.length > 0 && (
                  <span className="text-[#f85149] ml-1">• {failedSubagents.length} failed</span>
                )}
              </p>
              {lastUpdated && !loading && (
                <>
                  <span className="text-[10px] text-[#238636]">
                    updated {formatLastUpdated()}
                  </span>
                  <span className="text-[10px] text-[#58a6ff] ml-1 animate-pulse">
                    ● Live
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <button
          onClick={fetchSubagents}
          disabled={loading}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh subagents"
        >
          <RefreshCw className={`w-5 h-5 text-[#8b949e] hover:text-[#58a6ff] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {error ? (
          <div className="text-center py-8 text-[#f85149]">
            <XCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">{error}</p>
            <button 
              onClick={fetchSubagents}
              className="mt-2 text-xs text-[#58a6ff] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : loading && subagents.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#58a6ff]" />
            <p>Loading subagents...</p>
          </div>
        ) : subagents.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No active subagents</p>
            <p className="text-xs mt-1">Subagents will appear here when tasks are spawned</p>
          </div>
        ) : (
          sortedSubagents.map((subagent) => (
            <div
              key={subagent.sessionKey}
              className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#58a6ff]/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(subagent.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm truncate">
                      {subagent.task}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getStatusColor(subagent.status)}`}>
                      {getStatusLabel(subagent.status)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-[#8b949e]">
                    <div className="flex items-center gap-1" title="Session ID">
                      <span className="font-mono text-[#6e7681]">
                        {subagent.sessionKey.slice(0, 8)}...
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1" title="Started">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(subagent.startedAt)}</span>
                    </div>
                    {(subagent.status === 'working' || subagent.status === 'in_progress') && (
                      <div className="flex items-center gap-1 text-[#58a6ff]" title="Duration">
                        <Activity className="w-3 h-3" />
                        <span>{formatDuration(subagent.startedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="mt-3 pt-3 border-t border-[#30363d]">
        <p className="text-[10px] text-[#6e7681]">
          Auto-refreshes every 10 seconds • Subagents expire after 30 min inactivity
        </p>
      </div>
    </div>
  );
}
