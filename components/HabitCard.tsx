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
  history: boolean[]; // Last 7 days (oldest to newest)
}

interface HabitStats {
  totalHabits: number;
  completedToday: number;
  longestStreak: number;
  weeklyCompletion: number;
}

interface GroupedHabits {
  [category: string]: Habit[];
}

const categoryLabels: Record<string, string> = {
  fitness: 'Fitness',
  health: 'Health',
  wellness: 'Wellness',
  mindfulness: 'Mindfulness',
  learning: 'Learning',
  trading: 'Trading',
  productivity: 'Productivity',
  social: 'Social',
  finance: 'Finance',
  other: 'Other'
};

const categoryColors: Record<string, string> = {
  fitness: '#ff6b35',
  health: '#238636',
  wellness: '#58a6ff',
  mindfulness: '#a371f7',
  learning: '#d29922',
  trading: '#f78166',
  productivity: '#3fb950',
  social: '#f778ba',
  finance: '#79c0ff',
  other: '#8b949e'
};

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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHabits();
    // Refresh every 5 minutes
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
        
        // Auto-expand all categories by default
        const categories = new Set(data.data.habits.map((h: Habit) => h.category));
        setExpandedCategories(categories);
      }
    } catch (error) {
      console.error('Failed to fetch habits:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleHabit = async (habitId: string) => {
    // Optimistic update
    setHabits(habits.map(habit => 
      habit.id === habitId 
        ? { ...habit, completedToday: !habit.completedToday }
        : habit
    ));
    
    // In production, this would update the habit status in the database
    // and refresh the data
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // Group habits by category
  const groupedHabits: GroupedHabits = habits.reduce((acc, habit) => {
    const category = habit.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(habit);
    return acc;
  }, {} as GroupedHabits);

  // Sort categories by number of habits (most first)
  const sortedCategories = Object.keys(groupedHabits).sort(
    (a, b) => groupedHabits[b].length - groupedHabits[a].length
  );

  const completionRate = stats.totalHabits > 0 
    ? Math.round((stats.completedToday / stats.totalHabits) * 100) 
    : 0;

  // Calculate weekly completion for a specific habit
  const getWeeklyCompletion = (history: boolean[]) => {
    if (!history || history.length === 0) return 0;
    const completed = history.filter(Boolean).length;
    return Math.round((completed / history.length) * 100);
  };

  // Get day labels for the past week (M, T, W, T, F, S, S)
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
          title="Refresh habits"
        >
          <RefreshCw className={`w-5 h-5 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-[#ff6b35]">{completionRate}%</div>
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Today</div>
        </div>
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-[#ff6b35]">{stats.longestStreak}</div>
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Best Streak</div>
        </div>
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-[#ff6b35]">{stats.weeklyCompletion}%</div>
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">This Week</div>
        </div>
        <div className="bg-[#0d1117] rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-[#ff6b35]">{habits.length}</div>
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Total</div>
        </div>
      </div>

      {/* Weekly Progress Mini-Chart */}
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
              className="h-full bg-gradient-to-r from-[#ff6b35] to-[#238636] transition-all duration-500"
              style={{ width: `${stats.weeklyCompletion}%` }}
            />
          </div>
        </div>
      )}

      {/* Habits List by Category */}
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {loading && habits.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            <p>Loading habits...</p>
          </div>
        ) : habits.length === 0 ? (
          <div className="text-center py-10">
            <Activity className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e] mb-2">No habits configured</p>
            <p className="text-xs text-[#8b949e] mb-4 max-w-xs mx-auto">
              Start building better routines by adding habits like &quot;Morning Meditation&quot;, &quot;Exercise&quot;, or &quot;Read 30 Minutes&quot;
            </p>
            <button 
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#ff6b35]/10 text-[#ff6b35] rounded-lg text-sm hover:bg-[#ff6b35]/20 transition-colors"
              onClick={() => {/* Open habit configuration */}}
            >
              <Plus className="w-4 h-4" />
              Add Your First Habit
            </button>
          </div>
        ) : (
          sortedCategories.map((category) => {
            const categoryHabits = groupedHabits[category];
            const isExpanded = expandedCategories.has(category);
            const categoryColor = categoryColors[category] || '#8b949e';
            const categoryLabel = categoryLabels[category] || category.charAt(0).toUpperCase() + category.slice(1);
            const completedInCategory = categoryHabits.filter(h => h.completedToday).length;
            
            return (
              <div key={category} className="border border-[#30363d] rounded-lg overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-3 bg-[#0d1117] hover:bg-[#161b22] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: categoryColor }}
                    />
                    <span className="font-medium text-white text-sm">{categoryLabel}</span>
                    <span className="text-xs text-[#8b949e]">
                      ({completedInCategory}/{categoryHabits.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {categoryHabits.slice(0, 3).map((habit, i) => (
                        <span key={i} className="text-xs">{habit.icon}</span>
                      ))}
                      {categoryHabits.length > 3 && (
                        <span className="text-xs text-[#8b949e]">+{categoryHabits.length - 3}</span>
                      )}
                    </div>
                    <svg 
                      className={`w-4 h-4 text-[#8b949e] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                
                {/* Habits in Category */}
                {isExpanded && (
                  <div className="divide-y divide-[#30363d]">
                    {categoryHabits.map((habit) => (
                      <div 
                        key={habit.id}
                        className={`p-3 transition-all ${
                          habit.completedToday 
                            ? 'bg-[#238636]/5' 
                            : 'bg-[#161b22]'
                        }`}
                      >
                        {/* Main Habit Row */}
                        <div className="flex items-center gap-3">
                          <div className="text-xl">{habit.icon}</div>
                          
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium text-sm truncate ${
                              habit.completedToday ? 'text-[#238636] line-through' : 'text-white'
                            }`}>
                              {habit.name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-[#8b949e]">
                              <Target className="w-3 h-3" />
                              <span>{habit.target}</span>
                              <span className="text-[#30363d]">•</span>
                              <Flame className="w-3 h-3 text-[#ff6b35]" />
                              <span className="text-[#ff6b35]">{habit.streak} day streak</span>
                            </div>
                          </div>

                          {/* Weekly History Dots */}
                          <div className="flex items-center gap-1 mr-2">
                            {habit.history.map((completed, index) => (
                              <div
                                key={index}
                                className={`w-2 h-2 rounded-full ${
                                  completed 
                                    ? 'bg-[#238636]' 
                                    : 'bg-[#30363d]'
                                }`}
                                title={`${dayLabels[index]}: ${completed ? 'Done' : 'Missed'}`}
                              />
                            ))}
                          </div>

                          {/* Toggle Button */}
                          <button
                            onClick={() => toggleHabit(habit.id)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                              habit.completedToday 
                                ? 'bg-[#238636] border-[#238636]' 
                                : 'border-[#8b949e] hover:border-[#ff6b35]'
                            }`}
                          >
                            {habit.completedToday && <Check className="w-4 h-4 text-white" />}
                          </button>
                        </div>
                        
                        {/* Mini Progress Bar for this habit */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1 bg-[#21262d] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-300"
                              style={{ 
                                width: `${getWeeklyCompletion(habit.history)}%`,
                                backgroundColor: categoryColor
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-[#8b949e] w-8 text-right">
                            {getWeeklyCompletion(habit.history)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Day Labels Legend */}
      {habits.length > 0 && !loading && (
        <div className="mt-4 pt-3 border-t border-[#30363d]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Last 7 Days</span>
              <div className="flex items-center gap-1">
                {dayLabels.map((day, i) => (
                  <span key={i} className="text-[10px] text-[#8b949e] w-2 text-center">
                    {day}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#8b949e]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[#238636]" />
                <span>Done</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[#30363d]" />
                <span>Missed</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
