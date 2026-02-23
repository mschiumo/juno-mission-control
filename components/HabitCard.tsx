'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, Check, Flame, RefreshCw, Plus, TrendingUp, X, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types
interface Habit {
  id: string;
  name: string;
  icon: string;
  streak: number;
  completedToday: boolean;
  target: string;
  category: string;
  history: boolean[]; // Last 7 days (oldest to newest)
  order: number;
}

interface HabitStats {
  totalHabits: number;
  completedToday: number;
  longestStreak: number;
  weeklyCompletion: number;
}

// Constants
const EMOJI_OPTIONS = ['💪', '🏃', '📚', '💧', '🧘', '🛏️', '💊', '📝', '📊', '🎯', '🔥', '⭐', '🌟', '✨', '🎨', '🎵', '🌱', '☀️', '🌙', '🍎', '🥗', '💤', '🧠', '❤️', '🌈'];
const LOCALSTORAGE_KEY = 'juno_habits_cache';
const LAST_FETCH_KEY = 'juno_habits_last_fetch';

// Sortable habit item component
interface SortableHabitItemProps {
  habit: Habit;
  onToggle: (habitId: string) => void;
  onDelete: (habitId: string) => void;
  dayLabels: string[];
  disabled?: boolean;
}

function SortableHabitItem({ habit, onToggle, onDelete, dayLabels, disabled }: SortableHabitItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 rounded-xl border transition-all ${
        habit.completedToday
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-[#0F0F0F] border-[#262626] hover:border-orange-500/50'
      } ${isDragging ? 'shadow-lg ring-2 ring-orange-500/50' : ''} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="p-1.5 hover:bg-[#262626] rounded-lg cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          title="Drag to reorder"
          disabled={disabled}
        >
          <GripVertical className="w-4 h-4 text-[#737373]" />
        </button>

        <button
          onClick={() => onToggle(habit.id)}
          disabled={disabled}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
            habit.completedToday
              ? 'bg-green-500 border-green-500'
              : 'border-[#737373] hover:border-orange-500'
          }`}
        >
          {habit.completedToday && <Check className="w-4 h-4 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg flex-shrink-0">{habit.icon}</span>
            <span className={`font-medium truncate ${habit.completedToday ? 'text-[#737373] line-through' : 'text-white'}`}>
              {habit.name}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-1 flex-shrink-0">
              <Flame className={`w-3 h-3 ${habit.streak > 0 ? 'text-orange-500' : 'text-[#737373]'}`} />
              <span className={`text-xs ${habit.streak > 0 ? 'text-orange-500' : 'text-[#737373]'}`}>
                {habit.streak} day{habit.streak !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-xs text-[#737373] truncate">{habit.target}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1">
            {habit.history.map((completed, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full ${completed ? 'bg-green-500' : 'bg-[#262626]'}`}
                title={dayLabels[idx]}
              />
            ))}
          </div>
          <button
            onClick={() => onDelete(habit.id)}
            disabled={disabled}
            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Delete habit"
          >
            <Trash2 className="w-4 h-4 text-[#737373] hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Calculate stats from habits
function calculateStats(habits: Habit[]): HabitStats {
  const totalHabits = habits.length;
  const completedToday = habits.filter(h => h.completedToday).length;
  const longestStreak = Math.max(...habits.map(h => h.streak), 0);
  
  // Weekly completion: sum of all history completions + today / (habits * 7 days)
  const totalPossibleCompletions = totalHabits * 7;
  const actualCompletions = habits.reduce((acc, h) => 
    acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
  );
  const weeklyCompletion = totalPossibleCompletions > 0 
    ? Math.round((actualCompletions / totalPossibleCompletions) * 100)
    : 0;

  return { totalHabits, completedToday, longestStreak, weeklyCompletion };
}

// Save to localStorage
function saveToCache(habits: Habit[], stats: HabitStats) {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ habits, stats }));
    localStorage.setItem(LAST_FETCH_KEY, Date.now().toString());
  } catch {
    // Ignore localStorage errors
  }
}

