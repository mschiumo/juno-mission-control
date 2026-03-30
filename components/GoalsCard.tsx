'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Target, Plus, X, FileText, Bot, CheckCircle, Circle, Loader2, Check, AlertCircle, RotateCcw, AlertTriangle, Calendar, Clock, Trash2, Square, CheckSquare, GripVertical, Search, ChevronRight } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Notification {
  message: string;
  type: 'success' | 'error' | 'undo';
  deletedGoal?: Goal;
}

interface ActionItem {
  id: string;
  text: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
}

interface Goal {
  id: string;
  title: string;
  phase: 'not-started' | 'in-progress' | 'achieved';
  category: 'yearly' | 'weekly' | 'daily' | 'collaborative';
  notes?: string;
  aiAssisted?: boolean;
  actionItems?: ActionItem[];
  source?: 'mj' | 'ai' | 'subagent';
  dueDate?: string;
  createdAt?: string;
  order?: number;
}

interface GoalsData {
  yearly: Goal[];
  weekly: Goal[];
  daily: Goal[];
  collaborative: Goal[];
}

type Phase = 'not-started' | 'in-progress' | 'achieved';
type Category = 'yearly' | 'weekly' | 'daily' | 'collaborative';
type Source = 'mj' | 'ai' | 'subagent';

const phaseLabels: Record<Phase, string> = {
  'not-started': 'Todo',
  'in-progress': 'In Progress',
  'achieved': 'Done'
};

const phaseAccent: Record<Phase, string> = {
  'not-started': '#525252',
  'in-progress': '#d29922',
  'achieved': '#22c55e'
};

const phaseBg: Record<Phase, string> = {
  'not-started': 'bg-[#171717]',
  'in-progress': 'bg-[#171717]',
  'achieved': 'bg-[#171717]'
};

const categoryLabels: Record<Category, string> = {
  yearly: 'Yearly',
  weekly: 'Weekly',
  daily: 'Daily',
  collaborative: 'Collaborative'
};

const categoryDescriptions: Record<Category, string> = {
  yearly: 'Long-term personal goals',
  weekly: 'Weekly personal targets',
  daily: 'Daily habits & tasks',
  collaborative: 'Tasks with AI & subagents'
};

const sourceLabels: Record<Source, { label: string; color: string; icon: string }> = {
  mj: { label: 'MJ', color: 'text-[#F97316]', icon: '👤' },
  ai: { label: 'AI', color: 'text-purple-400', icon: '🤖' },
  subagent: { label: 'Subagent', color: 'text-blue-400', icon: '⚡' }
};

// ─── Sortable Goal Card ────────────────────────────────────────────────────────

interface SortableGoalCardProps {
  goal: Goal;
  phase: Phase;
  isSelected: boolean;
  selectedIds: Set<string>;
  toggleSelection: (goalId: string) => void;
  openNotes: (goal: Goal) => void;
  deleteGoal: (goal: Goal) => void;
  openActionItems: (goal: Goal) => void;
  moveGoal: (goal: Goal, newPhase: Phase) => void;
  moveCategory: (goal: Goal, newCategory: Category) => void;
  toggleAiAssisted: (goal: Goal) => void;
}

