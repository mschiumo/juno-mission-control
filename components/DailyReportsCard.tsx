'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle, FileText, X, Eye } from 'lucide-react';

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
  const [selectedReport, setSelectedReport] = useState<CronResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch cron jobs and reports in parallel
      const [jobsRes, reportsRes] = await Promise.all([
        fetch('/api/cron-status'),
        fetch('/api/cron-results')
      ]);

      const jobsData = await jobsRes.json();
      const reportsData = await reportsRes.json();

      if (jobsData.success) {
        setJobs(jobsData.data);
      }
      if (reportsData.success) {
        setReports(reportsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openReport = async (jobName: string) => {
    // Find the latest report for this job
    const report = reports
      .filter(r => r.jobName === jobName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (report) {
      setSelectedReport(report);
      setModalOpen(true);
    } else {
      // Show placeholder if no report available
      setSelectedReport({
        id: 'placeholder',
        jobName: jobName,
        timestamp: new Date().toISOString(),
        content: `No report available yet for "${jobName}".\n\nReports appear here after the job runs.`,
        type: 'info'
      });
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
    return reports.some(r => r.jobName === jobName);
  };

  const getLatestReportTime = (jobName: string) => {
    const report = reports
      .filter(r => r.jobName === jobName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    return report ? report.timestamp : null;
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

  // Sort jobs: those with reports first, then by schedule time
  // Exclude Daily Motivational (shown in banner instead)
  const sortedJobs = [...jobs]
    .filter(job => job.name !== 'Daily Motivational Message')
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
              <p className="text-xs text-[#8b949e]">
                {reports.length} report{reports.length !== 1 ? 's' : ''} today
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-4 text-[#8b949e]">Loading...</div>
          ) : (
            sortedJobs.map((job) => {
              const jobHasReport = hasReport(job.name);
              return (
                <button
                  key={job.id}
                  onClick={() => openReport(job.name)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                    jobHasReport 
                      ? 'bg-[#0d1117] border-[#ff6b35]/50 hover:border-[#ff6b35]' 
                      : 'bg-[#0d1117]/50 border-[#30363d] hover:border-[#8b949e]'
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
