'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle, FileText, X, Eye, RefreshCw, AlertTriangle } from 'lucide-react';
import cronParser from 'cron-parser';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  cronExpression?: string;
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

// Job status type
 type JobStatus = 'completed' | 'failed' | 'pending' | 'overdue';

export default function DailyReportsCard() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [reports, setReports] = useState<CronResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedReport, setSelectedReport] = useState<CronResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
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

  // Map of cron job display names to possible report jobNames
  const JOB_NAME_MAP: Record<string, string[]> = {
    'London Session Update': ['London Session Update', 'London Session Open Update'],
    'Nightly Task Approval': ['Nightly Task Approval', 'Nightly Task Approval Request'],
    'Asia Session Update': ['Asia Session Update', 'Asia Session Open Update'],
    'Gap Scanner Pre-Market': ['Gap Scanner Pre-Market', 'Gap Scanner Monday Test'],
    'Morning Market Briefing': ['Morning Market Briefing'],
    'Market Close Report': ['Market Close Report'],
    'Weekly Habit Review': ['Weekly Habit Review'],
    'Daily Token Usage Summary': ['Daily Token Usage Summary'],
  };

  const getReportForJob = (jobName: string): CronResult | null => {
    const possibleNames = JOB_NAME_MAP[jobName] || [jobName];
    return reports
      .filter(r => possibleNames.includes(r.jobName))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] || null;
  };

  const getScheduledTimeToday = (job: CronJob): { time: Date | null; isFuture: boolean } => {
    try {
      const cronSchedule = job.cronExpression || job.schedule;
      const interval = cronParser.parse(cronSchedule, {
        tz: 'America/New_York',
        currentDate: new Date()
      });
      
      // Get both next and prev to determine if job is today
      const nextTime = interval.next().toDate();
      const prevTime = interval.prev().toDate();
      const now = new Date();
      
      // If next occurrence is within 24h, it's a future job for today
      const hoursUntilNext = (nextTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursUntilNext <= 24 && hoursUntilNext > 0) {
        return { time: nextTime, isFuture: true };
      }
      
      // Otherwise use prev (job already passed today)
      return { time: prevTime, isFuture: false };
    } catch (error) {
      return { time: null, isFuture: false };
    }
  };

  const getJobStatus = (job: CronJob): { status: JobStatus; time: string | null; message: string } => {
    const report = getReportForJob(job.name);
    const { time: scheduledTime, isFuture } = getScheduledTimeToday(job);
    const now = new Date();
    
    // If has report from today
    if (report) {
      const reportDate = new Date(report.timestamp);
      const isToday = reportDate.toDateString() === now.toDateString();
      
      if (isToday) {
        // Check if report indicates failure
        if (report.type === 'error' || report.content?.includes('FAILED') || report.content?.includes('❌')) {
          return { 
            status: 'failed', 
            time: formatTime(reportDate),
            message: `Failed at ${formatTime(reportDate)}`
          };
        }
        return { 
          status: 'completed', 
          time: formatTime(reportDate),
          message: `${formatTime(reportDate)} — Click to view`
        };
      }
    }
    
    // Check job status based on scheduled time
    if (scheduledTime) {
      if (isFuture) {
        // Job is scheduled for later today
        return { 
          status: 'pending', 
          time: formatTime(scheduledTime),
          message: `Scheduled for ${formatTime(scheduledTime)}`
        };
      }
      
      // Job was scheduled earlier today
      const timeDiff = now.getTime() - scheduledTime.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      
      if (hoursDiff > 1) {
        return { 
          status: 'overdue', 
          time: formatTime(scheduledTime),
          message: `Overdue — should have run at ${formatTime(scheduledTime)}`
        };
      }
      
      return { 
        status: 'pending', 
        time: formatTime(scheduledTime),
        message: `Scheduled for ${formatTime(scheduledTime)}`
      };
    }
    
    return { status: 'pending', time: null, message: 'Scheduled' };
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const openReport = (jobName: string) => {
    const report = getReportForJob(jobName);
    if (report) {
      setSelectedReport(report);
      setModalOpen(true);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedReport(null);
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[#238636]/20 text-[#238636] rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Done
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[#da3633]/20 text-[#da3633] rounded-full text-xs font-medium">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
      case 'overdue':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[#d29922]/20 text-[#d29922] rounded-full text-xs font-medium">
            <AlertTriangle className="w-3 h-3" />
            Overdue
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[#8b949e]/20 text-[#8b949e] rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).replace(',', ' @');
  };

  // Sort jobs: completed first (by time), then failed/overdue, then pending
  const sortedJobs = [...jobs]
    .filter(job => job.name !== 'Daily Motivational' 
      && job.name !== 'Daily Motivational Message'
      && job.name !== 'Mid-Day Trading Check-in'
      && job.name !== 'Post-Market Trading Review'
      && job.name !== 'Evening Habit Check-in'
      && job.name !== 'GitHub PR Monitor')
    .sort((a, b) => {
      const aStatus = getJobStatus(a);
      const bStatus = getJobStatus(b);
      
      // Priority: completed > failed > overdue > pending
      const priority = { completed: 0, failed: 1, overdue: 2, pending: 3 };
      if (priority[aStatus.status] !== priority[bStatus.status]) {
        return priority[aStatus.status] - priority[bStatus.status];
      }
      
      // Same status - sort by time
      if (aStatus.time && bStatus.time) {
        return new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime();
      }
      return 0;
    });

  // Calculate summary
  const completedCount = sortedJobs.filter(j => getJobStatus(j).status === 'completed').length;
  const failedCount = sortedJobs.filter(j => {
    const s = getJobStatus(j).status;
    return s === 'failed' || s === 'overdue';
  }).length;

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
              <FileText className="w-5 h-5 text-[#ff6b35]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Daily Reports</h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#8b949e]">
                  {completedCount} done • {failedCount} issues
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
            className="pill p-2"
            title="Refresh reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Status Summary */}
        <div className="flex gap-2 mb-5">
          {failedCount > 0 && (
            <div className="flex-1 p-3 bg-[#da3633]/10 border border-[#da3633]/30 rounded-xl">
              <p className="text-xs text-[#da3633] font-medium">⚠️ {failedCount} job{failedCount !== 1 ? 's' : ''} need attention</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {loading && reports.length === 0 ? (
            <div className="text-center py-8 text-[#8b949e]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
              <p className="text-sm">Loading reports...</p>
            </div>
          ) : (
            sortedJobs.map((job) => {
              const { status, message } = getJobStatus(job);
              const canClick = status === 'completed';
              
              return (
                <div key={job.id}>
                  <button
                    onClick={() => canClick && openReport(job.name)}
                    disabled={!canClick}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                      canClick 
                        ? 'bg-[#0d1117] border-[#30363d] hover:border-[#ff6b35] cursor-pointer' 
                        : status === 'failed' || status === 'overdue'
                          ? 'bg-[#da3633]/5 border-[#da3633]/30'
                          : 'bg-[#0d1117]/50 border-[#30363d]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm truncate ${canClick ? 'text-white' : 'text-[#8b949e]'}`}>
                          {job.name}
                        </span>
                        {getStatusBadge(status)}
                      </div>
                      <div className={`text-xs mt-1 ${
                        status === 'failed' || status === 'overdue' ? 'text-[#da3633]' : 'text-[#8b949e]'
                      }`}>
                        {message}
                      </div>
                    </div>
                    {canClick && (
                      <Eye className="w-4 h-4 text-[#ff6b35] ml-3" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Report Modal */}
      {modalOpen && selectedReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#30363d]">
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
              <button onClick={closeModal} className="pill p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <pre className="whitespace-pre-wrap text-sm text-[#e6edf3] font-sans leading-relaxed">
                {selectedReport.content}
              </pre>
            </div>

            <div className="p-5 border-t border-[#30363d] flex justify-end">
              <button onClick={closeModal} className="pill pill-primary px-5 py-2">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
