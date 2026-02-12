'use client';

import { useState, useEffect } from 'react';
import { Activity, Check, Flame, Target } from 'lucide-react';

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

  useEffect(() => {
    fetchHabits();
  }, []);

  const fetchHabits = async () => {
    try {
      const response = await fetch('/api/habit-status');
      const data = await response.json();
      if (data.success) {
        setHabits(data.data.habits);
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch habits:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleHabit = async (habitId: string) => {
    // Placeholder: In production, this would update the habit status in the database
    setHabits(habits.map(habit => 
      habit.id === habitId 
        ? { ...habit, completedToday: !habit.completedToday }
        : habit
    ));
  };

  const completionRate = stats.totalHabits > 0 
    ? Math.round((stats.completedToday / stats.totalHabits) * 100) 
    : 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <h2 className="text-lg font-semibold text-white">Habits</h2>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-[#ff6b35]">{completionRate}%</div>
          <div className="text-xs text-[#8b949e]">Today</div>
        </div>
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-[#ff6b35]">{stats.longestStreak}</div>
          <div className="text-xs text-[#8b949e]">Best Streak</div>
        </div>
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-[#ff6b35]">{stats.weeklyCompletion}%</div>
          <div className="text-xs text-[#8b949e]">This Week</div>
        </div>
      </div>

      {/* Habits List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-4 text-[#8b949e]">Loading...</div>
        ) : (
          habits.map((habit) => (
            <div 
              key={habit.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                habit.completedToday 
                  ? 'bg-[#238636]/10 border-[#238636]/30' 
                  : 'bg-[#0d1117] border-[#30363d] hover:border-[#ff6b35]/50'
              }`}
              onClick={() => toggleHabit(habit.id)}
            >
              <div className="text-2xl">{habit.icon}</div>
              
              <div className="flex-1">
                <div className={`font-medium ${habit.completedToday ? 'text-[#238636] line-through' : 'text-white'}`}>
                  {habit.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                  <Target className="w-3 h-3" />
                  <span>{habit.target}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[#ff6b35]">
                  <Flame className="w-4 h-4" />
                  <span className="text-sm font-medium">{habit.streak}</span>
                </div>
                
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  habit.completedToday 
                    ? 'bg-[#238636] border-[#238636]' 
                    : 'border-[#8b949e]'
                }`}>
                  {habit.completedToday && <Check className="w-4 h-4 text-white" />}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
