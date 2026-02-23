'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, X, TrendingUp, Calendar, Trash2 } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  label: string;
  category: string;
}

interface CheckinData {
  questions: Question[];
  todayCheckin: {
    date: string;
    responses: Record<string, boolean>;
    notes: string;
  } | null;
  history: Array<{
    date: string;
    responses: Record<string, boolean>;
    notes: string;
    completionRate: number;
  }>;
  stats: {
    totalCheckins: number;
    averageCompletion: number;
    streak: number;
    byQuestion: Record<string, { yes: number; no: number; rate: number }>;
  };
}

interface EveningCheckinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EveningCheckinModal({ isOpen, onClose, onSuccess }: EveningCheckinModalProps) {
  const [data, setData] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/evening-checkin');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch checkin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all habit check-in data? This cannot be undone.')) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/evening-checkin/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh data to show cleared state
        await fetchData();
        onSuccess?.();
      } else {
        alert('Failed to reset data: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to reset data:', error);
      alert('Failed to reset data. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'fitness': return 'text-[#ff6b35]';
      case 'learning': return 'text-[#58a6ff]';
      case 'mindfulness': return 'text-[#a371f7]';
      case 'trading': return 'text-[#3fb950]';
      case 'discipline': return 'text-[#d29922]';
      case 'health': return 'text-[#f85149]';
      default: return 'text-[#8b949e]';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#a371f7]/10 rounded-xl">
                <ClipboardList className="w-6 h-6 text-[#a371f7]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Daily Habit Report</h2>
                <p className="text-sm text-[#8b949e]">{new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'short', 
                  day: 'numeric',
                  timeZone: 'America/New_York'
                })}</p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-[#a371f7] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-[#8b949e]">Loading...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-[#a371f7]">{data?.stats.totalCheckins || 0}</div>
                  <div className="text-[9px] sm:text-xs text-[#8b949e] uppercase mt-1 leading-tight">Total</div>
                </div>
                <div className="p-3 sm:p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-[#ff6b35]">{data?.stats.averageCompletion || 0}%</div>
                  <div className="text-[9px] sm:text-xs text-[#8b949e] uppercase mt-1 leading-tight">Avg</div>
                </div>
                <div className="p-3 sm:p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-[#238636]">{data?.stats.streak || 0}</div>
                  <div className="text-[9px] sm:text-xs text-[#8b949e] uppercase mt-1 leading-tight">Streak</div>
                </div>
              </div>

              {/* By Question Stats */}
              <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#8b949e]" />
                  7-Day Performance
                </h3>
                
                <div className="space-y-3">
                  {data?.questions.map((q) => {
                    const stat = data?.stats.byQuestion?.[q.id];
                    if (!stat) return null;

                    return (
                      <div key={q.id} className="flex items-center gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0" title={q.question}>
                          <p className="text-sm text-white truncate">{q.label}</p>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 w-32 sm:w-48 flex-shrink-0">
                          <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#238636] rounded-full"
                              style={{ width: `${stat.rate}%` }}
                            />
                          </div>
                          <span className="text-xs text-[#8b949e] w-12 sm:w-16 text-right">
                            {stat.yes}/{stat.yes + stat.no}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent History */}
              {data?.history && data.history.length > 0 && (
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                  <h3 className="text-sm font-medium text-white mb-4">Recent Check-ins</h3>
                  
                  <div className="space-y-2">
                    {data.history.slice(0, 7).map((checkin) => (
                      <div 
                        key={checkin.date}
                        className="flex items-center justify-between p-3 bg-[#161b22] rounded-lg"
                      >
                        <span className="text-sm text-[#8b949e]">
                          {new Date(checkin.date + 'T12:00:00').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'America/New_York'
                          })}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-white">
                            {checkin.completionRate || 0}%
                          </span>
                          {checkin.notes && (
                            <div className="w-2 h-2 rounded-full bg-[#a371f7]" title="Has notes" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reset Section */}
              <div className="pt-6 mt-6 border-t border-[#30363d]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-white">Reset Data</h4>
                    <p className="text-xs text-[#8b949e]">Clear all habit check-in history</p>
                  </div>
                  <button
                    onClick={handleReset}
                    disabled={isResetting}
                    className="flex items-center gap-2 px-4 py-2 bg-[#f85149]/10 hover:bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className={`w-4 h-4 ${isResetting ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-medium">Reset</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}