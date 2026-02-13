'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle, FileText, X } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<CronResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const openReport = async (jobName: string) => {
    try {
      const response = await fetch(`/api/cron-results?jobName=${encodeURIComponent(jobName)}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedReport(data.data);
        setModalOpen(true);
      } else {
        // Show placeholder if no report available
        setSelectedReport({
          id: 'placeholder',
          jobName: jobName,
          timestamp: new Date().toISOString(),
          content: `No report available yet for ${jobName}.\n\nReports are generated when the job runs.`,
          type: 'info'
        });
        setModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
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

  const formatSchedule = (schedule: string) => {
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
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
              <FileText className="w-5 h-5 text-[#ff6b35]" />
            </div>
            <h2 className="text-lg font-semibold text-white">Daily Reports</h2>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-4 text-[#8b949e]">Loading...</div>
          ) : (
            jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => openReport(job.name)}
                className="w-full flex items-center justify-between p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <span className="font-medium text-white truncate">{job.name}</span>
                  </div>
                  <div className="text-xs text-[#8b949e] mt-1">
                    {formatSchedule(job.schedule)} • {formatLastRun(job.lastRun)}
                  </div>
                </div>
                <FileText className="w-4 h-4 text-[#8b949e] ml-3" />
              </button>
            ))
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
