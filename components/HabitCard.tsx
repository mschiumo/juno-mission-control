'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Check, Flame, RefreshCw, Plus, TrendingUp, X, Trash2, GripVertical, Cloud, CloudOff, Loader2, Pencil, ClipboardList, AlertTriangle, CheckCircle2, Minus, Timer, MapPin } from 'lucide-react';
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

type HabitFrequency = 'daily' | 'weekdays' | '3x' | '4x' | '5x' | '6x';

const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 'daily',    label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: '3x',       label: '3x/wk' },
  { value: '4x',       label: '4x/wk' },
  { value: '5x',       label: '5x/wk' },
  { value: '6x',       label: '6x/wk' },
];

function frequencyGoal(f: HabitFrequency | undefined): number {
  switch (f) {
    case 'weekdays': return 5;
    case '3x':       return 3;
    case '4x':       return 4;
    case '5x':       return 5;
    case '6x':       return 6;
    default:         return 7;
  }
}

interface Habit {
  id: string;
  name: string;
  icon: string;
  streak: number;
  completedToday: boolean;
  target: string;
  category: string;
  frequency: HabitFrequency;
  history: boolean[]; // Last 7 days (oldest to newest)
  order: number;
}

interface HabitStats {
  totalHabits: number;
  completedToday: number;
  longestStreak: number;
  weeklyCompletion: number;
}

interface PendingChange {
  habitId: string;
  previousState: boolean;
}

type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

const EMOJI_OPTIONS = ['💪', '🏃', '📚', '💧', '🧘', '🛏️', '💊', '📝', '📊', '🎯', '🔥', '⭐', '🌟', '✨', '🎨', '🎵', '🌱', '☀️', '🌙', '🍎', '🥗', '💤', '🧠', '❤️', '🌈'];

const STORAGE_KEY = 'juno_habits_cache';
const STORAGE_STATS_KEY = 'juno_habits_stats_cache';
const STORAGE_TIMESTAMP_KEY = 'juno_habits_timestamp';

function StravaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 5 10.172h4.172" />
    </svg>
  );
}

// Sortable habit item component
interface SortableHabitItemProps {
  habit: Habit;
  onToggle: (habitId: string) => void;
  onDelete: (habitId: string) => void;
  onEdit: (habit: Habit) => void;
  dayLabels: string[];
  disabled?: boolean;
  onStravaClick?: () => void;
}

