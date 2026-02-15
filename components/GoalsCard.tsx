'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Target, Plus, X, RefreshCw, FileText, Bot, CheckCircle, Circle, Loader2 } from 'lucide-react';

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
  category: 'yearly' | 'weekly' | 'daily';
  notes?: string;
  junoAssisted?: boolean;
  actionItems?: ActionItem[];
}

interface GoalsData {
  yearly: Goal[];
  weekly: Goal[];
  daily: Goal[];
}

type Phase = 'not-started' | 'in-progress' | 'achieved';
type Category = 'yearly' | 'weekly' | 'daily';

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
  daily: 'Daily'
};

export default function GoalsCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [goals, setGoals] = useState<GoalsData>({
    yearly: [],
    weekly: [],
    daily: []
  });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalNotes, setNewGoalNotes] = useState('');
  const [draggedGoal, setDraggedGoal] = useState<Goal | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Notes modal state
  const [notesGoal, setNotesGoal] = useState<Goal | null>(null);
  const [notesContent, setNotesContent] = useState('');

  // Juno-assisted state
  const [showActionItemsModal, setShowActionItemsModal] = useState(false);
  const [actionItemsGoal, setActionItemsGoal] = useState<Goal | null>(null);
  const [newActionItem, setNewActionItem] = useState('');
  const [showJunoOnly, setShowJunoOnly] = useState(false);

  // Initialize active category from URL query param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['daily', 'weekly', 'yearly'].includes(tabParam)) {
      setActiveCategory(tabParam as Category);
    }
  }, [searchParams]);

  // Update URL when tab changes
  const handleCategoryChange = (category: Category) => {
    setActiveCategory(category);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', category);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: goal.id,
          newPhase,
          category: goal.category
        })
      });
    } catch (error) {
      console.error('Failed to move goal:', error);
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
      await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: goal.id,
          fromCategory: originalCategory,
          toCategory: newCategory
        })
      });
    } catch (error) {
      console.error('Failed to move goal category:', error);
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
          notes: newGoalNotes
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        setNewGoalTitle('');
        setNewGoalNotes('');
        setShowAddModal(false);
      }
    } catch (error) {
      console.error('Failed to add goal:', error);
    }
  };

  const deleteGoal = async (goal: Goal) => {
    try {
      const response = await fetch(`/api/goals?goalId=${goal.id}&category=${goal.category}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
      }
    } catch (error) {
      console.error('Failed to delete goal:', error);
    }
  };

  // Notes functions
  const openNotes = (goal: Goal) => {
    setNotesGoal(goal);
    setNotesContent(goal.notes || '');
  };

  const closeNotes = () => {
    setNotesGoal(null);
    setNotesContent('');
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
          notes: notesContent
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        closeNotes();
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
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
      } else {
        await fetchGoals();
      }
    } catch (error) {
      console.error('Failed to toggle Juno-assisted:', error);
      fetchGoals();
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
    if (showJunoOnly) {
      filtered = filtered.filter(g => g.junoAssisted);
    }
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
    const junoBorderClass = goal.junoAssisted ? 'ring-1 ring-purple-500/50' : '';
    
    const cardContent = (
      <>
        {/* Header with Juno badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            {goal.junoAssisted && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 rounded text-[10px] text-purple-400">
                <Bot className="w-3 h-3" />
                <span>JUNO</span>
              </div>
            )}
            <p className="text-sm text-white flex-1">{goal.title}</p>
          </div>
          <div className="flex items-center gap-1">
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
              className="text-[#737373] hover:text-[#F97316] transition-colors"
              title="View/Edit Notes"
            >
              <FileText className={`w-4 h-4 ${goal.notes ? 'text-[#F97316]' : ''}`} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteGoal(goal); }}
              className="text-[#737373] hover:text-[#da3633] transition-colors"
              title="Delete goal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Juno checkbox and action items button */}
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
          
          <button
            onClick={(e) => { e.stopPropagation(); openActionItems(goal); }}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 min-h-[32px] bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            Action Items
            <span className="text-purple-300">→</span>
          </button>
        </div>
        
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
        
        {!isMobileView && (
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
          className={`p-4 rounded-xl border ${phaseColors[phase]} border-opacity-30 ${junoBorderClass}`}
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
        className={`group p-4 rounded-xl border cursor-pointer transition-all hover:shadow-lg ${phaseColors[phase]} border-opacity-30 ${junoBorderClass}`}
      >
        {cardContent}
      </div>
    );
  };

  // Mobile view
  if (isMobile) {
    return (
      <div className="card">
        {/* Mobile Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#F97316]/10 rounded-xl">
              <Target className="w-4 h-4 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Goals</h2>
              <p className="text-xs text-[#737373]">{stats.achieved}/{stats.total} done</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 bg-[#F97316] text-white rounded-xl"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Category Tabs - Segmented Control */}
        <div className="segmented-control mb-6">
          {(['daily', 'weekly', 'yearly'] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`segment ${activeCategory === cat ? 'segment-active' : 'segment-inactive'}`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>

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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Add Goal</h3>
                <button onClick={() => setShowAddModal(false)} className="p-1">
                  <X className="w-4 h-4 text-[#737373]" />
                </button>
              </div>
              <input
                type="text"
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Enter goal..."
                className="w-full px-3 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm mb-3"
                onKeyPress={(e) => e.key === 'Enter' && addGoal()}
              />
              <textarea
                value={newGoalNotes}
                onChange={(e) => setNewGoalNotes(e.target.value)}
                placeholder="Add notes (optional)..."
                className="w-full px-3 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm mb-3 resize-none"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-3 py-2 bg-[#262626] text-white rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={addGoal}
                  disabled={!newGoalTitle.trim()}
                  className="flex-1 px-3 py-2 bg-[#F97316] text-white rounded-xl text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes Modal */}
        {notesGoal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Notes: {notesGoal.title}</h3>
                <button onClick={closeNotes} className="p-1">
                  <X className="w-4 h-4 text-[#737373]" />
                </button>
              </div>
              <textarea
                value={notesContent}
                onChange={(e) => setNotesContent(e.target.value)}
                placeholder="Add notes about this goal..."
                className="flex-1 min-h-[300px] w-full px-3 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white text-sm mb-3 resize-none overflow-y-auto"
              />
              <div className="flex gap-2">
                <button
                  onClick={closeNotes}
                  className="flex-1 px-3 py-2 bg-[#262626] text-white rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNotes}
                  className="flex-1 px-3 py-2 bg-[#F97316] text-white rounded-xl text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop view
  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-xl">
            <Target className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Goals</h2>
            <p className="text-xs text-[#737373]">
              {stats.achieved}/{stats.total} achieved ({stats.percentage}%)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#F97316] text-white rounded-xl text-sm hover:bg-[#ff8c5a] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Goal
          </button>
          
          {/* Juno Filter Toggle */}
          <button
            onClick={() => setShowJunoOnly(!showJunoOnly)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm transition-colors ${
              showJunoOnly
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                : 'bg-[#0F0F0F] text-[#737373] hover:bg-[#262626]'
            }`}
            title={showJunoOnly ? 'Show all goals' : 'Show Juno-assisted only'}
          >
            <Bot className="w-4 h-4" />
            {showJunoOnly ? 'Juno Only' : 'All Goals'}
          </button>
          
          <button
            onClick={fetchGoals}
            disabled={loading}
            className="p-2 hover:bg-[#262626] rounded-xl transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-[#737373] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Category Tabs - Segmented Control */}
      <div className="segmented-control mb-6">
        {(['daily', 'weekly', 'yearly'] as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`segment ${activeCategory === cat ? 'segment-active' : 'segment-inactive'}`}
          >
            {categoryLabels[cat]} Goals
          </button>
        ))}
      </div>

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
        {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => (
          <div
            key={phase}
            className="bg-[#0F0F0F] rounded-xl p-4 min-h-[300px] border border-[#262626]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, phase)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">{phaseLabels[phase]}</h3>
              <span className="text-xs text-[#737373] bg-[#1a1a1a] px-2 py-1 rounded-full">
                {getGoalsByPhase(activeCategory, phase).length}
              </span>
            </div>

            <div className="space-y-2">
              {getGoalsByPhase(activeCategory, phase).map((goal) => renderGoalCard(goal, phase, false))}
              {getGoalsByPhase(activeCategory, phase).length === 0 && (
                <div className="text-center py-8 text-[#737373] text-sm">
                  Drop goals here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Goal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add {categoryLabels[activeCategory]} Goal</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[#262626] rounded-lg"
              >
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>
            
            <input
              type="text"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              placeholder="Enter goal title..."
              className="w-full px-4 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316] mb-4"
              onKeyPress={(e) => e.key === 'Enter' && addGoal()}
            />

            <textarea
              value={newGoalNotes}
              onChange={(e) => setNewGoalNotes(e.target.value)}
              placeholder="Add notes about this goal (optional)..."
              className="w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316] mb-4 resize-none"
              rows={4}
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addGoal}
                disabled={!newGoalTitle.trim()}
                className="flex-1 px-4 py-2 bg-[#F97316] text-white rounded-xl hover:bg-[#ff8c5a] transition-colors disabled:opacity-50"
              >
                Add Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesGoal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-lg font-semibold text-white">Notes</h3>
              </div>
              <button
                onClick={closeNotes}
                className="p-2 hover:bg-[#262626] rounded-lg"
              >
                <X className="w-5 h-5 text-[#737373]" />
              </button>
            </div>
            
            <p className="text-sm text-[#737373] mb-4">{notesGoal.title}</p>
            
            <textarea
              value={notesContent}
              onChange={(e) => setNotesContent(e.target.value)}
              placeholder="Add notes, links, research, or any details about this goal..."
              className="flex-1 min-h-[400px] w-full px-4 py-3 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-[#F97316] mb-4 resize-none overflow-y-auto"
            />
            
            <div className="flex gap-2">
              <button
                onClick={closeNotes}
                className="flex-1 px-4 py-2 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveNotes}
                className="flex-1 px-4 py-2 bg-[#F97316] text-white rounded-xl hover:bg-[#ff8c5a] transition-colors"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Items Modal */}
      {actionItemsGoal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-xl">
                  <Bot className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Action Items</h3>
                  <p className="text-sm text-[#737373]">{actionItemsGoal.title}</p>
                </div>
              </div>
              <button
                onClick={closeActionItems}
                className="p-2 hover:bg-[#262626] rounded-lg"
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
                className="flex-1 px-4 py-2 bg-[#0F0F0F] border border-[#262626] rounded-xl text-white placeholder-[#737373] focus:outline-none focus:border-purple-500"
                onKeyPress={(e) => e.key === 'Enter' && addActionItem()}
              />
              <button
                onClick={addActionItem}
                disabled={!newActionItem.trim()}
                className="px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors disabled:opacity-50"
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
                      className="flex-shrink-0"
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
                      className="text-[#737373] hover:text-[#da3633] transition-colors"
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
                className="flex-1 px-4 py-2 bg-[#262626] text-white rounded-xl hover:bg-[#404040] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