function SortableGoalCard({
  goal,
  phase,
  isSelected,
  toggleSelection,
  openNotes,
  deleteGoal,
  openActionItems,
  moveGoal,
  moveCategory,
  toggleAiAssisted
}: SortableGoalCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: goal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const pendingActions = (goal.actionItems || []).filter(item => item.status === 'pending').length;
  const isCollaborative = goal.category === 'collaborative' || goal.source !== 'mj';
  const source = (goal.source || 'mj') as Source;
  const sourceInfo = sourceLabels[source] ?? sourceLabels['mj'];
  const accent = phaseAccent[phase];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-stretch bg-[#1c1c1c] hover:bg-[#222] rounded-lg border transition-all cursor-pointer
        ${isSelected ? 'border-[#F97316]/60 ring-1 ring-[#F97316]/30' : 'border-[#2a2a2a] hover:border-[#333]'}
        ${isDragging ? 'shadow-2xl ring-2 ring-[#F97316]/40' : ''}
      `}
      onClick={() => openNotes(goal)}
    >
      {/* Left accent bar */}
      <div
        className="w-0.5 flex-shrink-0 rounded-l-lg"
        style={{ backgroundColor: accent }}
      />

      {/* Card body */}
      <div className="flex-1 px-3 py-2.5 min-w-0">
        {/* Title row */}
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 mt-0.5 text-[#444] hover:text-[#888] cursor-grab active:cursor-grabbing transition-colors opacity-0 group-hover:opacity-100"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          {/* Title */}
          <p className={`flex-1 text-sm leading-snug min-w-0 ${
            phase === 'achieved' ? 'line-through text-[#555]' : 'text-[#e8e8e8]'
          }`}>
            {goal.title}
          </p>

          {/* Selection checkbox - only visible on hover or when selected */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelection(goal.id); }}
            className={`flex-shrink-0 mt-0.5 transition-all ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {isSelected
              ? <CheckSquare className="w-3.5 h-3.5 text-[#F97316]" />
              : <Square className="w-3.5 h-3.5 text-[#555]" />
            }
          </button>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {goal.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#555]" />
              <span className="text-[11px] text-[#666]">
                {new Date(goal.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
              </span>
            </div>
          )}

          {isCollaborative && (
            <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 ${sourceInfo.color}`}>
              <span>{sourceInfo.icon}</span>
              <span>{sourceInfo.label}</span>
            </div>
          )}

          {pendingActions > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-[#d29922]/15 rounded text-[10px] text-[#d29922] hover:bg-[#d29922]/25 transition-colors"
            >
              <CheckCircle className="w-3 h-3" />
              {pendingActions}
            </button>
          )}

          {goal.notes && (
            <div className="flex items-center gap-0.5">
              <FileText className="w-3 h-3 text-[#F97316]/60" />
            </div>
          )}
        </div>

        {/* Action items row — always visible for collaborative/AI-assisted goals */}
        {(isCollaborative || goal.aiAssisted) && (
          <button
            onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
            className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[11px] transition-colors w-full"
          >
            <Bot className="w-3 h-3 flex-shrink-0" />
            <span>Action Items</span>
            {pendingActions > 0 && (
              <span className="ml-auto px-1.5 py-0.5 bg-[#d29922]/20 text-[#d29922] rounded text-[10px]">{pendingActions} pending</span>
            )}
            <ChevronRight className="w-3 h-3 ml-auto text-purple-400/50" />
          </button>
        )}
      </div>

      {/* Hover actions */}
      <div className="flex flex-col items-center justify-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {phase !== 'achieved' && (
          <button
            onClick={(e) => { e.stopPropagation(); moveGoal(goal, phase === 'not-started' ? 'in-progress' : 'achieved'); }}
            className="p-1 rounded hover:bg-[#333] text-[#555] hover:text-[#22c55e] transition-colors"
            title={phase === 'not-started' ? 'Start' : 'Mark done'}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {phase !== 'not-started' && (
          <button
            onClick={(e) => { e.stopPropagation(); moveGoal(goal, phase === 'achieved' ? 'in-progress' : 'not-started'); }}
            className="p-1 rounded hover:bg-[#333] text-[#555] hover:text-[#52525b] transition-colors"
            title="Move back"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); deleteGoal(goal); }}
          className="p-1 rounded hover:bg-[#333] text-[#555] hover:text-[#da3633] transition-colors"
          title="Delete"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Mobile Goal Card ──────────────────────────────────────────────────────────

interface MobileGoalCardProps {
  goal: Goal;
  phase: Phase;
  isSelected: boolean;
  selectedIds: Set<string>;
  toggleSelection: (goalId: string) => void;
  openNotes: (goal: Goal) => void;
  deleteGoal: (goal: Goal) => void;
  openActionItems: (goal: Goal) => void;
  moveGoal: (goal: Goal, newPhase: Phase) => void;
}

function MobileGoalCard({
  goal,
  phase,
  isSelected,
  toggleSelection,
  openNotes,
  deleteGoal,
  openActionItems,
  moveGoal
}: MobileGoalCardProps) {
  const pendingActions = (goal.actionItems || []).filter(item => item.status === 'pending').length;
  const isCollaborative = goal.category === 'collaborative' || goal.source !== 'mj';
  const source = (goal.source || 'mj') as Source;
  const sourceInfo = sourceLabels[source] ?? sourceLabels['mj'];
  const accent = phaseAccent[phase];

  return (
    <div
      className={`flex items-stretch rounded-lg border transition-all
        ${isSelected ? 'border-[#F97316]/60 bg-[#1c1c1c]' : 'border-[#2a2a2a] bg-[#1c1c1c]'}
      `}
      onClick={() => openNotes(goal)}
    >
      <div className="w-0.5 flex-shrink-0 rounded-l-lg" style={{ backgroundColor: accent }} />

      <div className="flex-1 px-3 py-2.5 min-w-0">
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelection(goal.id); }}
            className="flex-shrink-0 mt-0.5"
          >
            {isSelected
              ? <CheckSquare className="w-4 h-4 text-[#F97316]" />
              : <Square className="w-4 h-4 text-[#444]" />
            }
          </button>
          <p className={`flex-1 text-sm leading-snug ${phase === 'achieved' ? 'line-through text-[#555]' : 'text-[#e8e8e8]'}`}>
            {goal.title}
          </p>
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {goal.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#555]" />
              <span className="text-[11px] text-[#666]">
                {new Date(goal.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
              </span>
            </div>
          )}
          {isCollaborative && (
            <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 ${sourceInfo.color}`}>
              <span>{sourceInfo.icon}</span>
              <span>{sourceInfo.label}</span>
            </div>
          )}
          {pendingActions > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-[#d29922]/15 rounded text-[10px] text-[#d29922]"
            >
              <CheckCircle className="w-3 h-3" />
              {pendingActions}
            </button>
          )}
          {goal.notes && <FileText className="w-3 h-3 text-[#F97316]/60" />}
        </div>

        {/* Action items — always visible for collaborative/AI-assisted */}
        {(isCollaborative || goal.aiAssisted) && (
          <button
            onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
            className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[11px] transition-colors w-full"
          >
            <Bot className="w-3 h-3 flex-shrink-0" />
            <span>Action Items</span>
            {pendingActions > 0 && (
              <span className="ml-auto px-1.5 py-0.5 bg-[#d29922]/20 text-[#d29922] rounded text-[10px]">{pendingActions}</span>
            )}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center justify-center gap-1 px-2">
        {phase !== 'achieved' && (
          <button
            onClick={(e) => { e.stopPropagation(); moveGoal(goal, phase === 'not-started' ? 'in-progress' : 'achieved'); }}
            className="p-1.5 rounded hover:bg-[#333] text-[#555] hover:text-[#22c55e] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); deleteGoal(goal); }}
          className="p-1.5 rounded hover:bg-[#333] text-[#555] hover:text-[#da3633] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function GoalsCard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [goals, setGoals] = useState<GoalsData>({ yearly: [], weekly: [], daily: [], collaborative: [] });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalNotes, setNewGoalNotes] = useState('');
  const [newGoalDueDate, setNewGoalDueDate] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [notesGoal, setNotesGoal] = useState<Goal | null>(null);
  const [notesContent, setNotesContent] = useState('');
  const [showActionItemsModal, setShowActionItemsModal] = useState(false);
  const [actionItemsGoal, setActionItemsGoal] = useState<Goal | null>(null);
  const [newActionItem, setNewActionItem] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDueDate, setEditingDueDate] = useState('');

  const [notification, setNotification] = useState<Notification | null>(null);
  const [notificationTimeout, setNotificationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Goal | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get('goalTab');
    if (tabParam && ['daily', 'weekly', 'yearly', 'collaborative'].includes(tabParam)) {
      setActiveCategory(tabParam as Category);
    }
  }, [searchParams]);

  const handleCategoryChange = (category: Category) => {
    setActiveCategory(category);
    setSelectedIds(new Set());
    const params = new URLSearchParams(searchParams.toString());
    params.set('goalTab', category);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'undo' = 'success', deletedGoal?: Goal) => {
    if (notificationTimeout) clearTimeout(notificationTimeout);
    setNotification({ message, type, deletedGoal });
    if (type !== 'undo') {
      const timeout = setTimeout(() => setNotification(null), 5000);
      setNotificationTimeout(timeout);
    }
  }, [notificationTimeout]);

  const dismissNotification = useCallback(() => {
    if (notificationTimeout) clearTimeout(notificationTimeout);
    setNotification(null);
  }, [notificationTimeout]);

  useEffect(() => {
    return () => { if (notificationTimeout) clearTimeout(notificationTimeout); };
  }, [notificationTimeout]);

  useEffect(() => { fetchGoals(); }, []);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/goals');
      const data = await response.json();
      if (data.success) {
        setGoals(data.data);
        setSelectedIds(new Set());
      }
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const moveGoal = async (goal: Goal, newPhase: Phase) => {
    const updatedGoals = { ...goals };
    const goalIndex = updatedGoals[goal.category].findIndex(g => g.id === goal.id);
    if (goalIndex > -1) {
      updatedGoals[goal.category][goalIndex].phase = newPhase;
      setGoals(updatedGoals);
    }
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.id, newPhase, category: goal.category })
      });
      if (response.ok) {
        const phaseLabel = newPhase === 'achieved' ? 'Goal achieved!' : newPhase === 'in-progress' ? 'Started' : 'Moved back';
        showNotification(phaseLabel, 'success');
      } else {
        showNotification('Failed to move goal', 'error');
        fetchGoals();
      }
    } catch {
      showNotification('Failed to move goal', 'error');
      fetchGoals();
    }
  };

  const moveCategory = async (goal: Goal, newCategory: Category) => {
    if (goal.category === newCategory) return;
    const originalCategory = goal.category;
    const updatedGoals = { ...goals };
    const goalIndex = updatedGoals[goal.category].findIndex(g => g.id === goal.id);
    if (goalIndex > -1) {
      const [movedGoal] = updatedGoals[goal.category].splice(goalIndex, 1);
      movedGoal.category = newCategory;
      updatedGoals[newCategory].push(movedGoal);
      setGoals(updatedGoals);
    }
    try {
      const response = await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.id, fromCategory: originalCategory, toCategory: newCategory })
      });
      if (response.ok) {
        showNotification(`Moved to ${categoryLabels[newCategory]}`, 'success');
      } else {
        showNotification('Failed to move goal', 'error');
        fetchGoals();
      }
    } catch {
      showNotification('Failed to move goal', 'error');
      fetchGoals();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleReorderGoals = async (phase: Phase, oldIndex: number, newIndex: number) => {
    const phaseGoals = getGoalsByPhase(activeCategory, phase);
    if (oldIndex === newIndex) return;
    const reorderedGoals = arrayMove(phaseGoals, oldIndex, newIndex);
    const updatedGoals = { ...goals };
    updatedGoals[activeCategory] = updatedGoals[activeCategory].map(goal => {
      const newOrderIndex = reorderedGoals.findIndex(g => g.id === goal.id);
      if (newOrderIndex !== -1 && goal.phase === phase) return { ...goal, order: newOrderIndex };
      return goal;
    });
    setGoals(updatedGoals);
    try {
      const orderedIds = reorderedGoals.map(g => g.id);
      const response = await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: true, category: activeCategory, orderedIds })
      });
      if (!response.ok) { fetchGoals(); showNotification('Failed to reorder', 'error'); }
    } catch {
      fetchGoals();
      showNotification('Failed to reorder', 'error');
    }
  };

  const addGoal = async () => {
    if (!newGoalTitle.trim()) return;
    try {
      const response = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newGoalTitle, category: activeCategory, notes: newGoalNotes, dueDate: newGoalDueDate || undefined })
      });
      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        setNewGoalTitle('');
        setNewGoalNotes('');
        setNewGoalDueDate('');
        setShowAddModal(false);
        showNotification('Goal added', 'success');
      } else {
        showNotification('Failed to add goal', 'error');
      }
    } catch {
      showNotification('Failed to add goal', 'error');
    }
  };

  const deleteGoal = (goal: Goal) => setDeleteConfirm(goal);

  const executeDelete = async (goal: Goal) => {
    const deletedGoal = { ...goal };
    const updatedGoals = { ...goals };
    updatedGoals[goal.category] = updatedGoals[goal.category].filter(g => g.id !== goal.id);
    setGoals(updatedGoals);
    showNotification('Goal deleted', 'undo', deletedGoal);
    try {
      const response = await fetch(`/api/goals?goalId=${goal.id}&category=${goal.category}`, { method: 'DELETE' });
      if (!response.ok) { setGoals(goals); showNotification('Failed to delete goal', 'error'); }
    } catch {
      setGoals(goals);
      showNotification('Failed to delete goal', 'error');
    }
  };

  const undoDelete = async () => {
    if (!notification?.deletedGoal) return;
    const goalToRestore = notification.deletedGoal;
    dismissNotification();
    const updatedGoals = { ...goals };
    updatedGoals[goalToRestore.category].push(goalToRestore);
    setGoals(updatedGoals);
    try {
      const response = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: goalToRestore.title, category: goalToRestore.category, notes: goalToRestore.notes, phase: goalToRestore.phase, aiAssisted: goalToRestore.aiAssisted, actionItems: goalToRestore.actionItems, id: goalToRestore.id })
      });
      if (!response.ok) { fetchGoals(); showNotification('Failed to restore goal', 'error'); }
      else { const data = await response.json(); setGoals(data.data); showNotification('Goal restored', 'success'); }
    } catch {
      fetchGoals();
      showNotification('Failed to restore goal', 'error');
    }
  };

  const toggleSelection = (goalId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(goalId)) newSelected.delete(goalId);
    else newSelected.add(goalId);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    const currentGoals = goals[activeCategory] || [];
    if (selectedIds.size === currentGoals.length && currentGoals.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(currentGoals.map(g => g.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const executeBulkDelete = async () => {
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    try {
      for (const goalId of idsToDelete) {
        const goal = goals[activeCategory]?.find(g => g.id === goalId);
        if (goal) await fetch(`/api/goals?goalId=${goalId}&category=${goal.category}`, { method: 'DELETE' });
      }
      await fetchGoals();
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      showNotification(`${idsToDelete.length} goal${idsToDelete.length !== 1 ? 's' : ''} deleted`, 'success');
    } catch {
      showNotification('Failed to delete some goals', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const openNotes = (goal: Goal) => {
    setNotesGoal(goal);
    setNotesContent(goal.notes || '');
    setEditingTitle(goal.title);
    setEditingDueDate(goal.dueDate || '');
  };

  const closeNotes = () => { setNotesGoal(null); setNotesContent(''); setEditingTitle(''); setEditingDueDate(''); };

  const saveNotes = async () => {
    if (!notesGoal) return;
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: notesGoal.id, category: notesGoal.category, notes: notesContent, title: editingTitle.trim() || notesGoal.title, dueDate: editingDueDate || undefined })
      });
      if (response.ok) { const data = await response.json(); setGoals(data.data); closeNotes(); showNotification('Saved', 'success'); }
      else showNotification('Failed to save', 'error');
    } catch {
      showNotification('Failed to save', 'error');
    }
  };

  const toggleAiAssisted = async (goal: Goal) => {
    const newValue = !goal.aiAssisted;
    const updatedGoals = { ...goals };
    const goalIndex = updatedGoals[goal.category].findIndex(g => g.id === goal.id);
    if (goalIndex > -1) { updatedGoals[goal.category][goalIndex].aiAssisted = newValue; setGoals(updatedGoals); }
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.id, category: goal.category, aiAssisted: newValue })
      });
      if (!response.ok) { fetchGoals(); showNotification('Failed to update', 'error'); }
      else { await fetchGoals(); showNotification(newValue ? 'AI assistance on' : 'AI assistance off', 'success'); }
    } catch {
      fetchGoals();
      showNotification('Failed to update', 'error');
    }
  };

  const openActionItems = (goal: Goal) => setActionItemsGoal(goal);
  const closeActionItems = () => { setActionItemsGoal(null); setNewActionItem(''); };

  const addActionItem = async () => {
    if (!actionItemsGoal || !newActionItem.trim()) return;
    const newItem: ActionItem = { id: `ai-${Date.now()}`, text: newActionItem.trim(), status: 'pending', createdAt: new Date().toISOString() };
    const updatedItems = [...(actionItemsGoal.actionItems || []), newItem];
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: actionItemsGoal.id, category: actionItemsGoal.category, actionItems: updatedItems })
      });
      if (response.ok) { const data = await response.json(); setGoals(data.data); setActionItemsGoal({ ...actionItemsGoal, actionItems: updatedItems }); setNewActionItem(''); await fetchGoals(); }
    } catch { console.error('Failed to add action item'); }
  };

  const updateActionItemStatus = async (itemId: string, newStatus: ActionItem['status']) => {
    if (!actionItemsGoal) return;
    const updatedItems = (actionItemsGoal.actionItems || []).map(item => item.id === itemId ? { ...item, status: newStatus } : item);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: actionItemsGoal.id, category: actionItemsGoal.category, actionItems: updatedItems })
      });
      if (response.ok) { const data = await response.json(); setGoals(data.data); setActionItemsGoal({ ...actionItemsGoal, actionItems: updatedItems }); await fetchGoals(); }
    } catch { console.error('Failed to update action item'); }
  };

  const deleteActionItem = async (itemId: string) => {
    if (!actionItemsGoal) return;
    const updatedItems = (actionItemsGoal.actionItems || []).filter(item => item.id !== itemId);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: actionItemsGoal.id, category: actionItemsGoal.category, actionItems: updatedItems })
      });
      if (response.ok) { const data = await response.json(); setGoals(data.data); setActionItemsGoal({ ...actionItemsGoal, actionItems: updatedItems }); await fetchGoals(); }
    } catch { console.error('Failed to delete action item'); }
  };

  const getProgressStats = (category: Category) => {
    const categoryGoals = goals[category] || [];
    const total = categoryGoals.length;
    const achieved = categoryGoals.filter(g => g.phase === 'achieved').length;
    const percentage = total > 0 ? Math.round((achieved / total) * 100) : 0;
    return { total, achieved, percentage };
  };

  const getGoalsByPhase = (category: Category, phase: Phase) => {
    return (goals[category]?.filter(g => g.phase === phase) || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  };

  const filterGoalsBySearch = (goalsList: Goal[]): Goal[] => {
    if (!searchQuery.trim()) return goalsList;
    const query = searchQuery.toLowerCase().trim();
    return goalsList.filter(goal =>
      goal.title?.toLowerCase().includes(query) ||
      goal.notes?.toLowerCase().includes(query) ||
      goal.actionItems?.some(item => item.text?.toLowerCase().includes(query)) ||
      goal.source?.toLowerCase().includes(query)
    );
  };

  const getFilteredGoalsByPhase = (category: Category, phase: Phase): Goal[] => filterGoalsBySearch(getGoalsByPhase(category, phase));

  const getAllMatchingGoals = (): Goal[] => {
    if (!searchQuery.trim()) return [];
    return filterGoalsBySearch([...goals.yearly, ...goals.weekly, ...goals.daily, ...goals.collaborative]);
  };

  const stats = getProgressStats(activeCategory);

  // ─── Shared Modals (used by both mobile and desktop) ────────────────────────

  const modals = (
    <>
      {/* Add Goal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222]">
              <h3 className="text-sm font-semibold text-white">
                Add {activeCategory === 'collaborative' ? 'Task' : categoryLabels[activeCategory] + ' Goal'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors">
                <X className="w-4 h-4 text-[#666]" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                type="text"
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Goal title..."
                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm placeholder-[#444] focus:outline-none focus:border-[#F97316]/50 transition-colors"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && addGoal()}
              />
              <textarea
                value={newGoalNotes}
                onChange={(e) => setNewGoalNotes(e.target.value)}
                placeholder="Notes (optional)..."
                className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm placeholder-[#444] focus:outline-none focus:border-[#F97316]/50 transition-colors resize-none"
                rows={3}
              />
              <div>
                <label className="block text-[11px] text-[#555] mb-1.5 uppercase tracking-wider">Due Date</label>
                <input
                  type="date"
                  value={newGoalDueDate}
                  onChange={(e) => setNewGoalDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm focus:outline-none focus:border-[#F97316]/50 appearance-none transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 bg-[#222] text-[#aaa] rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors">
                Cancel
              </button>
              <button onClick={addGoal} disabled={!newGoalTitle.trim()} className="flex-1 px-4 py-2.5 bg-[#F97316] text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-[#ea6c12] transition-colors">
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes / Edit Modal */}
      {notesGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: phaseAccent[notesGoal.phase] }} />
                <span className="text-xs text-[#555]">{phaseLabels[notesGoal.phase]}</span>
              </div>
              <button onClick={closeNotes} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors">
                <X className="w-4 h-4 text-[#666]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="block text-[11px] text-[#555] mb-1.5 uppercase tracking-wider">Title</label>
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm focus:outline-none focus:border-[#F97316]/50 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#555] mb-1.5 uppercase tracking-wider">Due Date</label>
                  <input
                    type="date"
                    value={editingDueDate}
                    onChange={(e) => setEditingDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm focus:outline-none focus:border-[#F97316]/50 appearance-none transition-colors"
                  />
                </div>
                {notesGoal.createdAt && (
                  <div>
                    <label className="block text-[11px] text-[#555] mb-1.5 uppercase tracking-wider">Created</label>
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-[#555] text-sm">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      {new Date(notesGoal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Assisted toggle */}
              {notesGoal.category !== 'collaborative' && notesGoal.source === 'mj' && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-[#aaa]">AI-assisted</span>
                  </div>
                  <button
                    onClick={() => toggleAiAssisted(notesGoal)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${notesGoal.aiAssisted ? 'bg-purple-500' : 'bg-[#333]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notesGoal.aiAssisted ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}

              {(notesGoal.aiAssisted || notesGoal.category === 'collaborative') && (
                <button
                  onClick={() => { closeNotes(); openActionItems(notesGoal); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-purple-300">Action Items</span>
                    <span className="text-xs text-purple-400/70">
                      {notesGoal.actionItems?.filter(i => i.status === 'pending').length || 0} pending
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-purple-400" />
                </button>
              )}

              <div>
                <label className="block text-[11px] text-[#555] mb-1.5 uppercase tracking-wider">Notes</label>
                <textarea
                  value={notesContent}
                  onChange={(e) => setNotesContent(e.target.value)}
                  placeholder="Add notes, links, or research about this goal..."
                  className="w-full h-40 px-3 py-2.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm placeholder-[#444] focus:outline-none focus:border-[#F97316]/50 resize-none transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5 flex-shrink-0">
              <button onClick={closeNotes} className="flex-1 px-4 py-2.5 bg-[#222] text-[#aaa] rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors">
                Cancel
              </button>
              <button onClick={saveNotes} className="flex-1 px-4 py-2.5 bg-[#F97316] text-white rounded-xl text-sm font-medium hover:bg-[#ea6c12] transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Items Modal */}
      {actionItemsGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-purple-500/10 rounded-lg">
                  <Bot className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Action Items</h3>
                  <p className="text-xs text-[#555] truncate max-w-xs">{actionItemsGoal.title}</p>
                </div>
              </div>
              <button onClick={closeActionItems} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors">
                <X className="w-4 h-4 text-[#666]" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-[#222] flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newActionItem}
                  onChange={(e) => setNewActionItem(e.target.value)}
                  placeholder="New action item..."
                  className="flex-1 px-3 py-2 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl text-white text-sm placeholder-[#444] focus:outline-none focus:border-purple-500/50 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && addActionItem()}
                />
                <button onClick={addActionItem} disabled={!newActionItem.trim()} className="px-3 py-2 bg-purple-500 text-white rounded-xl text-sm disabled:opacity-40 hover:bg-purple-600 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {(actionItemsGoal.actionItems || []).length === 0 ? (
                <div className="text-center py-8 text-[#444]">
                  <Bot className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No action items yet</p>
                </div>
              ) : (
                (actionItemsGoal.actionItems || []).map((item) => (
                  <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                    item.status === 'completed' ? 'bg-[#22c55e]/5 border-[#22c55e]/20' :
                    item.status === 'in-progress' ? 'bg-[#d29922]/5 border-[#d29922]/20' :
                    'bg-[#0d0d0d] border-[#2a2a2a]'
                  }`}>
                    <button
                      onClick={() => updateActionItemStatus(item.id, item.status === 'completed' ? 'pending' : item.status === 'in-progress' ? 'completed' : 'in-progress')}
                      className="flex-shrink-0"
                    >
                      {item.status === 'completed' ? <CheckCircle className="w-4 h-4 text-[#22c55e]" /> :
                       item.status === 'in-progress' ? <Loader2 className="w-4 h-4 text-[#d29922] animate-spin" /> :
                       <Circle className="w-4 h-4 text-[#444]" />}
                    </button>
                    <span className={`flex-1 text-sm ${item.status === 'completed' ? 'line-through text-[#444]' : 'text-[#ddd]'}`}>
                      {item.text}
                    </span>
                    <button onClick={() => deleteActionItem(item.id)} className="text-[#444] hover:text-[#da3633] transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            {actionItemsGoal.aiAssisted && (
              <div className="mx-5 mb-3 p-3 bg-purple-500/8 border border-purple-500/20 rounded-xl flex-shrink-0">
                <div className="flex items-center gap-2 text-purple-400">
                  <Bot className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">AI is monitoring this goal</span>
                </div>
              </div>
            )}
            <div className="px-5 pb-5 flex-shrink-0">
              <button onClick={closeActionItems} className="w-full px-4 py-2.5 bg-[#222] text-[#aaa] rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#222] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#da3633]" />
              <h3 className="text-sm font-semibold text-white">Delete goal?</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-[#777]">&quot;{deleteConfirm.title}&quot; will be permanently deleted.</p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-[#222] text-[#aaa] rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors">Cancel</button>
              <button onClick={() => { executeDelete(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 px-4 py-2.5 bg-[#da3633] text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#222] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#da3633]" />
              <h3 className="text-sm font-semibold text-white">Delete {selectedIds.size} goal{selectedIds.size !== 1 ? 's' : ''}?</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-[#777]">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setShowBulkDeleteConfirm(false)} disabled={isBulkDeleting} className="flex-1 px-4 py-2.5 bg-[#222] text-[#aaa] rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={executeBulkDelete} disabled={isBulkDeleting} className="flex-1 px-4 py-2.5 bg-[#da3633] text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {isBulkDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`fixed bottom-4 right-4 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium ${
          notification.type === 'undo' ? 'bg-[#1a1200] border-[#F97316]/40 text-white' :
          notification.type === 'error' ? 'bg-[#1a0000] border-[#da3633]/40 text-white' :
          'bg-[#001a08] border-[#22c55e]/40 text-white'
        }`}>
          {notification.type === 'success' && <Check className="w-4 h-4 text-[#22c55e]" />}
          {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-[#da3633]" />}
          {notification.type === 'undo' && <RotateCcw className="w-4 h-4 text-[#F97316]" />}
          <span>{notification.message}</span>
          {notification.type === 'undo' && (
            <button onClick={undoDelete} className="px-2.5 py-1 bg-[#F97316] text-white rounded-lg text-xs hover:bg-[#ea6c12] transition-colors">
              Undo
            </button>
          )}
          <button onClick={dismissNotification} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>
      )}
    </>
  );

  // ─── Mobile View ─────────────────────────────────────────────────────────────

  if (isMobile) {
    const currentGoals = goals[activeCategory] || [];

    return (
      <div className="card">
        {/* Mobile Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-semibold text-white">Goals</h2>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 ? (
              <>
                <button onClick={() => setShowBulkDeleteConfirm(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-[#da3633]/15 text-[#f85149] rounded-lg text-xs">
                  <Trash2 className="w-3.5 h-3.5" /> {selectedIds.size}
                </button>
                <button onClick={clearSelection} className="p-1.5 text-[#555] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-[#F97316] text-white rounded-lg text-xs font-medium">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {(['daily', 'weekly', 'yearly', 'collaborative'] as Category[]).map((cat) => (
            <button key={cat} onClick={() => handleCategoryChange(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat ? 'bg-[#F97316] text-white' : 'bg-[#1c1c1c] text-[#666] hover:text-[#aaa]'
              }`}>
              {categoryLabels[cat]}
            </button>
          ))}
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-[#555]">{stats.achieved}/{stats.total} complete</span>
            <span className="text-xs text-[#F97316] font-medium">{stats.percentage}%</span>
          </div>
          <div className="h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
            <div className="h-full bg-[#F97316] rounded-full transition-all" style={{ width: `${stats.percentage}%` }} />
          </div>
        </div>

        {/* Phases stacked */}
        <div className="space-y-3">
          {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => {
            const phaseGoals = getFilteredGoalsByPhase(activeCategory, phase);
            return (
              <div key={phase}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: phaseAccent[phase] }} />
                  <span className="text-xs font-medium text-[#888]">{phaseLabels[phase]}</span>
                  <span className="text-xs text-[#444]">{phaseGoals.length}</span>
                </div>
                <div className="space-y-1.5">
                  {phaseGoals.map((goal) => (
                    <MobileGoalCard key={goal.id} goal={goal} phase={phase}
                      isSelected={selectedIds.has(goal.id)} selectedIds={selectedIds}
                      toggleSelection={toggleSelection} openNotes={openNotes}
                      deleteGoal={deleteGoal} openActionItems={openActionItems} moveGoal={moveGoal}
                    />
                  ))}
                  {phaseGoals.length === 0 && (
                    <div className="text-center py-3 text-[#333] text-xs border border-dashed border-[#222] rounded-lg">
                      No goals
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {modals}
      </div>
    );
  }

  // ─── Desktop View ─────────────────────────────────────────────────────────────

  const currentGoals = goals[activeCategory] || [];

  return (
    <div className="card flex flex-col" style={{ height: '680px' }}>
      {/* Header — fixed */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#F97316]/10 rounded-lg">
              <Target className="w-4 h-4 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Goals</h2>
              <p className="text-xs text-[#444]">{categoryDescriptions[activeCategory]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-xs text-[#666]">{selectedIds.size} selected</span>
                <button onClick={() => setShowBulkDeleteConfirm(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#da3633]/15 text-[#f85149] rounded-lg text-xs hover:bg-[#da3633]/25 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={clearSelection} className="p-1.5 text-[#555] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F97316] text-white rounded-lg text-xs font-medium hover:bg-[#ea6c12] transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Add {activeCategory === 'collaborative' ? 'Task' : 'Goal'}
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 mb-4">
          {(['daily', 'weekly', 'yearly', 'collaborative'] as Category[]).map((cat) => {
            const catStats = getProgressStats(cat);
            return (
              <button key={cat} onClick={() => handleCategoryChange(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-[#F97316] text-white shadow-sm'
                    : 'text-[#666] hover:text-[#aaa] hover:bg-[#1c1c1c]'
                }`}>
                {categoryLabels[cat]}
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${activeCategory === cat ? 'bg-white/20' : 'bg-[#222] text-[#555]'}`}>
                  {catStats.total}
                </span>
              </button>
            );
          })}

          {/* Search — inline right */}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#F97316]/40 w-36 focus:w-52 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3 h-3 text-[#444]" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-[#444]">{stats.achieved} of {stats.total} complete</span>
            <span className="text-xs text-[#F97316] font-medium">{stats.percentage}%</span>
          </div>
          <div className="h-0.5 bg-[#1c1c1c] rounded-full overflow-hidden">
            <div className="h-full bg-[#F97316] rounded-full transition-all duration-500" style={{ width: `${stats.percentage}%` }} />
          </div>
        </div>
      </div>

      {/* Kanban board — fills remaining space, columns scroll internally */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => {
          const goalId = event.active.id as string;
          setActiveId(goalId);
          const goal = goals[activeCategory]?.find(g => g.id === goalId);
          if (goal) setActiveGoal(goal);
        }}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          setActiveId(null);
          setActiveGoal(null);
          if (!over) return;
          const activeId = active.id as string;
          const overId = over.id as string;
          const activeGoal = goals[activeCategory]?.find(g => g.id === activeId);
          if (!activeGoal) return;
          const phaseDropZones = ['not-started', 'in-progress', 'achieved'];
          if (phaseDropZones.includes(overId) && activeGoal.phase !== overId) {
            moveGoal(activeGoal, overId as Phase);
            return;
          }
          if (activeId !== overId) {
            const phaseGoals = getGoalsByPhase(activeCategory, activeGoal.phase);
            const oldIndex = phaseGoals.findIndex(g => g.id === activeId);
            const newIndex = phaseGoals.findIndex(g => g.id === overId);
            if (oldIndex !== -1 && newIndex !== -1) handleReorderGoals(activeGoal.phase, oldIndex, newIndex);
          }
        }}
      >
        <div className="flex-1 grid grid-cols-3 gap-3 min-h-0">
          {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => {
            const phaseGoals = getFilteredGoalsByPhase(activeCategory, phase);
            const totalPhaseGoals = getGoalsByPhase(activeCategory, phase);
            const phaseSelectedCount = phaseGoals.filter(g => selectedIds.has(g.id)).length;
            const allPhaseSelected = phaseGoals.length > 0 && phaseSelectedCount === phaseGoals.length;
            const isFiltered = searchQuery.trim().length > 0 && totalPhaseGoals.length !== phaseGoals.length;
            const accent = phaseAccent[phase];

            return (
              <div key={phase} className="flex flex-col min-h-0 bg-[#111] rounded-xl border border-[#1e1e1e]">
                {/* Column header */}
                <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-[#1e1e1e]">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                    <span className="text-xs font-semibold text-[#888]">{phaseLabels[phase]}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      isFiltered ? 'bg-[#F97316]/15 text-[#F97316]' : 'bg-[#1c1c1c] text-[#555]'
                    }`}>
                      {isFiltered ? `${phaseGoals.length}/${totalPhaseGoals.length}` : phaseGoals.length}
                    </span>
                  </div>
                  {/* Select all in column */}
                  <button
                    onClick={() => {
                      const phaseGoalIds = phaseGoals.map(g => g.id);
                      const newSelected = new Set(selectedIds);
                      if (allPhaseSelected) phaseGoalIds.forEach(id => newSelected.delete(id));
                      else phaseGoalIds.forEach(id => newSelected.add(id));
                      setSelectedIds(newSelected);
                    }}
                    className="text-[#333] hover:text-[#666] transition-colors"
                  >
                    {allPhaseSelected
                      ? <CheckSquare className="w-3.5 h-3.5 text-[#F97316]" />
                      : <Square className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>

                {/* Scrollable goal list */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0">
                  <SortableContext items={phaseGoals.map(g => g.id)} strategy={verticalListSortingStrategy} id={phase}>
                    {phaseGoals.map((goal) => (
                      <SortableGoalCard
                        key={goal.id}
                        goal={goal}
                        phase={phase}
                        isSelected={selectedIds.has(goal.id)}
                        selectedIds={selectedIds}
                        toggleSelection={toggleSelection}
                        openNotes={openNotes}
                        deleteGoal={deleteGoal}
                        openActionItems={openActionItems}
                        moveGoal={moveGoal}
                        moveCategory={moveCategory}
                        toggleAiAssisted={toggleAiAssisted}
                      />
                    ))}
                    {phaseGoals.length === 0 && (
                      <div className="h-full min-h-[80px] flex items-center justify-center text-[#2a2a2a] text-xs border border-dashed border-[#1e1e1e] rounded-lg">
                        {searchQuery.trim() ? 'No results' : 'Empty'}
                      </div>
                    )}
                  </SortableContext>
                </div>

                {/* Quick add at bottom of column */}
                <div className="flex-shrink-0 px-2 py-2 border-t border-[#1e1e1e]">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#333] hover:text-[#666] hover:bg-[#1a1a1a] transition-colors text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add goal
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activeGoal ? (
            <div className="flex items-stretch bg-[#222] rounded-lg border-2 border-[#F97316] shadow-2xl px-3 py-2.5 gap-2">
              <GripVertical className="w-3.5 h-3.5 text-[#F97316] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-white">{activeGoal.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {modals}
    </div>
  );
}
