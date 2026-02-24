'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Target, Plus, X, FileText, Bot, CheckCircle, Circle, Loader2, Check, AlertCircle, RotateCcw, AlertTriangle, Calendar, Clock, Trash2, Square, Checkbox } from 'lucide-react';

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
  junoAssisted?: boolean;
  actionItems?: ActionItem[];
  source?: 'mj' | 'juno' | 'subagent';
  dueDate?: string;
  createdAt?: string;
}

interface GoalsData {
  yearly: Goal[];
  weekly: Goal[];
  daily: Goal[];
  collaborative: Goal[];
}

type Phase = 'not-started' | 'in-progress' | 'achieved';
type Category = 'yearly' | 'weekly' | 'daily' | 'collaborative';
type Source = 'mj' | 'juno' | 'subagent';

const phaseLabels: Record<Phase, string> = {
  'not-started': 'Not Started',
  'in-progress': 'In Progress',
  'achieved': 'Achieved'
};

const phaseColors: Record<Phase, string> = {
  'not-started': 'bg-[#737373]/20 border-[#737373]/50 text-[#737373]',
  'in-progress': 'bg-[#d29922]/20 border-[#d29922]/50 text-[#d29922]',
  'achieved': 'bg-[#22c55e]/20 border-[#22c55e]/50 text-[#22c55e]'
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
  collaborative: 'Tasks with Juno & subagents'
};

const sourceLabels: Record<Source, { label: string; color: string; icon: string }> = {
  mj: { label: 'MJ', color: 'text-[#F97316]', icon: '👤' },
  juno: { label: 'Juno', color: 'text-purple-400', icon: '🤖' },
  subagent: { label: 'Subagent', color: 'text-blue-400', icon: '⚡' }
};

