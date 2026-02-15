'use client';

import { useState, useEffect } from 'react';
import { Moon, Check, X, Save, TrendingUp, Calendar, StickyNote } from 'lucide-react';

interface Question {
  id: string;
  question: string;
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
  const [responses, setResponses] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('checkin');

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
        // Pre-fill if already submitted today
        if (result.data.todayCheckin) {
          setResponses(result.data.todayCheckin.responses || {});
          setNotes(result.data.todayCheckin.notes || '');
        }
      }
    } catch (error) {
      console.error('Failed to fetch checkin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = (questionId: string, value: boolean) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/evening-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses, notes })
      });
      
      if (response.ok) {
        fetchData(); // Refresh stats
        onClose(); // Close modal immediately
        onSuccess?.(); // Trigger success notification
      }
    } catch (error) {
      console.error('Failed to save checkin:', error);
    } finally {
      setSaving(false);
    }
  };

  const getCompletionRate = () => {
    if (!data?.questions.length) return 0;
    const answered = Object.keys(responses).length;
    return Math.round((answered / data.questions.length) * 100);
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
                <Moon className="w-6 h-6 text-[#a371f7]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Evening Habit Check-in</h2>
                <p className="text-sm text-[#8b949e]">{new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'short', 
                  day: 'numeric' 
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

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-[#0d1117] p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('checkin')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'checkin'
                  ? 'bg-[#30363d] text-white'
                  : 'text-[#8b949e] hover:text-white'
              }`}
            >
              Daily Check-in
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'stats'
                  ? 'bg-[#30363d] text-white'
                  : 'text-[#8b949e] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Stats & Reports
              </div>
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
          ) : activeTab === 'checkin' ? (
            <div className="space-y-6">
              {/* Progress */}
              <div className="flex items-center justify-between p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                <span className="text-sm text-[#8b949e]">Completion Progress</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-[#21262d] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#a371f7] to-[#ff6b35] transition-all"
                      style={{ width: `${getCompletionRate()}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white w-12 text-right">
                    {getCompletionRate()}%
                  </span>
                </div>
              </div>

              {/* Questions */}
              <div className="space-y-3">
                {data?.questions.map((q) => (
                  <div 
                    key={q.id}
                    className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#484f58] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-white font-medium">{q.question}</p>
                        <span className={`text-xs uppercase tracking-wider ${getCategoryColor(q.category)}`}>
                          {q.category}
                        </span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResponse(q.id, true)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                            responses[q.id] === true
                              ? 'bg-[#238636] text-white'
                              : 'bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                          Yes
                        </button>
                        
                        <button
                          onClick={() => handleResponse(q.id, false)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                            responses[q.id] === false
                              ? 'bg-[#da3633] text-white'
                              : 'bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]'
                          }`}
                        >
                          <X className="w-4 h-4" />
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                <div className="flex items-center gap-2 mb-3">
                  <StickyNote className="w-4 h-4 text-[#8b949e]" />
                  <span className="text-sm text-[#8b949e]">Notes (Optional)</span>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How did today go? Any reflections?"
                  className="w-full h-24 px-4 py-3 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#a371f7] resize-none"
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={saving || Object.keys(responses).length === 0}
                className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  saved
                    ? 'bg-[#238636] text-white'
                    : 'bg-[#a371f7] text-white hover:bg-[#8957e5] disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {saved ? (
                  <>
                    <Check className="w-5 h-5" />
                    Saved!
                  </>
                ) : saving ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {data?.todayCheckin ? 'Update Check-in' : 'Save Check-in'}
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Stats Tab */
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-3xl font-bold text-[#a371f7]">{data?.stats.totalCheckins || 0}</div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">Total Check-ins</div>
                </div>
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-3xl font-bold text-[#ff6b35]">{data?.stats.averageCompletion || 0}%</div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">Avg Completion</div>
                </div>
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] text-center">
                  <div className="text-3xl font-bold text-[#238636]">{data?.stats.streak || 0}</div>
                  <div className="text-xs text-[#8b949e] uppercase mt-1">Day Streak</div>
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
                      <div key={q.id} className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{q.question}</p>
                        </div>
                        <div className="flex items-center gap-3 w-48">
                          <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#238636] rounded-full"
                              style={{ width: `${stat.rate}%` }}
                            />
                          </div>
                          <span className="text-xs text-[#8b949e] w-16 text-right">
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
                          {new Date(checkin.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}