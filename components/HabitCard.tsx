'use client';

import { useState, useEffect } from 'react';
import { Activity, Check, Flame, Target, RefreshCw, Plus, TrendingUp } from 'lucide-react';

interface Habit {
  id: string;
  name: string;
  icon: string;
  streak: number;
  completedToday: boolean;
  target: string;
  category: string;
  history: boolean[];
}

interface HabitStats {
  totalHabits: number;
  completedToday: number;
  longestStreak: number;
  weeklyCompletion: number;
}

export default function HabitCard() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState<HabitStats>({
    totalHabits: 0,
    completedToday: 0,
    longestStreak: 0,
    weeklyCompletion: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchHabits();
    const interval = setInterval(fetchHabits, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchHabits = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/habit-status');
      const data = await response.json();
      if (data.success) {
        setHabits(data.data.habits);
        setStats(data.data.stats);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch habits:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleHabit = async (habitId: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    
    const newCompletedState = !habit.completedToday;
    
    const updatedHabits = habits.map(h => 
      h.id === habitId 
        ? { ...h, completedToday: newCompletedState }
        : h
    );
    setHabits(updatedHabits);
    
    const completedToday = updatedHabits.filter(h => h.completedToday).length;
    const totalHabits = updatedHabits.length;
    const longestStreak = Math.max(...updatedHabits.map(h => h.streak), 0);
    
    const totalPossibleCompletions = totalHabits * 7;
    const actualCompletions = updatedHabits.reduce((acc, h) => 
      acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
    );
    const weeklyCompletion = totalPossibleCompletions > 0 
      ? Math.round((actualCompletions / totalPossibleCompletions) * 100)
      : 0;
    
    setStats({ totalHabits, completedToday, longestStreak, weeklyCompletion });
    
    try {
      await fetch('/api/habit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, completed: newCompletedState })
      });
    } catch (error) {
      console.error('Failed to persist habit:', error);
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(',', ' @');
  };

  const completionRate = stats.totalHabits > 0 
    ? Math.round((stats.completedToday / stats.totalHabits) * 100) 
    : 0;

  const getDayLabels = () => {
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const today = new Date().getDay();
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const dayIndex = (today - i + 7) % 7;
      labels.push(days[dayIndex]);
    }
    return labels;
  };

  const dayLabels = getDayLabels();

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Habits</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {stats.completedToday} of {stats.totalHabits} completed today
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
          onClick={fetchHabits}
          disabled={loading}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { value: `${completionRate}%`, label: 'Today' },
          { value: stats.longestStreak, label: 'Best Streak' },
          { value: `${stats.weeklyCompletion}%`, label: 'This Week' },
          { value: habits.length, label: 'Total' }
        ].map((stat, i) => (
          <div key={i} className="bg-[#0d1117] rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-[#ff6b35]">{stat.value}</div>
            <div className="text-[10px] text-[#8b949e] uppercase">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly Progress */}
      {habits.length > 0 && !loading && (
        <div className="mb-5 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#8b949e]" />
              <span className="text-xs text-[#8b949e]">Weekly Progress</span>
            </div>
            <span className="text-xs text-[#238636] font-medium">{stats.weeklyCompletion}% avg</span>
          </div>
          <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#ff6b35] to-[#238636]"
              style={{ width: `${stats.weeklyCompletion}%` }}
            />
          </div>
        </div>
      )}

      {/* Habits List - Flat */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {loading && habits.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p>Loading habits...</p>
          </div>
        ) : habits.length === 0 ? (
          <div className="text-center py-10">
            <Activity className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e] mb-2">No habits configured</p>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#ff6b35]/10 text-[#ff6b35] rounded-lg text-sm">
              <Plus className="w-4 h-4" />
              Add Your First Habit
            </button>
          </div>
        ) : (
          habits.map((habit) => (
            <div
              key={habit.id}
              className={`p-3 rounded-lg border transition-all ${
                habit.completedToday
                  ? 'bg-[#238636]/10 border-[#238636]/30'
                  : 'bg-[#0d1117] border-[#30363d] hover:border-[#ff6b35]/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleHabit(habit.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                    habit.completedToday
                      ? 'bg-[#238636] border-[#238636]'
                      : 'border-[#8b949e] hover:border-[#ff6b35]'
                  }`}
                >
                  {habit.completedToday && <Check className="w-4 h-4 text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{habit.icon}</span>
                    <span className={`font-medium truncate ${habit.completedToday ? 'text-[#8b949e] line-through' : 'text-white'}`}>
                      {habit.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      <Flame className={`w-3 h-3 ${habit.streak > 0 ? 'text-[#ff6b35]' : 'text-[#8b949e]'}`} />
                      <span className={`text-xs ${habit.streak > 0 ? 'text-[#ff6b35]' : 'text-[#8b949e]'}`}>
                        {habit.streak} day{habit.streak !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-[#8b949e]">{habit.target}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {habit.history.map((completed, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full ${completed ? 'bg-[#238636]' : 'bg-[#30363d]'}`}
                      title={dayLabels[idx]}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Legend */}
      {habits.length > 0 && !loading && (
        <div className="mt-4 pt-3 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#8b949e] uppercase">Last 7 Days</span>
              <div className="flex items-center gap-1">
                {dayLabels.map((day, i) => (
                  <span key={i} className="text-[10px] text-[#8b949e] w-2 text-center">{day}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#8b949e]">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#238636]" /><span>Done</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#30363d]" /><span>Missed</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