// Load from localStorage
function loadFromCache(): { habits: Habit[]; stats: HabitStats } | null {
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⭐');
  const [newHabitTarget, setNewHabitTarget] = useState('Daily');

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch habits on mount
  useEffect(() => {
    // Load from cache first for instant UI
    const cached = loadFromCache();
    if (cached) {
      setHabits(cached.habits);
      setStats(cached.stats);
      setLoading(false);
    }
    
    // Then fetch fresh data
    fetchHabits();
  }, []);

  // Auto-save to localStorage when habits change
  useEffect(() => {
    if (habits.length > 0) {
      saveToCache(habits, stats);
    }
  }, [habits, stats]);

  const fetchHabits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/habit-status');
      const data = await response.json();
      if (data.success) {
        setHabits(data.data.habits);
        setStats(data.data.stats);
        saveToCache(data.data.habits, data.data.stats);
      } else {
        setError('Failed to load habits');
      }
    } catch (err) {
      console.error('Failed to fetch habits:', err);
      setError('Network error - using cached data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = habits.findIndex((item) => item.id === active.id);
      const newIndex = habits.findIndex((item) => item.id === over.id);
      const newItems = arrayMove(habits, oldIndex, newIndex);
      
      // Optimistic update
      setHabits(newItems);
      setStats(calculateStats(newItems));
      
      // Save to server (fire and forget, will sync on next fetch if fails)
      try {
        const habitIds = newItems.map(h => h.id);
        await fetch('/api/habit-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ habitIds })
        });
      } catch (error) {
        console.error('Failed to save habit order:', error);
      }
    }
  };

  const toggleHabit = async (habitId: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    
    const newCompletedState = !habit.completedToday;
    
    // Optimistic update
    const updatedHabits = habits.map(h => 
      h.id === habitId 
        ? { ...h, completedToday: newCompletedState }
        : h
    );
    setHabits(updatedHabits);
    setStats(calculateStats(updatedHabits));
    setSyncing(true);
    
    try {
      const response = await fetch('/api/habit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, completed: newCompletedState })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update');
      }
      
      // Refresh to get server-calculated streaks/stats
      await fetchHabits();
    } catch (error) {
      console.error('Failed to persist habit:', error);
      // Revert on error
      setHabits(habits);
      setStats(calculateStats(habits));
      setError('Failed to save - please try again');
    } finally {
      setSyncing(false);
    }
  };

  const addHabit = async () => {
    if (!newHabitName.trim()) return;

    setSyncing(true);
    try {
      const response = await fetch('/api/habit-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newHabitName,
          icon: newHabitIcon,
          target: newHabitTarget,
          category: 'other'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setHabits(data.data.habits);
        setStats(data.data.stats);
        setNewHabitName('');
        setNewHabitIcon('⭐');
        setNewHabitTarget('Daily');
        setShowAddModal(false);
        saveToCache(data.data.habits, data.data.stats);
      } else {
        setError('Failed to add habit');
      }
    } catch (error) {
      console.error('Failed to add habit:', error);
      setError('Network error - please try again');
    } finally {
      setSyncing(false);
    }
  };

  const deleteHabit = async (habitId: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return;

    setSyncing(true);
    try {
      const response = await fetch(`/api/habit-status?habitId=${habitId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const data = await response.json();
        setHabits(data.data.habits);
        setStats(data.data.stats);
        saveToCache(data.data.habits, data.data.stats);
      } else {
        setError('Failed to delete habit');
      }
    } catch (error) {
      console.error('Failed to delete habit:', error);
      setError('Network error - please try again');
    } finally {
      setSyncing(false);
    }
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
    <div className="card">
      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-xl flex items-center justify-between">
          <span className="text-red-500 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sync Indicator */}
      {syncing && (
        <div className="mb-4 flex items-center gap-2 text-orange-500 text-xs">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Saving...</span>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-xl">
            <Activity className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Habits</h2>
            <p className="text-xs text-[#737373]">
              {stats.completedToday} of {stats.totalHabits} completed today
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            disabled={syncing}
            className="p-2 bg-orange-500 text-white rounded-xl hover:bg-orange-400 transition-colors disabled:opacity-50"
            title="Add new habit"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={fetchHabits}
            disabled={loading}
            className="p-2 hover:bg-[#262626] rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-[#737373] hover:text-orange-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { value: `${completionRate}%`, label: 'Today' },
          { value: stats.longestStreak, label: 'Best Streak' },
          { value: `${stats.weeklyCompletion}%`, label: 'This Week' },
          { value: habits.length, label: 'Total' }
        ].map((stat, i) => (
          <div key={i} className="bg-[#0F0F0F] rounded-xl p-3 text-center border border-[#262626]">
            <div className="text-xl font-bold text-orange-500">{stat.value}</div>
            <div className="text-xs text-[#737373] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly Progress */}
      {habits.length > 0 && (
        <div className="mb-6 p-4 bg-[#0F0F0F] rounded-xl border border-[#262626]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#737373]" />
              <span className="text-xs text-[#737373] uppercase tracking-wider font-medium">Weekly Progress</span>
            </div>
            <span className="text-xs text-green-500 font-medium">{stats.weeklyCompletion}% avg</span>
          </div>
          <div className="h-2 bg-[#262626] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
              style={{ width: `${stats.weeklyCompletion}%` }}
            />
          </div>
        </div>
      )}

      {/* Habits List - Draggable */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-3">
          {loading && habits.length === 0 ? (
            <div className="text-center py-8 text-[#737373]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-orange-500" />
              <p>Loading habits...</p>
            </div>
          ) : habits.length === 0 ? (
            <div className="text-center py-10">
              <Activity className="w-12 h-12 mx-auto mb-3 text-[#737373] opacity-50" />
              <p className="text-[#737373] mb-2">No habits configured</p>
              <button 
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-500 rounded-xl text-sm hover:bg-orange-500/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your First Habit
              </button>
            </div>
          ) : (
            <SortableContext 
              items={habits.map(h => h.id)} 
              strategy={verticalListSortingStrategy}
            >
              {habits.map((habit) => (
                <SortableHabitItem
                  key={habit.id}
                  habit={habit}
                  onToggle={toggleHabit}
                  onDelete={deleteHabit}
                  dayLabels={dayLabels}
                  disabled={syncing}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </DndContext>
      
      {/* Legend */}
      {habits.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#262626]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#737373] uppercase tracking-wider">Last 7 Days</span>
              <div className="flex items-center gap-1">
                {dayLabels.map((day, i) => (
                  <span key={i} className="text-[10px] text-[#737373] w-2 text-center">{day}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#737373]">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /><span>Done</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#262626]" /><span>Missed</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Add Habit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add New Habit</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[#262626] rounded-lg"
              >
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>
            
            {/* Name Input */}
            <div className="mb-4">
              <label className="block text-sm text-[#737373] mb-2">Habit Name</label>
              <input
                type="text"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="e.g., Morning Meditation"
                className="w-full px-4 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-orange-500"
              />
            </div>
            
            {/* Icon Selector */}
            <div className="mb-4">
              <label className="block text-sm text-[#737373] mb-2">Icon</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setNewHabitIcon(emoji)}
                    className={`text-2xl p-2 rounded-lg border transition-all ${
                      newHabitIcon === emoji
                        ? 'border-orange-500 bg-orange-500/20'
                        : 'border-[#262626] hover:border-[#737373]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Target Input */}
            <div className="mb-6">
              <label className="block text-sm text-[#737373] mb-2">Target</label>
              <input
                type="text"
                value={newHabitTarget}
                onChange={(e) => setNewHabitTarget(e.target.value)}
                placeholder="e.g., Daily, 3x/week, 30 min"
                className="w-full px-4 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-orange-500"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addHabit}
                disabled={!newHabitName.trim() || syncing}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-400 transition-colors disabled:opacity-50"
              >
                {syncing ? 'Adding...' : 'Add Habit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
