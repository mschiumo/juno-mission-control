'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Calendar, Activity } from 'lucide-react';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  frequency: string;
  status: string;
  lastRun: string | null;
  lastStatus: string;
  lastOutput: string | null;
}

interface CronStatusResponse {
  success: boolean;
  crons: CronJob[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    active: number;
  };
  timestamp: string;
}

export default function DailyCronsCard() {
  const [data, setData] = useState<CronStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchCronStatus();
    // Refresh every 60 seconds
    const interval = setInterval(fetchCronStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchCronStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cron-status');
      const result = await response.json();
      if (result.success) {
        setData(result);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch cron status:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatLastRun = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
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
      hour12: true,
    }).replace(',', ' @');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-[#238636]" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-[#da3633]" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-[#8b949e]" />;
      default:
        return <AlertCircle className="w-4 h-4 text-[#d29922]" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-[#238636]/20 text-[#238636] rounded-full">
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-[#da3633]/20 text-[#da3633] rounded-full">
            Failed
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-[#8b949e]/20 text-[#8b949e] rounded-full">
            Pending
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-[#d29922]/20 text-[#d29922] rounded-full">
            Unknown
          </span>
        );
    }
  };

  const summary = data?.summary;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Clock className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Daily Crons</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {summary ? `${summary.active} active • ${summary.completed} completed today` : 'Loading...'}
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
          onClick={fetchCronStatus}
          disabled={loading}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh cron status"
        >
          <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-[#0d1117] rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{summary.total}</p>
            <p className="text-[10px] text-[#8b949e]">Total</p>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-[#238636]">{summary.completed}</p>
            <p className="text-[10px] text-[#8b949e]">Done</p>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-[#da3633]">{summary.failed}</p>
            <p className="text-[10px] text-[#8b949e]">Failed</p>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-[#8b949e]">{summary.pending}</p>
            <p className="text-[10px] text-[#8b949e]">Pending</p>
          </div>
        </div>
      )}

      {/* Cron Jobs List */}
      {loading && !data ? (
        <div className="text-center py-8 text-[#8b949e]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
          Loading cron jobs...
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {data?.crons.map((cron) => (
            <div
              key={cron.id}
              className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(cron.lastStatus)}
                  <span className="font-medium text-white text-sm">{cron.name}</span>
                </div>
                {getStatusBadge(cron.lastStatus)}
              </div>
              
              <div className="flex items-center gap-4 text-xs text-[#8b949e] mt-2">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{cron.schedule}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  <span>{cron.frequency}</span>
                </div>
              </div>
              
              {cron.lastRun && (
                <p className="text-[10px] text-[#8b949e] mt-1">
                  Last run: {formatLastRun(cron.lastRun)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[#30363d]">
        <p className="text-[10px] text-[#8b949e] text-center">
          Auto-refreshes every 60 seconds • Times shown in EST
        </p>
      </div>
    </div>
  );
}