function SortableHabitItem({ habit, onToggle, onDelete, onEdit, dayLabels, disabled, onStravaClick }: SortableHabitItemProps) {
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
      className={`p-3 rounded-lg border transition-all ${
        habit.completedToday
          ? 'bg-[#22c55e]/10 border-[#22c55e]/30'
          : 'bg-[#0d1117] border-[#30363d] hover:border-[#F97316]/50'
      } ${isDragging ? 'shadow-lg ring-2 ring-[#F97316]/50' : ''} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
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
          disabled={disabled}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center disabled:opacity-50 ${
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
          {habit.category === 'fitness' && onStravaClick && (
            <button
              onClick={onStravaClick}
              disabled={disabled}
              className="p-1.5 hover:bg-[#FC4C02]/20 rounded-lg transition-colors disabled:opacity-50"
              title="View Strava activity"
            >
              <StravaIcon className="w-3.5 h-3.5 text-[#FC4C02]" />
            </button>
          )}
          <button
            onClick={() => onEdit(habit)}
            disabled={disabled}
            className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Edit habit"
          >
            <Pencil className="w-3.5 h-3.5 text-[#737373] hover:text-[#F97316]" />
          </button>
          <button
            onClick={() => onDelete(habit.id)}
            disabled={disabled}
            className="p-1.5 hover:bg-[#da3633]/20 rounded-lg transition-colors disabled:opacity-50"
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add / Edit modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⭐');
  const [newHabitTarget, setNewHabitTarget] = useState('Daily');
  const [newHabitFrequency, setNewHabitFrequency] = useState<HabitFrequency>('daily');

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  // Strava popover state
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [stravaData, setStravaData] = useState<null | {
    athlete: { name: string; profile: string };
    activities: { id: number; name: string; type: string; distance: string; duration: string; pace: string | null; elevationGain: number; date: string }[];
    weekStats: { runs: number; miles: string; time: string } | null;
  }>(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaError, setStravaError] = useState<string | null>(null);

  const openStravaModal = async () => {
    setShowStravaModal(true);
    if (stravaData) return; // already loaded
    setStravaLoading(true);
    setStravaError(null);
    try {
      const res = await fetch('/api/strava/activities');
      const json = await res.json();
      if (json.success) {
        setStravaData(json);
      } else {
        setStravaError(json.error ?? 'Failed to load Strava data');
      }
    } catch {
      setStravaError('Network error');
    } finally {
      setStravaLoading(false);
    }
  };

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

  // Load from localStorage on mount
  useEffect(() => {
    const loadFromCache = () => {
      try {
        const cachedHabits = localStorage.getItem(STORAGE_KEY);
        const cachedStats = localStorage.getItem(STORAGE_STATS_KEY);
        const cachedTimestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);

        if (cachedHabits) {
          setHabits(JSON.parse(cachedHabits));
        }
        if (cachedStats) {
          setStats(JSON.parse(cachedStats));
        }
        if (cachedTimestamp) {
          setLastUpdated(new Date(cachedTimestamp));
        }
        
        // If we have cached data, we're in offline mode until server confirms
        if (cachedHabits) {
          setSyncStatus('offline');
        }
      } catch (error) {
        console.error('Failed to load from localStorage:', error);
      }
    };

    loadFromCache();
  }, []);

  // Save to localStorage whenever habits/stats change
  useEffect(() => {
    try {
      if (habits.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
        localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, new Date().toISOString());
      }
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [habits, stats]);

  // Fetch habits from server
  const fetchHabits = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const response = await fetch('/api/habit-status');
      const data = await response.json();
      
      if (data.success) {
        setHabits(data.data.habits);
        setStats(data.data.stats);
        setLastUpdated(new Date());
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('Failed to fetch habits:', error);
      setSyncStatus('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHabits();
    const interval = setInterval(fetchHabits, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [fetchHabits]);

  // Clear sync status after a delay
  useEffect(() => {
    if (syncStatus === 'synced') {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        // Keep synced status but visually fade it
      }, 2000);
    }
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [syncStatus]);

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
    if (!habit || pendingChanges.has(habitId)) return;
    
    const newCompletedState = !habit.completedToday;
    const previousState = habit.completedToday;
    
    // Track pending change for revert
    setPendingChanges(prev => new Map(prev.set(habitId, { habitId, previousState })));
    setSyncStatus('syncing');
    
    // Optimistic update - update UI immediately
    const updatedHabits = habits.map(h => 
      h.id === habitId 
        ? { ...h, completedToday: newCompletedState }
        : h
    );
    setHabits(updatedHabits);
    
    // Recalculate stats optimistically
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
      const response = await fetch('/api/habit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, completed: newCompletedState })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        // Server confirmed - update with server data to ensure consistency
        setHabits(data.data.habits);
        setStats(data.data.stats);
        setLastUpdated(new Date());
        setSyncStatus('synced');
      } else {
        throw new Error(data.error || 'Server returned error');
      }
    } catch (error) {
      console.error('Failed to persist habit:', error);
      
      // REVERT: Restore previous state on error
      const revertedHabits = habits.map(h => 
        h.id === habitId 
          ? { ...h, completedToday: previousState }
          : h
      );
      setHabits(revertedHabits);
      
      // Recalculate stats with reverted state
      const revertedCompletedToday = revertedHabits.filter(h => h.completedToday).length;
      const revertedTotalHabits = revertedHabits.length;
      const revertedLongestStreak = Math.max(...revertedHabits.map(h => h.streak), 0);
      
      const revertedTotalPossibleCompletions = revertedTotalHabits * 7;
      const revertedActualCompletions = revertedHabits.reduce((acc, h) => 
        acc + h.history.filter(Boolean).length + (h.completedToday ? 1 : 0), 0
      );
      const revertedWeeklyCompletion = revertedTotalPossibleCompletions > 0 
        ? Math.round((revertedActualCompletions / revertedTotalPossibleCompletions) * 100)
        : 0;
      
      setStats({ 
        totalHabits: revertedTotalHabits, 
        completedToday: revertedCompletedToday, 
        longestStreak: revertedLongestStreak, 
        weeklyCompletion: revertedWeeklyCompletion 
      });
      
      setSyncStatus('error');
    } finally {
      setPendingChanges(prev => {
        const newMap = new Map(prev);
        newMap.delete(habitId);
        return newMap;
      });
    }
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setNewHabitName(habit.name);
    setNewHabitIcon(habit.icon);
    setNewHabitTarget(habit.target);
    setNewHabitFrequency(habit.frequency ?? 'daily');
    setShowAddModal(true);
  };

  const closeHabitModal = () => {
    setShowAddModal(false);
    setEditingHabit(null);
    setNewHabitName('');
    setNewHabitIcon('⭐');
    setNewHabitTarget('Daily');
    setNewHabitFrequency('daily');
  };

  const submitHabit = async () => {
    if (!newHabitName.trim()) return;
    setSyncStatus('syncing');
    try {
      const response = await fetch('/api/habit-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingHabit ? { habitId: editingHabit.id } : {}),
          name: newHabitName,
          icon: newHabitIcon,
          target: newHabitTarget,
          frequency: newHabitFrequency,
          category: editingHabit?.category ?? 'other',
        })
      });
      if (response.ok) {
        const data = await response.json();
        setHabits(data.data.habits);
        setStats(data.data.stats);
        closeHabitModal();
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('Failed to save habit:', error);
      setSyncStatus('error');
    }
  };

  const deleteHabit = async (habitId: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return;

    setSyncStatus('syncing');
    try {
      const response = await fetch(`/api/habit-status?habitId=${habitId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const data = await response.json();
        setHabits(data.data.habits);
        setStats(data.data.stats);
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('Failed to delete habit:', error);
      setSyncStatus('error');
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York'
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

  const getSyncIndicator = () => {
    switch (syncStatus) {
      case 'syncing':
        return (
          <span className="flex items-center gap-1 text-[10px] text-[#F97316]" title="Syncing...">
            <Loader2 className="w-3 h-3 animate-spin" />
            Syncing
          </span>
        );
      case 'synced':
        return (
          <span className="flex items-center gap-1 text-[10px] text-[#22c55e]" title="All changes saved">
            <Cloud className="w-3 h-3" />
            Saved
          </span>
        );
      case 'offline':
        return (
          <span className="flex items-center gap-1 text-[10px] text-[#737373]" title="Using cached data - will sync when online">
            <CloudOff className="w-3 h-3" />
            Offline
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] text-[#da3633]" title="Sync failed - click refresh to retry">
            <CloudOff className="w-3 h-3" />
            Error
          </span>
        );
    }
  };

  const dayLabels = getDayLabels();
  const hasPendingChanges = pendingChanges.size > 0;

  const computeReport = () => {
    const now = new Date();
    const analysis = habits.map(h => {
      const goal = frequencyGoal(h.frequency);
      const completions = h.history.filter(Boolean).length + (h.completedToday ? 1 : 0);
      const rate = Math.round((completions / goal) * 100);
      return {
        ...h,
        weeklyCompletions: completions,
        weeklyGoal: goal,
        weeklyRate: rate,
        tier: (rate >= 71 ? 'strong' : rate >= 43 ? 'moderate' : 'struggling') as 'strong' | 'moderate' | 'struggling',
      };
    });
    const strong     = analysis.filter(h => h.tier === 'strong');
    const moderate   = analysis.filter(h => h.tier === 'moderate');
    const struggling = analysis.filter(h => h.tier === 'struggling');
    const recommendations: string[] = [];
    struggling.slice(0, 3).forEach(h => {
      if (h.weeklyRate === 0) recommendations.push(`"${h.name}" hasn't been logged once this week — consider adjusting its time slot.`);
      else recommendations.push(`"${h.name}" is missed most days (${h.weeklyRate}%) — try anchoring it to an existing routine.`);
    });
    if (strong.length === habits.length && habits.length > 0)
      recommendations.push('You\'re completing every habit this week. Consider raising the bar or adding a new challenge.');
    if (stats.weeklyCompletion < 40 && habits.length > 3)
      recommendations.push('With many habits tracked, focus on your top 2–3 until consistency builds.');
    if (!habits.some(h => h.completedToday) && now.getHours() >= 10)
      recommendations.push('No habits logged yet today — you still have time to build momentum.');
    if (recommendations.length === 0)
      recommendations.push('Solid week overall. Keep the momentum going and stay consistent.');
    return { analysis, strong, moderate, struggling, recommendations, generatedAt: now };
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-[900px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Habits</h2>
          <span className="text-[10px] text-[#8b949e]">
            {stats.completedToday}/{stats.totalHabits} today
          </span>
          {getSyncIndicator()}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative group">
            <button
              onClick={() => { setReportReady(false); setShowReportModal(true); }}
              disabled={habits.length === 0}
              className="p-1.5 bg-[#F97316]/15 hover:bg-[#F97316]/30 rounded-lg transition-colors disabled:opacity-30"
            >
              <ClipboardList className="w-3.5 h-3.5 text-[#F97316]" />
            </button>
            <div className="absolute top-full right-0 mt-1.5 px-2 py-1 bg-[#30363d] text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Generate Report
            </div>
          </div>
          <button
            onClick={() => { setEditingHabit(null); setNewHabitName(''); setNewHabitIcon('⭐'); setNewHabitTarget('Daily'); setNewHabitFrequency('daily'); setShowAddModal(true); }}
            className="p-1.5 bg-[#F97316] text-white rounded-lg hover:bg-[#ff8c5a] transition-colors"
            title="Add new habit"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fetchHabits}
            disabled={loading}
            className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats + Progress — fixed */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { value: `${completionRate}%`, label: 'Today' },
            { value: stats.longestStreak, label: 'Best Streak' },
            { value: `${stats.weeklyCompletion}%`, label: 'This Week' },
            { value: habits.length, label: 'Total' }
          ].map((stat, i) => (
            <div key={i} className="bg-[#0d1117] rounded-lg p-2 text-center border border-[#30363d]">
              <div className="text-sm font-bold text-[#F97316]">{stat.value}</div>
              <div className="text-[10px] text-[#8b949e] mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {habits.length > 0 && !loading && (
          <div className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#8b949e]" />
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wider font-medium">Weekly Progress</span>
              </div>
              <span className="text-[10px] text-[#22c55e] font-medium">{stats.weeklyCompletion}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${stats.weeklyCompletion}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Scrollable habits list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            {loading && habits.length === 0 ? (
              <div className="text-center py-8 text-[#8b949e]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F97316]" />
                <p className="text-xs">Loading habits...</p>
              </div>
            ) : habits.length === 0 ? (
              <div className="text-center py-10">
                <Activity className="w-10 h-10 mx-auto mb-3 text-[#8b949e] opacity-50" />
                <p className="text-sm text-[#8b949e] mb-2">No habits configured</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#F97316]/10 text-[#F97316] rounded-lg text-sm hover:bg-[#F97316]/20 transition-colors"
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
                    onEdit={openEditModal}
                    dayLabels={dayLabels}
                    disabled={hasPendingChanges}
                    onStravaClick={habit.category === 'fitness' ? openStravaModal : undefined}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        </DndContext>

        {/* Legend */}
        {habits.length > 0 && !loading && (
          <div className="mt-3 pt-3 border-t border-[#30363d]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#8b949e]">Last 7 Days</span>
                <div className="flex items-center gap-1">
                  {dayLabels.map((day, i) => (
                    <span key={i} className="text-[10px] text-[#8b949e] w-2 text-center">{day}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[#8b949e]">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#22c55e]" /><span>Done</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#30363d]" /><span>Missed</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Habit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">
                {editingHabit ? 'Edit Habit' : 'Add New Habit'}
              </h3>
              <button onClick={closeHabitModal} className="p-1.5 hover:bg-[#30363d] rounded-lg">
                <X className="w-4 h-4 text-[#8b949e]" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[#8b949e] mb-2">Habit Name</label>
              <input
                type="text"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="e.g., Morning Meditation"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[#8b949e] mb-2">Icon</label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setNewHabitIcon(emoji)}
                    className={`text-xl p-1.5 rounded-lg border transition-all ${
                      newHabitIcon === emoji ? 'border-[#F97316] bg-[#F97316]/20' : 'border-[#30363d] hover:border-[#8b949e]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[#8b949e] mb-2">Frequency</label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setNewHabitFrequency(opt.value)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      newHabitFrequency === opt.value
                        ? 'border-[#F97316] bg-[#F97316]/20 text-[#F97316]'
                        : 'border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs text-[#8b949e] mb-2">Target <span className="text-[#737373]">(optional description)</span></label>
              <input
                type="text"
                value={newHabitTarget}
                onChange={(e) => setNewHabitTarget(e.target.value)}
                placeholder="e.g., 30 min, 2L water, before 9am"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={closeHabitModal} className="flex-1 px-4 py-2 bg-[#30363d] text-white rounded-lg hover:bg-[#484f58] transition-colors text-sm">
                Cancel
              </button>
              <button
                onClick={submitHabit}
                disabled={!newHabitName.trim()}
                className="flex-1 px-4 py-2 bg-[#F97316] text-white rounded-lg hover:bg-[#ff8c5a] transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {editingHabit ? 'Save Changes' : 'Add Habit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Habits Report Modal */}
      {showReportModal && (() => {
        const report = reportReady ? computeReport() : null;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-[#F97316]" />
                  <h3 className="text-sm font-semibold text-white">Habits Report</h3>
                </div>
                <button onClick={() => setShowReportModal(false)} className="p-1 hover:bg-[#30363d] rounded-lg transition-colors">
                  <X className="w-4 h-4 text-[#8b949e]" />
                </button>
              </div>

              {!reportReady ? (
                <div className="px-5 py-6 flex flex-col items-center text-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#F97316]/10 flex items-center justify-center">
                    <ClipboardList className="w-7 h-7 text-[#F97316]" />
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">Generate a Habits Report?</p>
                    <p className="text-xs text-[#8b949e] leading-relaxed">Analyzes your last 7 days to surface what&apos;s working, what needs attention, and what to focus on next.</p>
                  </div>
                  <div className="flex gap-3 w-full pt-2">
                    <button onClick={() => setShowReportModal(false)} className="flex-1 px-4 py-2 bg-[#30363d] text-white rounded-lg hover:bg-[#484f58] transition-colors text-sm">Cancel</button>
                    <button onClick={() => setReportReady(true)} className="flex-1 px-4 py-2 bg-[#F97316] text-white rounded-lg hover:bg-[#ff8c5a] transition-colors text-sm font-medium">Generate Report</button>
                  </div>
                </div>
              ) : report && (
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                  <p className="text-[10px] text-[#8b949e]">Generated {report.generatedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })} EST</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'This Week', value: `${stats.weeklyCompletion}%` },
                      { label: 'Today', value: `${stats.completedToday}/${stats.totalHabits}` },
                      { label: 'Best Streak', value: `${stats.longestStreak}d` },
                    ].map(s => (
                      <div key={s.label} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 text-center">
                        <div className="text-base font-bold text-[#F97316]">{s.value}</div>
                        <div className="text-[10px] text-[#8b949e] mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2"><TrendingUp className="w-3.5 h-3.5 text-[#F97316]" /><span className="text-xs font-semibold text-[#F97316]">Recommendations</span></div>
                    <div className="space-y-2">
                      {report.recommendations.map((rec, i) => (
                        <div key={i} className="flex gap-2 text-xs text-[#8b949e] leading-relaxed">
                          <span className="text-[#F97316] flex-shrink-0 font-bold">→</span><span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {report.strong.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" /><span className="text-xs font-semibold text-[#22c55e]">On Track</span><span className="text-[10px] text-[#8b949e]">({report.strong.length})</span></div>
                      <div className="space-y-1.5">
                        {report.strong.map(h => (
                          <div key={h.id} className="flex items-center justify-between bg-[#22c55e]/5 border border-[#22c55e]/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0"><span className="text-base flex-shrink-0">{h.icon}</span><span className="text-xs text-white truncate">{h.name}</span></div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-2"><span className="text-[10px] text-[#8b949e]">{h.weeklyCompletions}/{h.weeklyGoal} days</span><span className="text-[10px] font-medium text-[#22c55e]">{h.weeklyRate}%</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.moderate.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2"><Minus className="w-3.5 h-3.5 text-[#d29922]" /><span className="text-xs font-semibold text-[#d29922]">Moderate</span><span className="text-[10px] text-[#8b949e]">({report.moderate.length})</span></div>
                      <div className="space-y-1.5">
                        {report.moderate.map(h => (
                          <div key={h.id} className="flex items-center justify-between bg-[#d29922]/5 border border-[#d29922]/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0"><span className="text-base flex-shrink-0">{h.icon}</span><span className="text-xs text-white truncate">{h.name}</span></div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-2"><span className="text-[10px] text-[#8b949e]">{h.weeklyCompletions}/{h.weeklyGoal} days</span><span className="text-[10px] font-medium text-[#d29922]">{h.weeklyRate}%</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.struggling.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" /><span className="text-xs font-semibold text-[#ef4444]">Needs Attention</span><span className="text-[10px] text-[#8b949e]">({report.struggling.length})</span></div>
                      <div className="space-y-1.5">
                        {report.struggling.map(h => (
                          <div key={h.id} className="flex items-center justify-between bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0"><span className="text-base flex-shrink-0">{h.icon}</span><span className="text-xs text-white truncate">{h.name}</span></div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-2"><span className="text-[10px] text-[#8b949e]">{h.weeklyCompletions}/{h.weeklyGoal} days</span><span className="text-[10px] font-medium text-[#ef4444]">{h.weeklyRate}%</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Strava Modal */}
      {showStravaModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] flex-shrink-0">
              <div className="flex items-center gap-2">
                <StravaIcon className="w-4 h-4 text-[#FC4C02]" />
                <h3 className="text-sm font-semibold text-white">Strava Activity</h3>
                {stravaData && (
                  <span className="text-[10px] text-[#8b949e]">— {stravaData.athlete.name}</span>
                )}
              </div>
              <button onClick={() => setShowStravaModal(false)} className="p-1 hover:bg-[#30363d] rounded-lg transition-colors">
                <X className="w-4 h-4 text-[#8b949e]" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {stravaLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 text-[#FC4C02] animate-spin" />
                  <p className="text-xs text-[#8b949e]">Loading Strava data...</p>
                </div>
              )}
              {stravaError && (
                <div className="text-center py-10">
                  <p className="text-xs text-[#ef4444]">{stravaError}</p>
                </div>
              )}
              {stravaData && !stravaLoading && (
                <div className="space-y-4">
                  {/* Week stats */}
                  {stravaData.weekStats && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Runs', value: String(stravaData.weekStats.runs) },
                        { label: 'Miles', value: stravaData.weekStats.miles },
                        { label: 'Time', value: stravaData.weekStats.time },
                      ].map(s => (
                        <div key={s.label} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 text-center">
                          <div className="text-base font-bold text-[#FC4C02]">{s.value}</div>
                          <div className="text-[10px] text-[#8b949e] mt-0.5">This Week · {s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent activities */}
                  <div>
                    <p className="text-[10px] text-[#8b949e] mb-2 uppercase tracking-wide">Recent Activities</p>
                    <div className="space-y-2">
                      {stravaData.activities.map((a, i) => (
                        <div key={a.id} className={`p-3 rounded-lg border ${i === 0 ? 'border-[#FC4C02]/40 bg-[#FC4C02]/5' : 'border-[#30363d] bg-[#0d1117]'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-white">{a.name}</span>
                            <span className="text-[10px] text-[#8b949e]">
                              {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#30363d] rounded text-[#8b949e]">{a.type}</span>
                            <span className="flex items-center gap-1 text-[10px] text-[#e6edf3]">
                              <MapPin className="w-3 h-3 text-[#FC4C02]" />{a.distance} mi
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-[#e6edf3]">
                              <Timer className="w-3 h-3 text-[#FC4C02]" />{a.duration}
                            </span>
                            {a.pace && (
                              <span className="text-[10px] text-[#8b949e]">{a.pace}</span>
                            )}
                            {a.elevationGain > 0 && (
                              <span className="text-[10px] text-[#8b949e]">↑ {a.elevationGain}ft</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
