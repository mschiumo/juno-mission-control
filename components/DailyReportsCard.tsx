'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle, FileText, X, Eye, RefreshCw } from 'lucide-react';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  status: 'active' | 'completed' | 'paused' | 'error';
  description: string;
}

interface CronResult {
  id: string;
  jobName: string;
  timestamp: string;
  content: string;
  type: string;
}

export default function DailyReportsCard() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [reports, setReports] = useState<CronResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedReport, setSelectedReport] = useState<CronResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch cron jobs and reports in parallel
      const [jobsRes, reportsRes] = await Promise.all([
        fetch('/api/cron-status'),
        fetch('/api/cron-results')
      ]);

      const jobsData = await jobsRes.json();
      const reportsData = await reportsRes.json();

      if (jobsData.success) {
        setJobs(jobsData.crons || []);
      }
      if (reportsData.success) {
        // Sort reports by timestamp (newest first)
        const sortedReports = (reportsData.data || []).sort((a: CronResult, b: CronResult) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setReports(sortedReports);
      }
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openReport = async (jobName: string) => {
    // Handle name mismatches between cron-status and cron-results
    const normalizedJobName = jobName === 'Nightly Task Approval' 
      ? 'Nightly Task Approval Request' 
      : jobName;
    // Only open if report exists
    const report = reports
      .filter(r => r.jobName === jobName || r.jobName === normalizedJobName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (report) {
      setSelectedReport(report);
      setModalOpen(true);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedReport(null);
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
        return <Clock className="w-4 h-4 text-[#d29922]" />;
    }
  };

  const hasReport = (jobName: string) => {
    // Handle name mismatches between cron-status and cron-results
    const normalizedJobName = jobName === 'Nightly Task Approval' 
      ? 'Nightly Task Approval Request' 
      : jobName;
    return reports.some(r => r.jobName === jobName || r.jobName === normalizedJobName);
  };

  const getLatestReportTime = (jobName: string) => {
    // Handle name mismatches between cron-status and cron-results
    const normalizedJobName = jobName === 'Nightly Task Approval' 
      ? 'Nightly Task Approval Request' 
      : jobName;
    const report = reports
      .filter(r => r.jobName === jobName || r.jobName === normalizedJobName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    return report ? report.timestamp : null;
  };

  const getNextScheduledTime = (schedule: string) => {
    // Parse cron schedule and calculate next run
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    // Simple parsing for common schedules
    if (schedule === '0 23 * * *') {
      // Daily at 11 PM
      const next = new Date(estNow);
      next.setHours(23, 0, 0, 0);
      if (estNow > next) next.setDate(next.getDate() + 1);
      return next.toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    if (schedule === '0 20 * * *') {
      // Daily at 8 PM
      const next = new Date(estNow);
      next.setHours(20, 0, 0, 0);
      if (estNow > next) next.setDate(next.getDate() + 1);
      return next.toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    if (schedule === '0 0 * * 0-4') {
      // Weekdays at 12 AM
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const next = new Date(estNow);
      next.setHours(0, 0, 0, 0);
      if (estNow > next || next.getDay() > 4) {
        // Find next weekday
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() > 4);
      }
      return `${days[next.getDay()]} at 12:00 AM`;
    }
    if (schedule === '0 3 * * 0-4') {
      // Weekdays at 3 AM
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const next = new Date(estNow);
      next.setHours(3, 0, 0, 0);
      if (estNow > next || next.getDay() > 4) {
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() > 4);
      }
      return `${days[next.getDay()]} at 3:00 AM`;
    }
    if (schedule === '0 13 * * 0-4') {
      // Weekdays at 1 PM UTC = 8 AM EST
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const next = new Date(estNow);
      next.setHours(8, 0, 0, 0);
      if (estNow > next || next.getDay() > 4 || next.getDay() === 0) {
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() > 5 || next.getDay() === 0);
      }
      return `${days[next.getDay()]} at 8:00 AM`;
    }
    if (schedule === '30 21 * * 0-4') {
      // Weekdays at 9:30 PM UTC = 4:30 PM EST
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const next = new Date(estNow);
      next.setHours(16, 30, 0, 0);
      if (estNow > next || next.getDay() > 4 || next.getDay() === 0) {
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() > 5 || next.getDay() === 0);
      }
      return `${days[next.getDay()]} at 4:30 PM`;
    }
    return 'Scheduled';
  };

  const formatSchedule = (schedule: string) => {
    if (schedule === '0 8 * * *') return 'Daily at 8:00 AM';
    if (schedule === '0 0 * * *') return 'Daily at 12:00 AM';
    if (schedule === '0 7 * * *') return 'Daily at 7:00 AM';
    if (schedule === '30 7 * * *') return 'Daily at 7:30 AM';
    if (schedule === '30 12 * * *') return 'Daily at 12:30 PM';
    if (schedule === '0 17 * * 1-5') return 'Weekdays at 5:00 PM';
    if (schedule === '0 20 * * *') return 'Daily at 8:00 PM';
    if (schedule === '0 22 * * *') return 'Daily at 10:00 PM';
    if (schedule === '30 22 * * *') return 'Daily at 10:30 PM';
    if (schedule === '0 23 * * *') return 'Daily at 11:00 PM';
    if (schedule === '30 23 * * *') return 'Daily at 11:30 PM';
    if (schedule === '0 19 * * 5') return 'Fridays at 7:00 PM';
    if (schedule === '0 9,12,16 * * 1-5') return 'Weekdays at 9AM, 12PM, 4PM';
    if (schedule === '0 2 * * *') return 'Daily at 2:00 AM';
    if (schedule === '*/30 * * * *') return 'Every 30 minutes';
    return schedule;
  };

  const formatLastRun = (date: string, jobName: string) => {
    // Use report timestamp if available
    const reportTime = getLatestReportTime(jobName);
    const d = new Date(reportTime || date);
    const now = new Date();
    
    const dEST = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const nowEST = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    const diff = nowEST.getTime() - dEST.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
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

  // Sort jobs: those with reports first, then by schedule time
  // Exclude jobs that are shown elsewhere: Daily Motivational (banner), Mid-Day/Post-Market (Telegram only), GitHub PR Monitor (internal)
  const sortedJobs = [...jobs]
    .filter(job => job.name !== 'Daily Motivational' 
      && job.name !== 'Daily Motivational Message'
      && job.name !== 'Mid-Day Trading Check-in'
      && job.name !== 'Post-Market Trading Review'
      && job.name !== 'GitHub PR Monitor')
    .sort((a, b) => {
      const aHasReport = hasReport(a.name);
      const bHasReport = hasReport(b.name);
      if (aHasReport && !bHasReport) return -1;
      if (!aHasReport && bHasReport) return 1;
      return 0;
    });

  return (
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
              <FileText className="w-5 h-5 text-[#ff6b35]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Daily Reports</h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#8b949e]">
                  {reports.filter(r => sortedJobs.some(j => j.name === r.jobName)).length} of {sortedJobs.length} available
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
            onClick={fetchData}
            disabled={loading}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Refresh reports"
          >
            <RefreshCw className={`w-5 h-5 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-2">
          {loading && reports.length === 0 ? (
            <div className="text-center py-4 text-[#8b949e]">Loading...</div>
          ) : (
            sortedJobs.map((job) => {
              const jobHasReport = hasReport(job.name);
              const nextScheduled = getNextScheduledTime(job.schedule);
              return (
                <div
                  key={job.id}
                  className="relative"
                  onMouseEnter={() => setHoveredJob(job.name)}
                  onMouseLeave={() => setHoveredJob(null)}
                >
                  <button
                    onClick={() => jobHasReport && openReport(job.name)}
                    disabled={!jobHasReport}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                      jobHasReport 
                        ? 'bg-[#0d1117] border-[#ff6b35]/50 hover:border-[#ff6b35] cursor-pointer' 
                        : 'bg-[#0d1117]/50 border-[#30363d] cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <span className={`font-medium truncate ${jobHasReport ? 'text-white' : 'text-[#8b949e]'}`}>
                          {job.name}
                        </span>
                        {jobHasReport && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#238636]/20 text-[#238636] rounded-full">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#8b949e] mt-1">
                        {formatSchedule(job.schedule)} • {formatLastRun(job.lastRun, job.name)}
                      </div>
                    </div>
                    {jobHasReport ? (
                      <Eye className="w-4 h-4 text-[#ff6b35] ml-3" />
                    ) : (
                      <FileText className="w-4 h-4 text-[#8b949e]/50 ml-3" />
                    )}
                  </button>
                  
                  {/* Tooltip for unavailable reports */}
                  {!jobHasReport && hoveredJob === job.name && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 p-2 bg-[#0d1117] border border-[#ff6b35] rounded-lg shadow-lg">
                      <p className="text-xs text-[#8b949e]">
                        <span className="text-[#ff6b35] font-medium">{job.name}</span> not currently available.
                      </p>
                      <p className="text-xs text-[#8b949e] mt-1">
                        Next report at <span className="text-white">{nextScheduled}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Report Modal */}
      {modalOpen && selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedReport.jobName}</h3>
                <p className="text-xs text-[#8b949e]">
                  {new Date(selectedReport.timestamp).toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} EST
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <pre className="whitespace-pre-wrap text-sm text-[#e6edf3] font-sans leading-relaxed">
                {selectedReport.content}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#30363d] flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-[#ff6b35] hover:bg-[#ff8c5a] text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
