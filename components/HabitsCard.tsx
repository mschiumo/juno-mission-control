'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Circle, 
  Flame, 
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Trophy,
  Target
} from 'lucide-react';
import HabitConsistencyScorecard from './HabitConsistencyScorecard';

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  completed: boolean;
  streak: number;
}

export default function HabitsCard() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScorecard, setShowScorecard] = useState(false);
  const [today, setToday] = useState('');

  useEffect(() => {
    // Set today in EST
    const estDate = new Date().toLocaleDateString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    setToday(estDate);
    fetchHabits();
  }, []);

  const fetchHabits = async () => {
    try {
      const res = await fetch('/api/habits');
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setHabits(result.data.habits);
        }
      }
    } catch (error) {
      console.error('Error fetching habits:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleHabit = async (habitId: string, completed: boolean) => {
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today, completed })
      });
      
      if (res.ok) {
        // Optimistic update
        setHabits(prev => prev.map(h => 
          h.id === habitId 
            ? { ...h, completed, streak: completed ? h.streak + 1 : Math.max(0, h.streak - 1) }
            : h
        ));
      }
    } catch (error) {
      console.error('Error toggling habit:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-[#30363d] rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 bg-[#30363d] rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const completedCount = habits.filter(h => h.completed).length;
  const progress = habits.length > 0 ? (completedCount / habits.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Daily Habits Card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#30363d] bg-[#0d1117]/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#22c55e]/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Daily Habits</h2>
                <p className="text-xs text-[#8b949e]">
                  {completedCount}/{habits.length} completed today
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="text-right mr-2">
                <p className="text-2xl font-bold text-white">{Math.round(progress)}%</p>
              </div>
              <button
                onClick={() => setShowScorecard(!showScorecard)}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
                title={showScorecard ? 'Hide scorecard' : 'Show consistency scorecard'}
              >
                {showScorecard ? (
                  <ChevronUp className="w-5 h-5 text-[#8b949e]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#8b949e]" />
                )}
              </button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3 w-full bg-[#30363d] rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-[#22c55e] to-[#4ade80] h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Habits List */}
        <div className="p-4">
          <div className="space-y-2">
            {habits.map((habit) => (
              <button
                key={habit.id}
                onClick={() => toggleHabit(habit.id, !habit.completed)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                  habit.completed 
                    ? 'bg-[#238636]/10 border border-[#238636]/30' 
                    : 'bg-[#0d1117] border border-[#30363d] hover:border-[#8b949e]'
                }`}
              >
                <div className="text-2xl">{habit.emoji}</div>
                
                <div className="flex-1 text-left">
                  <p className={`font-medium ${habit.completed ? 'text-white line-through' : 'text-white'}`}>
                    {habit.name}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  {habit.streak > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-[#f97316]/10 rounded text-xs">
                      <Flame className="w-3 h-3 text-[#f97316]" />
                      <span className="text-[#f97316] font-medium">{habit.streak}</span>
                    </div>
                  )}
                  
                  {habit.completed ? (
                    <CheckCircle className="w-5 h-5 text-[#238636]" />
                  ) : (
                    <Circle className="w-5 h-5 text-[#8b949e]" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Consistency Scorecard - Expandable */}
      {showScorecard && <HabitConsistencyScorecard />}
    </div>
  );
}
