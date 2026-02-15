'use client';

import { useState, useEffect } from 'react';
import { Activity, Check, Flame, Target, RefreshCw, Plus, TrendingUp, X, Trash2, Moon, GripVertical } from 'lucide-react';
import EveningCheckinModal from './EveningCheckinModal';
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

interface Habit {
  id: string;
  name: string;
  icon: string;
  streak: number;
  completedToday: boolean;
  target: string;
  category: string;
  history: boolean[];
  order: number;
}

interface HabitStats {
  totalHabits: number;
  completedToday: number;
  longestStreak: number;
  weeklyCompletion: number;
}

const EMOJI_OPTIONS = ['💪', '🏃', '📚', '💧', '🧘', '🛏️', '💊', '📝', '📊', '🎯', '🔥', '⭐', '🌟', '✨', '🎨', '🎵', '🌱', '☀️', '🌙', '🍎', '🥗', '💤', '🧠', '❤️', '🌈'];

// Sortable habit item component
interface SortableHabitItemProps {
  habit: Habit;
  onToggle: (habitId: string) => void;
  onDelete: (habitId: string) => void;
  dayLabels: string[];
}

function SortableHabitItem({ habit, onToggle, onDelete, dayLabels }: SortableHabitItemProps) {
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
          ? 'bg-[#22c55e]/10 border-[#22c55e]/30'
          : 'bg-[#0F0F0F] border-[#262626] hover:border-[#F97316]/50'
      } ${isDragging ? 'shadow-lg ring-2 ring-[#F97316]/50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="p-1.5 hover:bg-[#262626] rounded-lg cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-[#737373]" />
        </button>

        <button
          onClick={() => onToggle(habit.id)}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
            habit.completedToday
              ? 'bg-[#22c55e] border-[#22c55e]'
              : 'border-[#737373] hover:border-[#F97316]'
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
              <Flame className={`w-3 h-3 ${habit.streak > 0 ? 'text-[#F97316]' : 'text-[#737373]'}`} />
              <span className={`text-xs ${habit.streak > 0 ? 'text-[#F97316]' : 'text-[#737373]'}`}>
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
                className={`w-2 h-2 rounded-full ${completed ? 'bg-[#22c55e]' : 'bg-[#262626]'}`}
                title={dayLabels[idx]}
              />
            ))}
          </div>
          <button
            onClick={() => onDelete(habit.id)}
            className="p-1.5 hover:bg-[#da3633]/20 rounded-lg transition-colors"
            title="Delete habit"
          >
            <Trash2 className="w-4 h-4 text-[#737373] hover:text-[#da3633]" />
          </button>
        </div>
      </div>
    </div>
  );
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
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEveningCheckin, setShowEveningCheckin] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⭐');
  const [newHabitTarget, setNewHabitTarget] = useState('Daily');

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setHabits((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Save the new order to the server
        const habitIds = newItems.map(h => h.id);
        fetch('/api/habit-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ habitIds })
        }).catch(error => {
          console.error('Failed to save habit order:', error);
        });
        
        return newItems;
      });
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

  const addHabit = async () => {
    if (!newHabitName.trim()) return;

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
      }
    } catch (error) {
      console.error('Failed to add habit:', error);
    }
  };

  const deleteHabit = async (habitId: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return;

    try {
      const response = await fetch(`/api/habit-status?habitId=${habitId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const data = await response.json();
        setHabits(data.data.habits);
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Failed to delete habit:', error);
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

  const handleEveningCheckinSuccess = () => {
    setShowSuccessBanner(true);
    setTimeout(() => setShowSuccessBanner(false), 3000);
  };

  const dayLabels = getDayLabels();

  return (
    <div className="card">
      {/* Success Banner */}
      {showSuccessBanner && (
        <div className="mb-4 p-3 bg-[#22c55e]/20 border border-[#22c55e] rounded-xl flex items-center gap-2">
          <Check className="w-5 h-5 text-[#22c55e]" />
          <span className="text-[#22c55e] font-medium">Evening check-in saved!</span>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-xl">
            <Activity className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Habits</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#737373]">
                {stats.completedToday} of {stats.totalHabits} completed today
              </p>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#22c55e]">
                  updated {formatLastUpdated()}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEveningCheckin(true)}
            className="p-2 bg-[#a371f7] text-white rounded-xl hover:bg-[#8957e5] transition-colors"
            title="Evening check-in"
          >
            <Moon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 bg-[#F97316] text-white rounded-xl hover:bg-[#ff8c5a] transition-colors"
            title="Add new habit"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={fetchHabits}
            disabled={loading}
            className="p-2 hover:bg-[#262626] rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-[#737373] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid with metric classes */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { value: `${completionRate}%`, label: 'Today' },
          { value: stats.longestStreak, label: 'Best Streak' },
          { value: `${stats.weeklyCompletion}%`, label: 'This Week' },
          { value: habits.length, label: 'Total' }
        ].map((stat, i) => (
          <div key={i} className="bg-[#0F0F0F] rounded-xl p-3 text-center border border-[#262626]">
            <div className="metric-value text-[#F97316]">{stat.value}</div>
            <div className="metric-label mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly Progress with new progress bar */}
      {habits.length > 0 && !loading && (
        <div className="mb-6 p-4 bg-[#0F0F0F] rounded-xl border border-[#262626]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#737373]" />
              <span className="text-xs text-[#737373] uppercase tracking-wider font-medium">Weekly Progress</span>
            </div>
            <span className="text-xs text-[#22c55e] font-medium">{stats.weeklyCompletion}% avg</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
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
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#F97316]" />
              <p>Loading habits...</p>
            </div>
          ) : habits.length === 0 ? (
            <div className="text-center py-10">
              <Activity className="w-12 h-12 mx-auto mb-3 text-[#737373] opacity-50" />
              <p className="text-[#737373] mb-2">No habits configured</p>
              <button 
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#F97316]/10 text-[#F97316] rounded-xl text-sm hover:bg-[#F97316]/20 transition-colors"
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
                />
              ))}
            </SortableContext>
          )}
        </div>
      </DndContext>
      
      {/* Legend */}
      {habits.length > 0 && !loading && (
        <div className="mt-4 pt-4 border-t border-[#262626]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="metric-label">Last 7 Days</span>
              <div className="flex items-center gap-1">
                {dayLabels.map((day, i) => (
                  <span key={i} className="text-[10px] text-[#737373] w-2 text-center">{day}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#737373]">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#22c55e]" /><span>Done</span></div>
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
                className="w-full px-4 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316]"
              />
            </div>
            
            {/* Icon Selector */}
            <div className="mb-4">
              <label className="block text-sm text-[#737373] mb-2">Icon</label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setNewHabitIcon(emoji)}
                    className={`text-2xl p-2 rounded-lg border transition-all ${
                      newHabitIcon === emoji
                        ? 'border-[#F97316] bg-[#F97316]/20'
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
                className="w-full px-4 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316]"
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
                disabled={!newHabitName.trim()}
                className="flex-1 px-4 py-2 bg-[#F97316] text-white rounded-xl hover:bg-[#ff8c5a] transition-colors disabled:opacity-50"
              >
                Add Habit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evening Check-in Modal */}
      <EveningCheckinModal 
        isOpen={showEveningCheckin} 
        onClose={() => setShowEveningCheckin(false)}
        onSuccess={handleEveningCheckinSuccess}
      />
    </div>
  );
}