export default function GoalsCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [goals, setGoals] = useState<GoalsData>({
    yearly: [],
    weekly: [],
    daily: [],
    collaborative: []
  });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalNotes, setNewGoalNotes] = useState('');
  const [newGoalDueDate, setNewGoalDueDate] = useState('');
  const [draggedGoal, setDraggedGoal] = useState<Goal | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Notes modal state
  const [notesGoal, setNotesGoal] = useState<Goal | null>(null);
  const [notesContent, setNotesContent] = useState('');

  // Juno-assisted state
  const [showActionItemsModal, setShowActionItemsModal] = useState(false);
  const [actionItemsGoal, setActionItemsGoal] = useState<Goal | null>(null);
  const [newActionItem, setNewActionItem] = useState('');

  // Notes modal title editing state
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDueDate, setEditingDueDate] = useState('');

  // Notification state
  const [notification, setNotification] = useState<Notification | null>(null);
  const [notificationTimeout, setNotificationTimeout] = useState<NodeJS.Timeout | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<Goal | null>(null);

  // Multi-select bulk delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Initialize active category from URL query param (using 'goalTab' to avoid conflict with main page tabs)
  useEffect(() => {
    const tabParam = searchParams.get('goalTab');
    if (tabParam && ['daily', 'weekly', 'yearly', 'collaborative'].includes(tabParam)) {
      setActiveCategory(tabParam as Category);
    }
  }, [searchParams]);

  // Update URL when tab changes (using replace to avoid bloating history)
  const handleCategoryChange = (category: Category) => {
    setActiveCategory(category);
    setSelectedIds(new Set()); // Clear selection when changing categories
    const params = new URLSearchParams(searchParams.toString());
    params.set('goalTab', category);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Notification helpers
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'undo' = 'success', deletedGoal?: Goal) => {
    // Clear any existing timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    setNotification({ message, type, deletedGoal });

    // Auto-dismiss after 5 seconds (except for undo)
    if (type !== 'undo') {
      const timeout = setTimeout(() => {
        setNotification(null);
      }, 5000);
      setNotificationTimeout(timeout);
    }
  }, [notificationTimeout]);

  const dismissNotification = useCallback(() => {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }
    setNotification(null);
  }, [notificationTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeout) {
        clearTimeout(notificationTimeout);
      }
    };
  }, [notificationTimeout]);

  // Fetch goals on mount
  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/goals');
      const data = await response.json();
      if (data.success) {
        setGoals(data.data);
        setSelectedIds(new Set()); // Clear selection on refresh
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
        body: JSON.stringify({
          goalId: goal.id,
          newPhase,
          category: goal.category
        })
      });

      if (response.ok) {
        const phaseLabel = newPhase === 'achieved' ? 'Goal achieved! 🎉' : 
                          newPhase === 'in-progress' ? 'Goal in progress' : 
                          'Goal moved back';
        showNotification(phaseLabel, 'success');
      } else {
        showNotification('Failed to move goal', 'error');
        fetchGoals();
      }
    } catch (error) {
      console.error('Failed to move goal:', error);
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
        body: JSON.stringify({
          goalId: goal.id,
          fromCategory: originalCategory,
          toCategory: newCategory
        })
      });

      if (response.ok) {
        showNotification(`Goal moved to ${categoryLabels[newCategory]}`, 'success');
      } else {
        showNotification('Failed to move goal', 'error');
        fetchGoals();
      }
    } catch (error) {
      console.error('Failed to move goal category:', error);
      showNotification('Failed to move goal', 'error');
      fetchGoals();
    }
  };

  const addGoal = async () => {
    if (!newGoalTitle.trim()) return;

    try {
      const response = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newGoalTitle,
          category: activeCategory,
          notes: newGoalNotes,
          dueDate: newGoalDueDate || undefined
        })
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
    } catch (error) {
      console.error('Failed to add goal:', error);
      showNotification('Failed to add goal', 'error');
    }
  };

  const deleteGoal = async (goal: Goal) => {
    // Show confirmation instead of deleting immediately
    setDeleteConfirm(goal);
  };

  const executeDelete = async (goal: Goal) => {
    // Store goal before deleting for potential undo
    const deletedGoal = { ...goal };
    
    // Optimistically remove from UI
    const updatedGoals = { ...goals };
    updatedGoals[goal.category] = updatedGoals[goal.category].filter(g => g.id !== goal.id);
    setGoals(updatedGoals);
    
    // Show undo notification
    showNotification('Goal deleted', 'undo', deletedGoal);

    try {
      const response = await fetch(`/api/goals?goalId=${goal.id}&category=${goal.category}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        // Restore on error
        setGoals(goals);
        showNotification('Failed to delete goal', 'error');
      }
    } catch (error) {
      console.error('Failed to delete goal:', error);
      // Restore on error
      setGoals(goals);
      showNotification('Failed to delete goal', 'error');
    }
  };

  const undoDelete = async () => {
    if (!notification?.deletedGoal) return;

    const goalToRestore = notification.deletedGoal;
    
    // Dismiss notification
    dismissNotification();
    
    // Optimistically restore to UI
    const updatedGoals = { ...goals };
    updatedGoals[goalToRestore.category].push(goalToRestore);
    setGoals(updatedGoals);

    try {
      // Restore goal via API using PUT (create) with the same ID
      const response = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goalToRestore.title,
          category: goalToRestore.category,
          notes: goalToRestore.notes,
          phase: goalToRestore.phase,
          junoAssisted: goalToRestore.junoAssisted,
          actionItems: goalToRestore.actionItems,
          id: goalToRestore.id // Pass the original ID to restore
        })
      });

      if (!response.ok) {
        // If restore fails, refresh to get accurate state
        fetchGoals();
        showNotification('Failed to restore goal', 'error');
      } else {
        const data = await response.json();
        setGoals(data.data);
        showNotification('Goal restored', 'success');
      }
    } catch (error) {
      console.error('Failed to restore goal:', error);
      fetchGoals();
      showNotification('Failed to restore goal', 'error');
    }
  };

  // Multi-select handlers
  const toggleSelection = (goalId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(goalId)) {
      newSelected.delete(goalId);
    } else {
      newSelected.add(goalId);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    const currentGoals = goals[activeCategory] || [];
    if (selectedIds.size === currentGoals.length && currentGoals.length > 0) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all in current category
      setSelectedIds(new Set(currentGoals.map(g => g.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const executeBulkDelete = async () => {
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    const deletedGoals: Goal[] = [];

    // Get goals data before deleting for potential undo
    idsToDelete.forEach(id => {
      const goal = goals[activeCategory]?.find(g => g.id === id);
      if (goal) deletedGoals.push(goal);
    });

    try {
      // Delete goals one by one (API doesn't support bulk delete yet)
      for (const goalId of idsToDelete) {
        const goal = goals[activeCategory]?.find(g => g.id === goalId);
        if (goal) {
          await fetch(`/api/goals?goalId=${goalId}&category=${goal.category}`, {
            method: 'DELETE'
          });
        }
      }

      // Refresh the list
      await fetchGoals();
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      showNotification(`${idsToDelete.length} goal${idsToDelete.length !== 1 ? 's' : ''} deleted`, 'success');
    } catch (error) {
      console.error('Error deleting goals:', error);
      showNotification('Failed to delete some goals', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Notes functions
  const openNotes = (goal: Goal) => {
    setNotesGoal(goal);
    setNotesContent(goal.notes || '');
    setEditingTitle(goal.title);
    setEditingDueDate(goal.dueDate || '');
  };

  const closeNotes = () => {
    setNotesGoal(null);
    setNotesContent('');
    setEditingTitle('');
    setEditingDueDate('');
  };

  const saveNotes = async () => {
    if (!notesGoal) return;

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: notesGoal.id,
          category: notesGoal.category,
          notes: notesContent,
          title: editingTitle.trim() || notesGoal.title,
          dueDate: editingDueDate || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        closeNotes();
        showNotification('Goal updated', 'success');
      } else {
        showNotification('Failed to save changes', 'error');
      }
    } catch (error) {
      console.error('Failed to save goal:', error);
      showNotification('Failed to save changes', 'error');
    }
  };

  // Juno-assisted functions
  const toggleJunoAssisted = async (goal: Goal) => {
    const newValue = !goal.junoAssisted;
    
    const updatedGoals = { ...goals };
    const goalIndex = updatedGoals[goal.category].findIndex(g => g.id === goal.id);
    if (goalIndex > -1) {
      updatedGoals[goal.category][goalIndex].junoAssisted = newValue;
      setGoals(updatedGoals);
    }

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: goal.id,
          category: goal.category,
          junoAssisted: newValue
        })
      });

      if (!response.ok) {
        fetchGoals();
        showNotification('Failed to update Juno setting', 'error');
      } else {
        await fetchGoals();
        showNotification(newValue ? 'Juno assistance enabled' : 'Juno assistance disabled', 'success');
      }
    } catch (error) {
      console.error('Failed to toggle Juno-assisted:', error);
      fetchGoals();
      showNotification('Failed to update Juno setting', 'error');
    }
  };

  const openActionItems = (goal: Goal) => {
    setActionItemsGoal(goal);
  };

  const closeActionItems = () => {
    setActionItemsGoal(null);
    setNewActionItem('');
  };

  const addActionItem = async () => {
    if (!actionItemsGoal || !newActionItem.trim()) return;

    const newItem: ActionItem = {
      id: `ai-${Date.now()}`,
      text: newActionItem.trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const currentItems = actionItemsGoal.actionItems || [];
    const updatedItems = [...currentItems, newItem];

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: actionItemsGoal.id,
          category: actionItemsGoal.category,
          actionItems: updatedItems
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        setActionItemsGoal({ ...actionItemsGoal, actionItems: updatedItems });
        setNewActionItem('');
        await fetchGoals();
      }
    } catch (error) {
      console.error('Failed to add action item:', error);
    }
  };

  const updateActionItemStatus = async (itemId: string, newStatus: ActionItem['status']) => {
    if (!actionItemsGoal) return;

    const updatedItems = (actionItemsGoal.actionItems || []).map(item =>
      item.id === itemId ? { ...item, status: newStatus } : item
    );

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: actionItemsGoal.id,
          category: actionItemsGoal.category,
          actionItems: updatedItems
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        setActionItemsGoal({ ...actionItemsGoal, actionItems: updatedItems });
        await fetchGoals();
      }
    } catch (error) {
      console.error('Failed to update action item:', error);
    }
  };

  const deleteActionItem = async (itemId: string) => {
    if (!actionItemsGoal) return;

    const updatedItems = (actionItemsGoal.actionItems || []).filter(item => item.id !== itemId);

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: actionItemsGoal.id,
          category: actionItemsGoal.category,
          actionItems: updatedItems
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        setActionItemsGoal({ ...actionItemsGoal, actionItems: updatedItems });
        await fetchGoals();
      }
    } catch (error) {
      console.error('Failed to delete action item:', error);
    }
  };

  const handleDragStart = (goal: Goal) => {
    setDraggedGoal(goal);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, phase: Phase) => {
    e.preventDefault();
    if (draggedGoal && draggedGoal.phase !== phase) {
      moveGoal(draggedGoal, phase);
    }
    setDraggedGoal(null);
  };

  const getGoalsByPhase = (category: Category, phase: Phase) => {
    let filtered = goals[category]?.filter(g => g.phase === phase) || [];
    return filtered;
  };

  const getProgressStats = (category: Category) => {
    const categoryGoals = goals[category] || [];
    const total = categoryGoals.length;
    const achieved = categoryGoals.filter(g => g.phase === 'achieved').length;
    const percentage = total > 0 ? Math.round((achieved / total) * 100) : 0;
    return { total, achieved, percentage };
  };

  const stats = getProgressStats(activeCategory);

  // Render goal card with notes button and Juno-assisted features
  const renderGoalCard = (goal: Goal, phase: Phase, isMobileView: boolean) => {
    const pendingActions = (goal.actionItems || []).filter(item => item.status === 'pending').length;
    const isCollaborative = goal.category === 'collaborative' || goal.source !== 'mj';
    const source = goal.source || 'mj';
    const sourceInfo = sourceLabels[source];
    const isSelected = selectedIds.has(goal.id);
    
    const cardContent = (
      <>
        {/* Header with checkbox and source badge */}
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Selection checkbox */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelection(goal.id); }}
              className="flex-shrink-0 text-[#8b949e] hover:text-[#F97316] transition-colors p-1 -ml-1"
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5 text-[#F97316]" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
            {isCollaborative && (
              <div className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 rounded text-[10px] ${sourceInfo.color}`}>
                <span>{sourceInfo.icon}</span>
                <span className="hidden sm:inline">{sourceInfo.label}</span>
              </div>
            )}
            <div className="flex flex-col flex-1 min-w-0">
              <p className={`text-sm truncate ${isSelected ? 'text-[#F97316]' : 'text-white'}`}>
                {goal.title}
              </p>
              {goal.dueDate && (
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3 text-[#F97316]" />
                  <span className="text-[10px] text-[#F97316]">
                    {new Date(goal.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-1 ${isMobileView ? 'flex-shrink-0' : ''}`}>
            {/* Action items indicator */}
            {pendingActions > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-[#d29922]/20 rounded text-[10px] text-[#d29922] hover:bg-[#d29922]/30 transition-colors"
                title={`${pendingActions} pending action items`}
              >
                <CheckCircle className="w-3 h-3" />
                {pendingActions}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); openNotes(goal); }}
              className="p-1.5 bg-[#262626] hover:bg-[#F97316]/20 text-[#737373] hover:text-[#F97316] rounded-lg transition-colors"
              title="View/Edit Notes"
            >
              <FileText className={`w-4 h-4 ${goal.notes ? 'text-[#F97316]' : ''}`} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteGoal(goal); }}
              className="p-1.5 bg-[#262626] hover:bg-[#da3633]/20 text-[#737373] hover:text-[#da3633] rounded-lg transition-colors"
              title="Delete goal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Action items button for collaborative goals */}
        {isCollaborative && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-purple-400/70">
              {goal.actionItems?.length || 0} action items
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 min-h-[44px] min-w-[44px] bg-purple-500/20 text-purple-400 rounded-full hover:bg-purple-500/30 transition-colors font-medium"
            >
              Action Items
              <span className="text-purple-300">→</span>
            </button>
          </div>
        )}
        
        {/* For personal goals: Juno checkbox */}
        {!isCollaborative && (
          <div className="flex items-center justify-between mt-2">
            <label 
              className="flex items-center gap-2 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={goal.junoAssisted || false}
                onChange={(e) => { e.stopPropagation(); toggleJunoAssisted(goal); }}
                className="w-3.5 h-3.5 rounded border-[#262626] bg-[#0F0F0F] text-purple-500 focus:ring-purple-500/20"
              />
              <span className="text-[10px] text-[#737373]">Juno-assisted</span>
            </label>
            
            {goal.junoAssisted && (
              <button
                onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
                className="flex items-center gap-1.5 text-xs px-3 py-2 min-h-[44px] min-w-[44px] bg-purple-500/20 text-purple-400 rounded-full hover:bg-purple-500/30 transition-colors font-medium"
              >
                Action Items
                <span className="text-purple-300">→</span>
              </button>
            )}
          </div>
        )}
        
        {goal.notes && (
          <p className="text-xs text-[#737373] mt-2 line-clamp-2 italic">
            {goal.notes}
          </p>
        )}
        
        <div className={`flex gap-2 mt-2 ${isMobileView ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          {phase !== 'not-started' && (
            <button
              onClick={(e) => { e.stopPropagation(); moveGoal(goal, 'not-started'); }}
              className="text-[10px] px-2 py-1 bg-[#262626] rounded hover:bg-[#404040] transition-colors"
            >
              ← Back
            </button>
          )}
          {phase !== 'achieved' && (
            <button
              onClick={(e) => { e.stopPropagation(); moveGoal(goal, phase === 'not-started' ? 'in-progress' : 'achieved'); }}
              className="text-[10px] px-2 py-1 bg-[#262626] rounded hover:bg-[#404040] transition-colors"
            >
              {phase === 'not-started' ? 'Start →' : 'Done →'}
            </button>
          )}
        </div>
        
        {/* Move to category - only for non-collaborative goals */}
        {!isCollaborative && !isMobileView && (
          <div className="flex gap-1 mt-2 pt-2 border-t border-[#262626]/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-[#737373] mr-1">Move to:</span>
            {(['daily', 'weekly', 'yearly'] as Category[]).filter(cat => cat !== goal.category).map((cat) => (
              <button
                key={cat}
                onClick={(e) => { e.stopPropagation(); moveCategory(goal, cat); }}
                className="text-[10px] px-2 py-1 bg-[#0F0F0F] text-[#737373] rounded hover:bg-[#F97316]/20 hover:text-[#F97316] transition-colors"
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>
        )}
      </>
    );

    if (isMobileView) {
      return (
        <div
          key={goal.id}
          className={`p-4 rounded-xl border ${phaseColors[phase]} border-opacity-30 ${isCollaborative ? 'ring-1 ring-purple-500/30' : ''}`}
        >
          {cardContent}
        </div>
      );
    }

    return (
      <div
        key={goal.id}
        draggable
        onDragStart={() => handleDragStart(goal)}
        onClick={() => openNotes(goal)}
        className={`group p-4 rounded-xl border cursor-pointer transition-all hover:shadow-lg ${phaseColors[phase]} border-opacity-30 ${isCollaborative ? 'ring-1 ring-purple-500/30' : ''}`}
      >
        {cardContent}
      </div>
    );
  };

  // Mobile view
  if (isMobile) {
    const currentGoals = goals[activeCategory] || [];
    const allSelected = currentGoals.length > 0 && selectedIds.size === currentGoals.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < currentGoals.length;

    return (
      <div className="card">
        {/* Mobile Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#F97316]/10 rounded-xl">
              <Target className="w-4 h-4 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {activeCategory === 'collaborative' ? 'Tasks' : 'Goals'}
              </h2>
              <p className="text-xs text-[#737373]">{categoryDescriptions[activeCategory]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 ? (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center gap-1 px-3 py-2 bg-[#da3633]/20 hover:bg-[#da3633]/30 text-[#f85149] rounded-xl text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                ({selectedIds.size})
              </button>
            ) : (
              <button
                onClick={() => setShowAddModal(true)}
                className="p-2 bg-[#F97316] text-white rounded-xl"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Category Tabs - Two-level navigation */}
        {/* Primary tabs: Personal vs Collaborative */}
        <div className="segmented-control mb-4">
          <button
            onClick={() => handleCategoryChange('daily')}
            className={`segment ${activeCategory !== 'collaborative' ? 'segment-active' : 'segment-inactive'}`}
          >
            Personal
          </button>
          <button
            onClick={() => handleCategoryChange('collaborative')}
            className={`segment ${activeCategory === 'collaborative' ? 'segment-active' : 'segment-inactive'}`}
          >
            Collaborative
          </button>
        </div>

        {/* Secondary tabs: Only show for personal goals */}
        {activeCategory !== 'collaborative' && (
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {(['daily', 'weekly', 'yearly'] as Category[]).map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  activeCategory === cat
                    ? 'bg-[#F97316] text-white'
                    : 'bg-[#262626] text-[#737373]'
                }`}
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>
        )}

        {/* Mobile Progress */}
        <div className="mb-6">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>

        {/* Mobile: Stacked Phases */}
        <div className="space-y-4">
          {/* Select All Header */}
          {currentGoals.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-[#8b949e] hover:text-white transition-colors"
              >
                {allSelected ? (
                  <CheckSquare className="w-5 h-5 text-[#F97316]" />
                ) : someSelected ? (
                  <div className="relative">
                    <Square className="w-5 h-5 text-[#8b949e]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-[#F97316] rounded-sm" />
                    </div>
                  </div>
                ) : (
                  <Square className="w-5 h-5" />
                )}
                <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select All'}</span>
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-[#737373] hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => {
            const phaseGoals = getGoalsByPhase(activeCategory, phase);
            return (
              <div key={phase} className="bg-[#0F0F0F] rounded-xl p-4 border border-[#262626]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white">{phaseLabels[phase]}</h3>
                  <span className="text-xs text-[#737373] bg-[#1a1a1a] px-2 py-0.5 rounded-full">
                    {phaseGoals.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {phaseGoals.map((goal) => renderGoalCard(goal, phase, true))}
                  {phaseGoals.length === 0 && (
                    <div className="text-center py-4 text-[#737373] text-xs">
                      No goals
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border-b-0 sm:border-b border-[#262626] max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-[#1a1a1a] pt-4 pb-2 px-4 -mx-4 border-b border-[#262626] sm:static sm:bg-transparent sm:p-0 sm:border-0">
                <h3 className="text-base font-semibold text-white">Add {activeCategory === 'collaborative' ? 'Task' : 'Goal'}</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 -mr-2 hover:bg-[#262626] rounded-lg">
                  <X className="w-5 h-5 text-[#737373]" />
                </button>
              </div>
              <div className="px-4 sm:px-0 pb-4 sm:pb-0">
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="Enter goal..."
                  className="w-full px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm mb-3"
                  onKeyPress={(e) => e.key === 'Enter' && addGoal()}
                />
                <textarea
                  value={newGoalNotes}
                  onChange={(e) => setNewGoalNotes(e.target.value)}
                  placeholder="Add notes (optional)..."
                  className="w-full px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm mb-3 resize-none"
                  rows={3}
                />
                <div className="mb-3">
                  <label className="block text-xs text-[#737373] mb-1">Due Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={newGoalDueDate}
                      onChange={(e) => setNewGoalDueDate(e.target.value)}
                      className="w-full px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm appearance-none"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373] pointer-events-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-3 py-3 bg-[#262626] text-white rounded-xl text-sm font-medium min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addGoal}
                    disabled={!newGoalTitle.trim()}
                    className="flex-1 px-3 py-3 bg-[#F97316] text-white rounded-xl text-sm font-medium disabled:opacity-50 min-h-[44px]"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Notes Modal */}
        {notesGoal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border-b-0 sm:border-b border-[#262626] h-[80vh] sm:h-auto flex flex-col">
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-[#1a1a1a] pt-4 pb-2 px-4 -mx-4 border-b border-[#262626]">
                <h3 className="text-base font-semibold text-white truncate pr-4">Edit Goal</h3>
                <button onClick={closeNotes} className="p-2 -mr-2 hover:bg-[#262626] rounded-lg flex-shrink-0">
                  <X className="w-5 h-5 text-[#737373]" />
                </button>
              </div>
              
              {/* Title input */}
              <div className="px-4 sm:px-0 mb-3">
                <label className="block text-xs text-[#737373] mb-1">Title</label>
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  placeholder="Enter goal title..."
                  className="w-full px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm"
                />
              </div>

              {/* Due Date */}
              <div className="px-4 sm:px-0 mb-3">
                <label className="block text-xs text-[#737373] mb-1">Due Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={editingDueDate}
                    onChange={(e) => setEditingDueDate(e.target.value)}
                    className="w-full px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm appearance-none"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373] pointer-events-none" />
                </div>
              </div>

              {/* Created At - Read Only */}
              {notesGoal?.createdAt && (
                <div className="px-4 sm:px-0 mb-3">
                  <label className="block text-xs text-[#737373] mb-1">Created</label>
                  <div className="flex items-center gap-2 px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-[#737373] text-sm">
                    <Clock className="w-4 h-4" />
                    {new Date(notesGoal.createdAt).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'America/New_York' 
                    })}
                  </div>
                </div>
              )}
              
              {/* Notes textarea */}
              <div className="flex-1 px-4 sm:px-0 mb-3">
                <label className="block text-xs text-[#737373] mb-1">Notes</label>
                <textarea
                  value={notesContent}
                  onChange={(e) => setNotesContent(e.target.value)}
                  placeholder="Add notes about this goal..."
                  className="w-full h-[200px] px-3 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm resize-none overflow-y-auto"
                />
              </div>
              
              <div className="flex gap-2 sticky bottom-0 bg-[#1a1a1a] pt-2 pb-4 px-4 -mx-4 border-t border-[#262626] sm:static sm:bg-transparent sm:p-0 sm:border-0">
                <button
                  onClick={closeNotes}
                  className="flex-1 px-3 py-3 bg-[#262626] text-white rounded-xl text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNotes}
                  className="flex-1 px-3 py-3 bg-[#F97316] text-white rounded-xl text-sm font-medium min-h-[44px]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Action Items Modal */}
        {actionItemsGoal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border-b-0 sm:border-b border-[#262626] h-[80vh] sm:h-auto sm:max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-[#1a1a1a] pt-4 pb-2 px-4 -mx-4 border-b border-[#262626]">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  <span className="text-base font-semibold text-white">Action Items</span>
                </div>
                <button onClick={() => { setActionItemsGoal(null); setNewActionItem(''); }} className="p-2 -mr-2 hover:bg-[#262626] rounded-lg">
                  <X className="w-5 h-5 text-[#737373]" />
                </button>
              </div>
              <p className="text-xs text-[#737373] mb-3 px-4 sm:px-0 truncate">{actionItemsGoal.title}</p>
              <div className="flex gap-2 mb-3 px-4 sm:px-0">
                <input
                  type="text"
                  value={newActionItem}
                  onChange={(e) => setNewActionItem(e.target.value)}
                  placeholder="Add action item..."
                  className="flex-1 px-3 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm min-h-[44px]"
                  onKeyPress={(e) => e.key === 'Enter' && addActionItem()}
                />
                <button
                  onClick={addActionItem}
                  disabled={!newActionItem.trim()}
                  className="px-3 py-2 bg-purple-500 text-white rounded-xl disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-4 sm:px-0 space-y-2">
                {(actionItemsGoal.actionItems || []).length === 0 ? (
                  <div className="text-center py-4 text-[#737373] text-xs">
                    <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No action items yet</p>
                  </div>
                ) : (
                  (actionItemsGoal.actionItems || []).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 p-3 bg-[#0F0F0F] rounded-lg">
                      <button onClick={() => updateActionItemStatus(item.id, item.status === 'completed' ? 'pending' : 'completed')} className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center">
                        {item.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-[#737373]" />
                        )}
                      </button>
                      <span className={`flex-1 text-xs ${item.status === 'completed' ? 'line-through text-[#737373]' : 'text-white'}`}>
                        {item.text}
                      </span>
                      <button onClick={() => deleteActionItem(item.id)} className="text-[#737373] hover:text-red-500 min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => { setActionItemsGoal(null); setNewActionItem(''); }}
                className="w-full mt-3 px-3 py-3 bg-[#262626] text-white rounded-xl text-sm font-medium min-h-[44px] sticky bottom-0"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Mobile Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-sm">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-6 h-6 text-[#da3633]" />
                <h3 className="text-lg font-semibold text-white">Delete Goal?</h3>
              </div>
              <p className="text-[#737373] mb-6 text-sm">
                Are you sure you want to delete &quot;{deleteConfirm.title}&quot;? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    executeDelete(deleteConfirm);
                    setDeleteConfirm(null);
                  }}
                  className="flex-1 px-4 py-3 bg-[#da3633] text-white rounded-xl text-sm font-medium min-h-[44px]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Bulk Delete Confirmation Modal */}
        {showBulkDeleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-sm">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-6 h-6 text-[#da3633]" />
                <h3 className="text-lg font-semibold text-white">Delete Goals?</h3>
              </div>
              <p className="text-[#737373] mb-6 text-sm">
                Are you sure you want to delete {selectedIds.size} goal{selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={executeBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-3 bg-[#da3633] text-white rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isBulkDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop view
  const currentGoals = goals[activeCategory] || [];
  const allSelected = currentGoals.length > 0 && selectedIds.size === currentGoals.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < currentGoals.length;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-xl">
            <Target className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {activeCategory === 'collaborative' ? 'Collaborative Tasks' : 'Goals'}
            </h2>
            <p className="text-xs text-[#737373]">
              {categoryDescriptions[activeCategory]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <>
              <span className="text-sm text-[#8b949e] mr-2">{selectedIds.size} selected</span>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#da3633]/20 hover:bg-[#da3633]/30 text-[#f85149] rounded-xl text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={clearSelection}
                className="p-2 text-[#737373] hover:text-white transition-colors"
                title="Clear selection"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#F97316] text-white rounded-xl text-sm hover:bg-[#ff8c5a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add {activeCategory === 'collaborative' ? 'Task' : 'Goal'}
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs - Segmented Control */}
      <div className="segmented-control mb-6">
        {(['personal', 'collaborative'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => handleCategoryChange(tab === 'personal' ? 'daily' : 'collaborative')}
            className={`segment ${
              (tab === 'personal' && activeCategory !== 'collaborative') || 
              (tab === 'collaborative' && activeCategory === 'collaborative')
                ? 'segment-active' 
                : 'segment-inactive'
            }`}
          >
            {tab === 'personal' ? (
              <>
                <span className="hidden sm:inline">Personal Goals</span>
                <span className="sm:hidden">Personal</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Collaborative Tasks</span>
                <span className="sm:hidden">Collaborative</span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Personal Goals Sub-tabs - Only show when in personal mode */}
      {activeCategory !== 'collaborative' && (
        <div className="flex gap-2 mb-6">
          {(['daily', 'weekly', 'yearly'] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                activeCategory === cat
                  ? 'bg-[#F97316] text-white'
                  : 'bg-[#262626] text-[#737373] hover:text-white'
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="metric-label">Progress</span>
          <span className="text-xs font-medium text-[#F97316]">{stats.percentage}%</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
      </div>

      {/* KanBan Board */}
      <div className="grid grid-cols-3 gap-4">
        {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => {
          const phaseGoals = getGoalsByPhase(activeCategory, phase);
          const phaseSelectedCount = phaseGoals.filter(g => selectedIds.has(g.id)).length;
          const allPhaseSelected = phaseGoals.length > 0 && phaseSelectedCount === phaseGoals.length;
          
          return (
            <div
              key={phase}
              className="bg-[#0F0F0F] rounded-xl p-4 min-h-[300px] border border-[#262626]"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, phase)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const phaseGoalIds = phaseGoals.map(g => g.id);
                      const newSelected = new Set(selectedIds);
                      if (allPhaseSelected) {
                        // Deselect all in this phase
                        phaseGoalIds.forEach(id => newSelected.delete(id));
                      } else {
                        // Select all in this phase
                        phaseGoalIds.forEach(id => newSelected.add(id));
                      }
                      setSelectedIds(newSelected);
                    }}
                    className="text-[#8b949e] hover:text-[#F97316] transition-colors"
                    title={allPhaseSelected ? "Deselect all in this column" : "Select all in this column"}
                  >
                    {allPhaseSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#F97316]" />
                    ) : phaseSelectedCount > 0 ? (
                      <div className="relative">
                        <Square className="w-4 h-4" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-[#F97316] rounded-sm" />
                        </div>
                      </div>
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <h3 className="text-sm font-medium text-white">{phaseLabels[phase]}</h3>
                </div>
                <span className="text-xs text-[#737373] bg-[#1a1a1a] px-2 py-1 rounded-full">
                  {phaseGoals.length}
                </span>
              </div>

              <div className="space-y-2">
                {phaseGoals.map((goal) => renderGoalCard(goal, phase, false))}
                {phaseGoals.length === 0 && (
                  <div className="text-center py-8 text-[#737373] text-sm">
                    Drop goals here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Goal Modal - Desktop */}
      {showAddModal && !isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add {activeCategory === 'collaborative' ? 'Collaborative Task' : categoryLabels[activeCategory] + ' Goal'}</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[#262626] rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>
            
            <input
              type="text"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              placeholder="Enter goal title..."
              className="w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316] mb-4"
              onKeyPress={(e) => e.key === 'Enter' && addGoal()}
            />

            <textarea
              value={newGoalNotes}
              onChange={(e) => setNewGoalNotes(e.target.value)}
              placeholder="Add notes about this goal (optional)..."
              className="w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316] mb-4 resize-none"
              rows={4}
            />

            {/* Due Date */}
            <div className="mb-4">
              <label className="block text-xs text-[#737373] mb-2 uppercase tracking-wider">Due Date (Optional)</label>
              <div className="relative">
                <input
                  type="date"
                  value={newGoalDueDate}
                  onChange={(e) => setNewGoalDueDate(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white focus:outline-none focus:border-[#F97316] appearance-none"
                />
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#737373] pointer-events-none" />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={addGoal}
                disabled={!newGoalTitle.trim()}
                className="flex-1 px-4 py-3 bg-[#F97316] text-white rounded-xl hover:bg-[#ff8c5a] transition-colors disabled:opacity-50 font-medium min-h-[44px]"
              >
                Add {activeCategory === 'collaborative' ? 'Task' : 'Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal - Desktop */}
      {notesGoal && !isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-lg font-semibold text-white">Edit Goal</h3>
              </div>
              <button
                onClick={closeNotes}
                className="p-2 hover:bg-[#262626] rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>
            
            {/* Title input field */}
            <div className="mb-4">
              <label className="block text-xs text-[#737373] mb-2 uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                placeholder="Enter goal title..."
                className="w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            {/* Due Date */}
            <div className="mb-4">
              <label className="block text-xs text-[#737373] mb-2 uppercase tracking-wider">Due Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={editingDueDate}
                  onChange={(e) => setEditingDueDate(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white focus:outline-none focus:border-[#F97316] appearance-none"
                />
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#737373] pointer-events-none" />
              </div>
            </div>
            
            {/* Notes textarea */}
            <div className="flex-1 mb-4">
              <label className="block text-xs text-[#737373] mb-2 uppercase tracking-wider">Notes</label>
              <textarea
                value={notesContent}
                onChange={(e) => setNotesContent(e.target.value)}
                placeholder="Add notes, links, research, or any details about this goal..."
                className="w-full h-[300px] px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316] resize-none overflow-y-auto"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={closeNotes}
                className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={saveNotes}
                className="flex-1 px-4 py-3 bg-[#F97316] text-white rounded-xl hover:bg-[#ff8c5a] transition-colors font-medium min-h-[44px]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Items Modal - Desktop */}
      {actionItemsGoal && !isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-xl">
                  <Bot className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Action Items</h3>
                  <p className="text-sm text-[#737373] truncate max-w-[300px] sm:max-w-[400px]">{actionItemsGoal.title}</p>
                </div>
              </div>
              <button
                onClick={closeActionItems}
                className="p-2 hover:bg-[#262626] rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>

            {/* Add new action item */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newActionItem}
                onChange={(e) => setNewActionItem(e.target.value)}
                placeholder="Add a new action item for Juno..."
                className="flex-1 px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-purple-500"
                onKeyPress={(e) => e.key === 'Enter' && addActionItem()}
              />
              <button
                onClick={addActionItem}
                disabled={!newActionItem.trim()}
                className="px-4 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Action items list */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {(actionItemsGoal.actionItems || []).length === 0 ? (
                <div className="text-center py-8 text-[#737373]">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No action items yet.</p>
                  <p className="text-sm mt-1">Add items for Juno to work on!</p>
                </div>
              ) : (
                (actionItemsGoal.actionItems || []).map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      item.status === 'completed'
                        ? 'bg-[#22c55e]/10 border-[#22c55e]/30'
                        : item.status === 'in-progress'
                        ? 'bg-[#d29922]/10 border-[#d29922]/30'
                        : 'bg-[#0F0F0F] border-[#262626]'
                    }`}
                  >
                    <button
                      onClick={() => updateActionItemStatus(item.id, 
                        item.status === 'completed' ? 'pending' : 
                        item.status === 'in-progress' ? 'completed' : 'in-progress'
                      )}
                      className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {item.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-[#22c55e]" />
                      ) : item.status === 'in-progress' ? (
                        <Loader2 className="w-5 h-5 text-[#d29922] animate-spin" />
                      ) : (
                        <Circle className="w-5 h-5 text-[#737373]" />
                      )}
                    </button>
                    
                    <span className={`flex-1 ${item.status === 'completed' ? 'line-through text-[#737373]' : 'text-white'}`}>
                      {item.text}
                    </span>
                    
                    <button
                      onClick={() => deleteActionItem(item.id)}
                      className="text-[#737373] hover:text-[#da3633] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Juno assistance indicator */}
            {actionItemsGoal.junoAssisted && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl mb-4">
                <div className="flex items-center gap-2 text-purple-400">
                  <Bot className="w-4 h-4" />
                  <span className="text-sm font-medium">Juno is monitoring this goal</span>
                </div>
                <p className="text-xs text-[#737373] mt-1">
                  Juno will ask before taking action on pending items
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={closeActionItems}
                className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors font-medium min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal - Desktop */}
      {deleteConfirm && !isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-6 h-6 text-[#da3633]" />
              <h3 className="text-lg font-semibold text-white">Delete Goal?</h3>
            </div>
            <p className="text-[#737373] mb-6">
              Are you sure you want to delete &quot;{deleteConfirm.title}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executeDelete(deleteConfirm);
                  setDeleteConfirm(null);
                }}
                className="flex-1 px-4 py-3 bg-[#da3633] text-white rounded-xl hover:bg-red-600 transition-colors font-medium min-h-[44px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal - Desktop */}
      {showBulkDeleteConfirm && !isMobile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-[#da3633]/20 rounded-full">
                <Trash2 className="w-6 h-6 text-[#f85149]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Delete Goals</h3>
                <p className="text-sm text-[#737373]">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mb-6 p-4 bg-[#0F0F0F] rounded-xl">
              <p className="text-white font-medium">
                Are you sure you want to delete {selectedIds.size} goal{selectedIds.size !== 1 ? 's' : ''}?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={isBulkDeleting}
                className="flex-1 px-4 py-3 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors font-medium min-h-[44px] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkDelete}
                disabled={isBulkDeleting}
                className="flex-1 px-4 py-3 bg-[#da3633] text-white rounded-xl hover:bg-red-600 transition-colors font-medium min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete {selectedIds.size}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Banner */}
      {notification && (
        <div className={`fixed bottom-4 right-4 z-[60] p-4 rounded-xl shadow-lg border animate-in slide-in-from-bottom-2 fade-in duration-200 ${
          notification.type === 'undo' 
            ? 'bg-orange-500/20 border-orange-500' 
            : notification.type === 'error'
            ? 'bg-red-500/20 border-red-500'
            : 'bg-green-500/20 border-green-500'
        }`}>
          <div className="flex items-center gap-3">
            {notification.type === 'success' && <Check className="w-5 h-5 text-green-400" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
            {notification.type === 'undo' && <RotateCcw className="w-5 h-5 text-orange-400" />}
            <span className="text-white font-medium">{notification.message}</span>
            {notification.type === 'undo' && (
              <button 
                onClick={undoDelete}
                className="ml-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                Undo
              </button>
            )}
            <button 
              onClick={dismissNotification}
              className="ml-1 p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
