'use client';

import { useState, useEffect } from 'react';
import { Target, Plus, X, RefreshCw, FileText } from 'lucide-react';

interface Goal {
  id: string;
  title: string;
  phase: 'not-started' | 'in-progress' | 'achieved';
  category: 'yearly' | 'weekly' | 'daily';
  notes?: string;
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
  'not-started': 'bg-[#8b949e]/20 border-[#8b949e]/50 text-[#8b949e]',
  'in-progress': 'bg-[#d29922]/20 border-[#d29922]/50 text-[#d29922]',
  'achieved': 'bg-[#238636]/20 border-[#238636]/50 text-[#238636]'
};

const categoryLabels: Record<Category, string> = {
  yearly: 'Yearly',
  weekly: 'Weekly', 
  daily: 'Daily'
};

export default function GoalsCard() {
  const [goals, setGoals] = useState<GoalsData>({
    yearly: [],
    weekly: [],
    daily: []
  });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [draggedGoal, setDraggedGoal] = useState<Goal | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Notes modal state
  const [notesGoal, setNotesGoal] = useState<Goal | null>(null);
  const [notesContent, setNotesContent] = useState('');

  useEffect(() => {
    fetchGoals();
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
          fromCategory: goal.category,
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
          category: activeCategory
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGoals(data.data);
        setNewGoalTitle('');
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
    return goals[category]?.filter(g => g.phase === phase) || [];
  };

  const getProgressStats = (category: Category) => {
    const categoryGoals = goals[category] || [];
    const total = categoryGoals.length;
    const achieved = categoryGoals.filter(g => g.phase === 'achieved').length;
    const percentage = total > 0 ? Math.round((achieved / total) * 100) : 0;
    return { total, achieved, percentage };
  };

  const stats = getProgressStats(activeCategory);

  // Render goal card with notes button
  const renderGoalCard = (goal: Goal, phase: Phase, isMobileView: boolean) => {
    const cardContent = (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-white flex-1">{goal.title}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); openNotes(goal); }}
              className="text-[#8b949e] hover:text-[#ff6b35] transition-colors"
              title="View/Edit Notes"
            >
              <FileText className={`w-4 h-4 ${goal.notes ? 'text-[#ff6b35]' : ''}`} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteGoal(goal); }}
              className="text-[#8b949e] hover:text-[#da3633] transition-colors"
              title="Delete goal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {goal.notes && (
          <p className="text-xs text-[#8b949e] mt-2 line-clamp-2 italic">
            {goal.notes}
          </p>
        )}
        
        <div className={`flex gap-2 mt-2 ${isMobileView ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          {phase !== 'not-started' && (
            <button
              onClick={(e) => { e.stopPropagation(); moveGoal(goal, 'not-started'); }}
              className="text-[10px] px-2 py-1 bg-[#30363d] rounded hover:bg-[#484f58] transition-colors"
            >
              ← Back
            </button>
          )}
          {phase !== 'achieved' && (
            <button
              onClick={(e) => { e.stopPropagation(); moveGoal(goal, phase === 'not-started' ? 'in-progress' : 'achieved'); }}
              className="text-[10px] px-2 py-1 bg-[#30363d] rounded hover:bg-[#484f58] transition-colors"
            >
              {phase === 'not-started' ? 'Start →' : 'Done →'}
            </button>
          )}
        </div>
        
        {!isMobileView && (
          <div className="flex gap-1 mt-2 pt-2 border-t border-[#30363d]/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-[#8b949e] mr-1">Move to:</span>
            {(['daily', 'weekly', 'yearly'] as Category[]).filter(cat => cat !== goal.category).map((cat) => (
              <button
                key={cat}
                onClick={(e) => { e.stopPropagation(); moveCategory(goal, cat); }}
                className="text-[10px] px-2 py-1 bg-[#21262d] text-[#8b949e] rounded hover:bg-[#ff6b35]/20 hover:text-[#ff6b35] transition-colors"
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
          className={`p-3 rounded-lg border ${phaseColors[phase]} border-opacity-30`}
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
        className={`group p-3 rounded-lg border cursor-pointer transition-all hover:shadow-lg ${phaseColors[phase]} border-opacity-30`}
      >
        {cardContent}
      </div>
    );
  };

  // Mobile view
  if (isMobile) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        {/* Mobile Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#ff6b35]/10 rounded-lg">
              <Target className="w-4 h-4 text-[#ff6b35]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Goals</h2>
              <p className="text-xs text-[#8b949e]">{stats.achieved}/{stats.total} done</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 bg-[#ff6b35] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Category Tabs */}
        <div className="flex gap-1 mb-4">
          {(['daily', 'weekly', 'yearly'] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-[#ff6b35] text-white'
                  : 'bg-[#0d1117] text-[#8b949e]'
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>

        {/* Mobile Progress */}
        <div className="mb-4">
          <div className="h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#ff6b35] to-[#238636]"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>

        {/* Mobile: Stacked Phases */}
        <div className="space-y-4">
          {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => {
            const phaseGoals = getGoalsByPhase(activeCategory, phase);
            return (
              <div key={phase} className="bg-[#0d1117] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-white">{phaseLabels[phase]}</h3>
                  <span className="text-xs text-[#8b949e] bg-[#161b22] px-2 py-0.5 rounded-full">
                    {phaseGoals.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {phaseGoals.map((goal) => renderGoalCard(goal, phase, true))}
                  {phaseGoals.length === 0 && (
                    <div className="text-center py-4 text-[#8b949e] text-xs">
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
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Add Goal</h3>
                <button onClick={() => setShowAddModal(false)} className="p-1">
                  <X className="w-4 h-4 text-[#8b949e]" />
                </button>
              </div>
              <input
                type="text"
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Enter goal..."
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm mb-3"
                onKeyPress={(e) => e.key === 'Enter' && addGoal()}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-3 py-2 bg-[#30363d] text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={addGoal}
                  disabled={!newGoalTitle.trim()}
                  className="flex-1 px-3 py-2 bg-[#ff6b35] text-white rounded-lg text-sm disabled:opacity-50"
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
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Notes: {notesGoal.title}</h3>
                <button onClick={closeNotes} className="p-1">
                  <X className="w-4 h-4 text-[#8b949e]" />
                </button>
              </div>
              <textarea
                value={notesContent}
                onChange={(e) => setNotesContent(e.target.value)}
                placeholder="Add notes about this goal..."
                rows={4}
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm mb-3 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={closeNotes}
                  className="flex-1 px-3 py-2 bg-[#30363d] text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNotes}
                  className="flex-1 px-3 py-2 bg-[#ff6b35] text-white rounded-lg text-sm"
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
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Target className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Goals</h2>
            <p className="text-xs text-[#8b949e]">
              {stats.achieved}/{stats.total} achieved ({stats.percentage}%)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#ff6b35] text-white rounded-lg text-sm hover:bg-[#ff8c5a] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Goal
          </button>
          <button
            onClick={fetchGoals}
            disabled={loading}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6">
        {(['daily', 'weekly', 'yearly'] as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-[#ff6b35] text-white'
                : 'bg-[#0d1117] text-[#8b949e] hover:text-white hover:bg-[#30363d]'
            }`}
          >
            {categoryLabels[cat]} Goals
          </button>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-[#8b949e] mb-2">
          <span>Progress</span>
          <span>{stats.percentage}%</span>
        </div>
        <div className="h-2 bg-[#0d1117] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#ff6b35] to-[#238636] transition-all duration-500"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
      </div>

      {/* KanBan Board */}
      <div className="grid grid-cols-3 gap-4">
        {(['not-started', 'in-progress', 'achieved'] as Phase[]).map((phase) => (
          <div
            key={phase}
            className="bg-[#0d1117] rounded-lg p-4 min-h-[300px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, phase)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">{phaseLabels[phase]}</h3>
              <span className="text-xs text-[#8b949e] bg-[#161b22] px-2 py-1 rounded-full">
                {getGoalsByPhase(activeCategory, phase).length}
              </span>
            </div>

            <div className="space-y-2">
              {getGoalsByPhase(activeCategory, phase).map((goal) => renderGoalCard(goal, phase, false))}
              {getGoalsByPhase(activeCategory, phase).length === 0 && (
                <div className="text-center py-8 text-[#8b949e] text-sm">
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
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add {categoryLabels[activeCategory]} Goal</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-[#30363d] rounded-lg"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            
            <input
              type="text"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              placeholder="Enter goal title..."
              className="w-full px-4 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#ff6b35] mb-4"
              onKeyPress={(e) => e.key === 'Enter' && addGoal()}
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-[#30363d] text-white rounded-lg hover:bg-[#484f58] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addGoal}
                disabled={!newGoalTitle.trim()}
                className="flex-1 px-4 py-2 bg-[#ff6b35] text-white rounded-lg hover:bg-[#ff8c5a] transition-colors disabled:opacity-50"
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
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#ff6b35]" />
                <h3 className="text-lg font-semibold text-white">Notes</h3>
              </div>
              <button
                onClick={closeNotes}
                className="p-2 hover:bg-[#30363d] rounded-lg"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            
            <p className="text-sm text-[#8b949e] mb-4">{notesGoal.title}</p>
            
            <textarea
              value={notesContent}
              onChange={(e) => setNotesContent(e.target.value)}
              placeholder="Add notes, links, research, or any details about this goal..."
              rows={6}
              className="w-full px-4 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#ff6b35] mb-4 resize-none"
            />
            
            <div className="flex gap-2">
              <button
                onClick={closeNotes}
                className="flex-1 px-4 py-2 bg-[#30363d] text-white rounded-lg hover:bg-[#484f58] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveNotes}
                className="flex-1 px-4 py-2 bg-[#ff6b35] text-white rounded-lg hover:bg-[#ff8c5a] transition-colors"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
