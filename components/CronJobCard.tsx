'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  status: 'active' | 'completed' | 'paused' | 'error';
  description: string;
}

export default function CronJobCard() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  useEffect(() => {
    fetchCronJobs();
    // Refresh every 30 seconds
    const interval = setInterval(fetchCronJobs, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchCronJobs = async () => {
    try {
      const response = await fetch('/api/cron-status');
      const data = await response.json();
      if (data.success) {
        setJobs(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch cron jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const runJob = async (jobId: string) => {
    setRunningJob(jobId);
    try {
      const response = await fetch('/api/run-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      const data = await response.json();
      if (data.success) {
        fetchCronJobs(); // Refresh after running
      }
    } catch (error) {
      console.error('Failed to run job:', error);
    } finally {
      setRunningJob(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-[#238636]" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-[#8b949e]" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-[#da3633]" />;
      default:
        return <Pause className="w-4 h-4 text-[#d29922]" />;
    }
  };

  const formatSchedule = (schedule: string) => {
    // Simple cron format display
    if (schedule === '0 8 * * *') return 'Daily at 8:00 AM';
    if (schedule === '0 9,12,16 * * 1-5') return 'Weekdays at 9AM, 12PM, 4PM';
    if (schedule === '0 18 * * 5') return 'Fridays at 6:00 PM';
    if (schedule === '0 2 * * *') return 'Daily at 2:00 AM';
    if (schedule === '*/30 * * * *') return 'Every 30 minutes';
    return schedule;
  };

  const formatLastRun = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    
    // Convert both to EST for comparison
    const dEST = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const nowEST = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    const diff = nowEST.getTime() - dEST.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Clock className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <h2 className="text-lg font-semibold text-white">Cron Jobs</h2>
        </div>
        <button 
          onClick={fetchCronJobs}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-4 text-[#8b949e]">Loading...</div>
        ) : (
          jobs.map((job) => (
            <div 
              key={job.id}
              className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getStatusIcon(job.status)}
                  <span className="font-medium text-white truncate">{job.name}</span>
                </div>
                <div className="text-xs text-[#8b949e] mt-1">
                  {formatSchedule(job.schedule)} • Last run {formatLastRun(job.lastRun)}
                </div>
              </div>
              <button
                onClick={() => runJob(job.id)}
                disabled={runningJob === job.id}
                className="ml-3 p-2 bg-[#ff6b35]/10 hover:bg-[#ff6b35]/20 text-[#ff6b35] rounded-lg transition-colors disabled:opacity-50"
                title="Run now"
              >
                <Play className={`w-4 h-4 ${runningJob === job.id ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
