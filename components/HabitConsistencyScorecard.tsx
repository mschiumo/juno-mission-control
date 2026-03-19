'use client';

import { useState, useEffect } from 'react';
import { 
  Flame, 
  Trophy, 
  Target, 
  TrendingUp, 
  Calendar,
  CheckCircle,
  XCircle,
  Award,
  Star,
  Zap,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  completedDays: number;
  totalDays: number;
  records: { date: string; completed: boolean }[];
}

interface ConsistencyData {
  habits: Habit[];
  overallStats: {
    totalHabits: number;
    totalCompletions: number;
    possibleCompletions: number;
    overallRate: number;
    bestStreak: number;
  };
  period: string;
  dateRange: { startDate: string; endDate: string };
}

export default function HabitConsistencyScorecard() {
  const [data, setData] = useState<ConsistencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const [selectedHabit, setSelectedHabit] = useState<string | null>(null);

  useEffect(() => {
    fetchConsistencyData();
  }, [period]);

  const fetchConsistencyData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/habits/consistency?period=${period}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setData(result.data);
        }
      }
    } catch (error) {
      console.error('Error fetching habits:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 animate-pulse">
        <div className="h-8 bg-[#30363d] rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-[#30363d] rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <p className="text-[#8b949e]">Failed to load habit data</p>
      </div>
    );
  }

  const { habits, overallStats } = data;

  // Calculate points and level
  const points = overallStats.totalCompletions * 10 + overallStats.bestStreak * 50;
  const level = Math.floor(points / 500) + 1;
  const pointsToNext = 500 - (points % 500);

  // Get streak badges
  const getStreakBadge = (streak: number) => {
    if (streak >= 30) return { name: 'Legendary', color: '#fbbf24', icon: Trophy };
    if (streak >= 14) return { name: 'Epic', color: '#a855f7', icon: Star };
    if (streak >= 7) return { name: 'Hot Streak', color: '#f97316', icon: Flame };
    if (streak >= 3) return { name: 'Building', color: '#22c55e', icon: TrendingUp };
    return { name: 'Starting', color: '#6b7280', icon: Target };
  };

  // Get completion message
  const getCompletionMessage = (rate: number) => {
    if (rate >= 90) return 'Incredible! You\'re crushing it! 🔥';
    if (rate >= 75) return 'Great job! Keep the momentum going! 💪';
    if (rate >= 50) return 'Good progress! You\'re building consistency 📈';
    return 'Every day is a new chance to improve! 🌟';
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-[#fbbf24]" />
            Consistency Scorecard
          </h2>
          <p className="text-sm text-[#8b949e] mt-1">Track your habits, build your streaks</p>
        </div>
        
        <div className="flex items-center gap-2">
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-[#F97316] text-white'
                  : 'bg-[#0d1117] text-[#8b949e] hover:text-white border border-[#30363d]'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Level Progress */}
      <div className="bg-gradient-to-r from-[#F97316]/20 to-[#fbbf24]/20 border border-[#F97316]/30 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F97316] to-[#fbbf24] flex items-center justify-center text-white font-bold text-lg">
              {level}
            </div>
            <div>
              <p className="text-white font-semibold">Level {level}</p>
              <p className="text-xs text-[#8b949e]">{points.toLocaleString()} XP earned</p>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-[#F97316] font-semibold">{pointsToNext} XP</p>
            <p className="text-xs text-[#8b949e]">to Level {level + 1}</p>
          </div>
        </div>
        
        <div className="w-full bg-[#0d1117] rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-[#F97316] to-[#fbbf24] h-2 rounded-full transition-all"
            style={{ width: `${((500 - pointsToNext) / 500) * 100}%` }}
          />
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-[#22c55e]" />
            <span className="text-xs text-[#8b949e]">Overall Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">{overallStats.overallRate}%</p>
        </div>
        
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-[#3b82f6]" />
            <span className="text-xs text-[#8b949e]">Completed</span>
          </div>
          <p className="text-2xl font-bold text-white">{overallStats.totalCompletions}</p>
        </div>
        
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-[#f97316]" />
            <span className="text-xs text-[#8b949e]">Best Streak</span>
          </div>
          <p className="text-2xl font-bold text-white">{overallStats.bestStreak}d</p>
        </div>
        
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-[#fbbf24]" />
            <span className="text-xs text-[#8b949e]">Habits</span>
          </div>
          <p className="text-2xl font-bold text-white">{overallStats.totalHabits}</p>
        </div>
      </div>

      {/* Motivational Message */}
      <div className="bg-[#238636]/10 border border-[#238636]/30 rounded-lg p-4 mb-6">
        <p className="text-center text-[#238636] font-medium">
          {getCompletionMessage(overallStats.overallRate)}
        </p>
      </div>

      {/* Individual Habit Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-[#fbbf24]" />
          Your Habits
        </h3>
        
        {habits.map((habit) => {
          const badge = getStreakBadge(habit.currentStreak);
          const BadgeIcon = badge.icon;
          const isSelected = selectedHabit === habit.id;
          
          return (
            <div 
              key={habit.id}
              className={`bg-[#0d1117] border rounded-xl overflow-hidden transition-all ${
                isSelected ? 'border-[#F97316]' : 'border-[#30363d]'
              }`}
            >
              <div 
                className="p-4 cursor-pointer"
                onClick={() => setSelectedHabit(isSelected ? null : habit.id)}
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${habit.color}20` }}
                  >
                    {habit.emoji}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{habit.name}</p>
                      <span 
                        className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                        style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                      >
                        <BadgeIcon className="w-3 h-3" />
                        {badge.name}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#8b949e]">{habit.completionRate}% completion</span>
                          <span className="text-white">{habit.completedDays}/{habit.totalDays} days</span>
                        </div>
                        <div className="w-full bg-[#30363d] rounded-full h-2">
                          <div 
                            className="h-2 rounded-full transition-all"
                            style={{ 
                              width: `${habit.completionRate}%`,
                              backgroundColor: habit.color
                            }}
                          />
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Flame className="w-4 h-4 text-[#f97316]" />
                          <span className="text-white font-bold">{habit.currentStreak}</span>
                        </div>
                        <p className="text-xs text-[#8b949e]">day streak</p>
                      </div>
                    </div>
                  </div>
                  
                  <{isSelected ? ChevronLeft : ChevronRight} className="w-5 h-5 text-[#8b949e] rotate-90" />
                </div>
              </div>
              
              {/* Expanded Detail View */}
              {isSelected && (
                <div className="border-t border-[#30363d] p-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-[#161b22] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-white">{habit.currentStreak}</p>
                      <p className="text-xs text-[#8b949e]">Current Streak</p>
                    </div>
                    <div className="bg-[#161b22] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-white">{habit.longestStreak}</p>
                      <p className="text-xs text-[#8b949e]">Best Streak</p>
                    </div>
                    <div className="bg-[#161b22] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-white">{habit.completionRate}%</p>
                      <p className="text-xs text-[#8b949e]">Success Rate</p>
                    </div>
                  </div>
                  
                  <p className="text-xs text-[#8b949e] mb-2">Last 7 days:</p>
                  <div className="flex gap-1">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() - (6 - i));
                      const dateStr = date.toISOString().split('T')[0];
                      const record = habit.records.find(r => r.date === dateStr);
                      const completed = record?.completed;
                      
                      return (
                        <div
                          key={i}
                          className={`flex-1 h-8 rounded flex items-center justify-center ${
                            completed
                              ? 'bg-[#238636]'
                              : 'bg-[#30363d]'
                          }`}
                          title={dateStr}
                        >
                          {completed ? (
                            <CheckCircle className="w-4 h-4 text-white" />
                          ) : (
                            <XCircle className="w-4 h-4 text-[#8b949e]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gamification Tips */}
      <div className="mt-6 bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#8b949e] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium mb-1">Pro Tip</p>
            <p className="text-xs text-[#8b949e]">
              Build momentum by focusing on one habit at a time. A 7-day streak on one habit 
              is better than inconsistent effort on five. Small wins compound into big results!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
