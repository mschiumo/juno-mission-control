'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Flame, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  Calendar,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Award,
  Zap
} from 'lucide-react';

interface HabitStats {
  id: string;
  name: string;
  icon: string;
  category: string;
  target: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionRate7d: number;
  completionRate30d: number;
  last7Days: boolean[];
  last30Days: boolean[];
  trend: 'improving' | 'stable' | 'declining';
  missedLast7Days: number;
  missedLast30Days: number;
}

interface HabitReport {
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  summary: {
    totalHabits: number;
    overallCompletionRate7d: number;
    overallCompletionRate30d: number;
    habitsMetTarget: number;
    habitsAtRisk: number;
    habitsDeclining: number;
  };
  habits: HabitStats[];
  insights: {
    bestPerforming: HabitStats[];
    needsAttention: HabitStats[];
    atRisk: HabitStats[];
    recommendations: string[];
  };
  dailyBreakdown: Array<{
    date: string;
    completedCount: number;
    totalCount: number;
    completionRate: number;
  }>;
}

interface HabitsReportProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HabitsReport({ isOpen, onClose }: HabitsReportProps) {
  const [report, setReport] = useState<HabitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHabit, setExpandedHabit] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/habits/report?days=${days}`);
      const data = await response.json();
      
      if (data.success) {
        setReport(data.data);
      } else {
        setError(data.error || 'Failed to load report');
      }
    } catch (err) {
      setError('Network error - please try again');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, fetchReport]);

  if (!isOpen) return null;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'Improving';
      case 'declining':
        return 'Declining';
      default:
        return 'Stable';
    }
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      timeZone: 'America/New_York'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#F97316]/10 rounded-xl">
                <BarChart3 className="w-6 h-6 text-[#F97316]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Habits Report</h2>
                <p className="text-sm text-[#8b949e]">
                  {report?.period.startDate && formatDate(report.period.startDate)} - {report?.period.endDate && formatDate(report.period.endDate)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316]"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              
              <button
                onClick={fetchReport}
                disabled={loading}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-[#F97316] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-[#8b949e]">Loading report...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-[#8b949e]">{error}</p>
              <button
                onClick={fetchReport}
                className="mt-4 px-4 py-2 bg-[#F97316] text-white rounded-lg hover:bg-[#ea580c] transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : report ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl font-bold text-[#F97316]">
                    {report.summary.overallCompletionRate7d}%
                  </div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">7-Day Avg</div>
                </div>
                
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl font-bold text-[#238636]">
                    {report.summary.overallCompletionRate30d}%
                  </div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">30-Day Avg</div>
                </div>
                
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl font-bold text-[#3fb950]">
                    {report.summary.habitsMetTarget}/{report.summary.totalHabits}
                  </div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">Meeting Target</div>
                </div>
                
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {report.summary.habitsAtRisk}
                  </div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">At Risk</div>
                </div>
              </div>

              {/* Recommendations */}
              {report.insights.recommendations.length > 0 && (
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                  <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#F97316]" />
                    Insights & Recommendations
                  </h3>
                  <div className="space-y-2">
                    {report.insights.recommendations.map((rec, i) => (
                      <div key={i} className="text-sm text-[#8b949e]">
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Best Performing */}
              {report.insights.bestPerforming.length > 0 && (
                <div className="p-4 bg-[#238636]/10 rounded-xl border border-[#238636]/30">
                  <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                    <Award className="w-4 h-4 text-[#3fb950]" />
                    Best Performing Habits
                  </h3>
                  <div className="space-y-2">
                    {report.insights.bestPerforming.slice(0, 3).map(habit => (
                      <div key={habit.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{habit.icon}</span>
                          <span className="text-sm text-white">{habit.name}</span>
                          {habit.currentStreak >= 7 && (
                            <div className="flex items-center gap-1 text-orange-400">
                              <Flame className="w-3 h-3" />
                              <span className="text-xs">{habit.currentStreak}d</span>
                            </div>
                          )}
                        </div>
                        <div className="text-sm font-medium text-[#3fb950]">
                          {habit.completionRate7d}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Needs Attention */}
              {report.insights.needsAttention.length > 0 && (
                <div className="p-4 bg-[#f85149]/10 rounded-xl border border-[#f85149]/30">
                  <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#f85149]" />
                    Needs Attention
                  </h3>
                  <div className="space-y-2">
                    {report.insights.needsAttention.map(habit => (
                      <div key={habit.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{habit.icon}</span>
                          <span className="text-sm text-white">{habit.name}</span>
                          {habit.trend === 'declining' && (
                            <span className="text-xs text-red-400"><TrendingDown className="w-3 h-3 inline" /> Declining</span>
                          )}
                        </div>
                        <div className="text-sm font-medium text-[#f85149]">
                          {habit.completionRate7d}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Habits Detailed */}
              <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#8b949e]" />
                  All Habits
                </h3>
                
                <div className="space-y-3">
                  {report.habits
                    .sort((a, b) => b.completionRate7d - a.completionRate7d)
                    .map(habit => (
                      <div 
                        key={habit.id} 
                        className="border border-[#30363d] rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedHabit(
                            expandedHabit === habit.id ? null : habit.id
                          )}
                          className="w-full p-3 flex items-center justify-between hover:bg-[#1c2128] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{habit.icon}</span>
                            <div className="text-left">
                              <div className="text-sm font-medium text-white">{habit.name}</div>
                              <div className="text-xs text-[#8b949e]">{habit.target}</div>
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              {getTrendIcon(habit.trend)}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Flame className="w-4 h-4 text-orange-400" />
                              <span className="text-sm text-white">{habit.currentStreak}</span>
                            </div>
                            <div className="text-sm font-medium text-white w-12 text-right">
                              {habit.completionRate7d}%
                            </div>
                            
                            {expandedHabit === habit.id ? (
                              <ChevronUp className="w-4 h-4 text-[#8b949e]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#8b949e]" />
                            )}
                          </div>
                        </button>
                        
                        {expandedHabit === habit.id && (
                          <div className="p-3 border-t border-[#30363d] bg-[#0d1117]">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div>
                                <div className="text-xs text-[#8b949e]">Current Streak</div>
                                <div className="text-lg font-semibold text-orange-400">
                                  {habit.currentStreak} days
                                </div>
                              </div>
                              
                              <div>
                                <div className="text-xs text-[#8b949e]">Best Streak</div>
                                <div className="text-lg font-semibold text-[#3fb950]">
                                  {habit.longestStreak} days
                                </div>
                              </div>
                              
                              <div>
                                <div className="text-xs text-[#8b949e]">7-Day Rate</div>
                                <div className="text-lg font-semibold text-white">
                                  {habit.completionRate7d}%
                                </div>
                              </div>
                              
                              <div>
                                <div className="text-xs text-[#8b949e]">30-Day Rate</div>
                                <div className="text-lg font-semibold text-white">
                                  {habit.completionRate30d}%
                                </div>
                              </div>
                            </div>
                            
                            {/* Last 7 Days Grid */}
                            <div>
                              <div className="text-xs text-[#8b949e] mb-2">Last 7 Days</div>
                              <div className="flex gap-1">
                                {habit.last7Days.map((completed, i) => (
                                  <div
                                    key={i}
                                    className={`flex-1 h-8 rounded flex items-center justify-center text-xs ${
                                      completed
                                        ? 'bg-[#238636] text-white'
                                        : 'bg-[#30363d] text-[#8b949e]'
                                    }`}
                                    title={`Day ${i + 1}: ${completed ? 'Completed' : 'Missed'}`}
                                  >
                                    {completed ? '✓' : '×'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Daily Breakdown Chart */}
              {report.dailyBreakdown.length > 0 && (
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                  <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#8b949e]" />
                    Daily Completion Rate
                  </h3>
                  
                  <div className="flex items-end gap-1 h-32">
                    {report.dailyBreakdown.slice(-14).map((day) => (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div
                          className={`w-full rounded-t transition-all ${
                            day.completionRate >= 80
                              ? 'bg-[#238636]'
                              : day.completionRate >= 50
                              ? 'bg-[#d29922]'
                              : 'bg-[#f85149]'
                          }`}
                          style={{ height: `${day.completionRate}%` }}
                          title={`${formatDate(day.date)}: ${day.completedCount}/${day.totalCount} (${day.completionRate}%)`}
                        />
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-between mt-2 text-xs text-[#8b949e]">
                    <span>{formatDate(report.dailyBreakdown[report.dailyBreakdown.length - 14]?.date || report.period.startDate)}</span>
                    <span>{formatDate(report.period.endDate)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
