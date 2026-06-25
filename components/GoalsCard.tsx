'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Target, Plus, Columns3, Crosshair, BarChart3, Loader2 } from 'lucide-react';
import type { ActionItem, ActivityEvent, Category, Goal, GoalsData, Phase } from '@/lib/goals/types';
import GoalBoard from './goals/GoalBoard';
import GoalFocus from './goals/GoalFocus';
import GoalInsights from './goals/GoalInsights';
import GoalActivityFeed from './goals/GoalActivityFeed';
import { GoalEditModal, MilestonesModal, AgentModal, ConfirmDialog, Toast, type GoalFormValue, type ToastState } from './goals/GoalModals';
import { allGoals, categoryLabels } from './goals/shared';

type View = 'board' | 'focus' | 'insights';

const VIEWS: { id: View; label: string; icon: typeof Columns3 }[] = [
  { id: 'board', label: 'Board', icon: Columns3 },
  { id: 'focus', label: 'Focus', icon: Crosshair },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
];

const EMPTY: GoalsData = { yearly: [], weekly: [], daily: [], collaborative: [] };
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const clone = (g: GoalsData): GoalsData => JSON.parse(JSON.stringify(g));

export default function GoalsCard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [goals, setGoals] = useState<GoalsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('board');
  const [activeCategory, setActiveCategory] = useState<Category>('daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editState, setEditState] = useState<{ mode: 'create' | 'edit'; goal?: Goal } | null>(null);
  const [milestonesGoalId, setMilestonesGoalId] = useState<string | null>(null);
  const [agentGoalId, setAgentGoalId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Goal | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [toast, setToast] = useState<(ToastState & { deletedGoal?: Goal }) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // ── URL <-> state sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const v = searchParams.get('goalView');
    if (v === 'board' || v === 'focus' || v === 'insights') setView(v);
    const t = searchParams.get('goalTab');
    if (t && ['daily', 'weekly', 'yearly', 'collaborative'].includes(t)) setActiveCategory(t as Category);
  }, [searchParams]);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const changeView = (v: View) => {
    setView(v);
    setSelectedIds(new Set());
    setParam('goalView', v);
  };
  const changeCategory = (c: Category) => {
    setActiveCategory(c);
    setSelectedIds(new Set());
    setParam('goalTab', c);
  };

  // ── Toast ────────────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: ToastState['type'] = 'success', deletedGoal?: Goal) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, deletedGoal });
    // Undo toasts (e.g. "Goal deleted") linger longer so there's time to click
    // Undo, but still auto-dismiss; other toasts clear quickly.
    toastTimer.current = setTimeout(() => setToast(null), type === 'undo' ? 10000 : 4000);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      const data = await res.json();
      if (data.success) {
        setGoals(data.data);
        setSelectedIds(new Set());
      }
    } catch (e) {
      console.error('Failed to fetch goals:', e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/goals/activity');
      const data = await res.json();
      if (data.success) setActivity(data.events ?? []);
    } catch (e) {
      console.error('Failed to fetch activity:', e);
    } finally {
      setActivityLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // ── Mutations ──────────────────────────────────────────────────────────────────
  const handleEditSubmit = async (value: GoalFormValue) => {
    const editing = editState?.mode === 'edit' ? editState.goal : undefined;
    try {
      const res = editing
        ? await fetch('/api/goals', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({
              goalId: editing.id,
              category: editing.category,
              title: value.title,
              notes: value.notes ?? '',
              dueDate: value.dueDate ?? '',
              priority: value.priority ?? null,
              recurrence: value.recurrence,
            }),
          })
        : await fetch('/api/goals', {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify({
              title: value.title,
              category: value.category,
              notes: value.notes,
              dueDate: value.dueDate,
              priority: value.priority,
              recurrence: value.recurrence,
            }),
          });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.data);
        setEditState(null);
        showToast(editing ? 'Saved' : 'Goal created');
      } else {
        showToast(editing ? 'Failed to save' : 'Failed to create goal', 'error');
      }
    } catch {
      showToast('Something went wrong', 'error');
    }
  };

  const moveGoalPhase = async (goal: Goal, phase: Phase) => {
    const snapshot = goals;
    const updated = clone(goals);
    const arr = updated[goal.category];
    const idx = arr.findIndex((g) => g.id === goal.id);
    if (idx > -1) {
      arr[idx].phase = phase;
      setGoals(updated);
    }
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ goalId: goal.id, newPhase: phase, category: goal.category }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.data);
        if (phase === 'achieved') showToast('Goal completed 🎉');
      } else {
        setGoals(snapshot);
        showToast('Failed to update', 'error');
      }
    } catch {
      setGoals(snapshot);
      showToast('Failed to update', 'error');
    }
  };

  const advance = (goal: Goal) => moveGoalPhase(goal, goal.phase === 'not-started' ? 'in-progress' : 'achieved');
  const revert = (goal: Goal) => moveGoalPhase(goal, goal.phase === 'achieved' ? 'in-progress' : 'not-started');

  const reorder = async (orderedIds: string[]) => {
    const snapshot = goals;
    const updated = clone(goals);
    updated[activeCategory] = updated[activeCategory]
      .map((g) => {
        const i = orderedIds.indexOf(g.id);
        return i !== -1 ? { ...g, order: i } : g;
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setGoals(updated);
    try {
      const res = await fetch('/api/goals', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reorder: true, category: activeCategory, orderedIds }),
      });
      if (!res.ok) {
        setGoals(snapshot);
        showToast('Failed to reorder', 'error');
      }
    } catch {
      setGoals(snapshot);
      showToast('Failed to reorder', 'error');
    }
  };

  const executeDelete = async (goal: Goal) => {
    setDeleteConfirm(null);
    const snapshot = goals;
    const updated = clone(goals);
    updated[goal.category] = updated[goal.category].filter((g) => g.id !== goal.id);
    setGoals(updated);
    showToast('Goal deleted', 'undo', goal);
    try {
      const res = await fetch(`/api/goals?goalId=${goal.id}&category=${goal.category}`, { method: 'DELETE' });
      if (!res.ok) {
        setGoals(snapshot);
        showToast('Failed to delete', 'error');
      }
    } catch {
      setGoals(snapshot);
      showToast('Failed to delete', 'error');
    }
  };

  const undoDelete = async () => {
    const g = toast?.deletedGoal;
    if (!g) return;
    dismissToast();
    try {
      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          title: g.title,
          category: g.category,
          notes: g.notes,
          phase: g.phase,
          actionItems: g.actionItems,
          dueDate: g.dueDate,
          priority: g.priority,
          target: g.target,
          recurrence: g.recurrence,
          source: g.source,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.data);
        showToast('Goal restored');
      } else {
        fetchGoals();
        showToast('Failed to restore', 'error');
      }
    } catch {
      fetchGoals();
      showToast('Failed to restore', 'error');
    }
  };

  const executeBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const flat = allGoals(goals);
    try {
      for (const id of ids) {
        const g = flat.find((x) => x.id === id);
        if (g) await fetch(`/api/goals?goalId=${id}&category=${g.category}`, { method: 'DELETE' });
      }
      await fetchGoals();
      setSelectedIds(new Set());
      setBulkConfirm(false);
      showToast(`${ids.length} goal${ids.length !== 1 ? 's' : ''} deleted`);
    } catch {
      showToast('Failed to delete some goals', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const moveSelectedToCategory = async (toCategory: Category) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const flat = allGoals(goals);
    try {
      for (const id of ids) {
        const g = flat.find((x) => x.id === id);
        if (g && g.category !== toCategory) {
          await fetch('/api/goals', {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ goalId: id, fromCategory: g.category, toCategory }),
          });
        }
      }
      await fetchGoals();
      setSelectedIds(new Set());
      showToast(`Moved to ${categoryLabels[toCategory]}`);
    } catch {
      fetchGoals();
      showToast('Failed to move', 'error');
    }
  };

  // ── Milestones (action items) ────────────────────────────────────────────────
  const milestonesGoal = milestonesGoalId ? allGoals(goals).find((g) => g.id === milestonesGoalId) ?? null : null;

  const persistActionItems = async (goal: Goal, items: ActionItem[]) => {
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ goalId: goal.id, category: goal.category, actionItems: items }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.data);
      } else {
        showToast('Failed to update milestones', 'error');
      }
    } catch {
      showToast('Failed to update milestones', 'error');
    }
  };
  const addMilestone = (text: string) => {
    if (!milestonesGoal) return;
    persistActionItems(milestonesGoal, [
      ...(milestonesGoal.actionItems ?? []),
      { id: `ai-${Date.now()}`, text, status: 'pending', createdAt: new Date().toISOString() },
    ]);
  };
  const toggleMilestone = (item: ActionItem) => {
    if (!milestonesGoal) return;
    const next: ActionItem['status'] =
      item.status === 'pending' ? 'in-progress' : item.status === 'in-progress' ? 'completed' : 'pending';
    persistActionItems(
      milestonesGoal,
      (milestonesGoal.actionItems ?? []).map((i) => (i.id === item.id ? { ...i, status: next } : i)),
    );
  };
  const deleteMilestone = (id: string) => {
    if (!milestonesGoal) return;
    persistActionItems(milestonesGoal, (milestonesGoal.actionItems ?? []).filter((i) => i.id !== id));
  };

  // ── Claude agent handoff ─────────────────────────────────────────────────────
  const agentGoal = agentGoalId ? allGoals(goals).find((g) => g.id === agentGoalId) ?? null : null;

  const setAssignee = async (goal: Goal, assignee: 'me' | 'agent') => {
    const snapshot = goals;
    const updated = clone(goals);
    const arr = updated[goal.category];
    const idx = arr.findIndex((g) => g.id === goal.id);
    if (idx > -1) {
      arr[idx].assignee = assignee === 'agent' ? 'agent' : undefined;
      if (assignee === 'agent') arr[idx].agentStatus = arr[idx].agentStatus ?? 'queued';
      else delete arr[idx].agentStatus;
      setGoals(updated);
    }
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ goalId: goal.id, category: goal.category, assignee }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.data);
        fetchActivity();
        showToast(assignee === 'agent' ? 'Handed off to Claude' : 'Task recalled');
      } else {
        setGoals(snapshot);
        showToast('Failed to update', 'error');
      }
    } catch {
      setGoals(snapshot);
      showToast('Failed to update', 'error');
    }
  };
  const handoffToAgent = (goal: Goal) => setAssignee(goal, 'agent');
  const recallFromAgent = (goal: Goal) => setAssignee(goal, 'me');

  const answerHelp = async (goal: Goal, text: string) => {
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ goalId: goal.id, category: goal.category, helpAnswer: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.data);
        fetchActivity();
        showToast('Reply sent to Claude');
      } else {
        showToast('Failed to send reply', 'error');
      }
    } catch {
      showToast('Failed to send reply', 'error');
    }
  };

  // Collaborative goals awaiting a reply from the owner.
  const helpGoals = goals.collaborative.filter((g) => g.helpRequest && !g.helpRequest.answer);
  // Deliverables Claude (or the owner) attached, flattened for the feed.
  const resources = goals.collaborative.flatMap((g) =>
    (g.resources ?? []).map((r) => ({ goalId: g.id, goalTitle: g.title, resource: r })),
  );

  // Poll for agent progress (and external changes) while idle. Paused during
  // editing / confirm dialogs / active selection so it can't disrupt those, but
  // allowed while the Agent or Milestones modal is open so they update live.
  const idle = !editState && !deleteConfirm && !bulkConfirm && selectedIds.size === 0;
  useEffect(() => {
    if (!idle) return;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchGoals();
        fetchActivity();
      }
    }, 15000);
    return () => clearInterval(t);
  }, [idle, fetchGoals, fetchActivity]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card flex items-center justify-center" style={{ minHeight: 480 }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    );
  }

  return (
    <div className="card animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: 'var(--accent-dim)' }}>
            <Target className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Goals
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
          >
            {VIEWS.map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => changeView(v.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  <v.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setEditState({ mode: 'create' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Goal</span>
          </button>
        </div>
      </div>

      {/* Active view */}
      {view === 'board' && (
        <GoalBoard
          goals={goals}
          activeCategory={activeCategory}
          onCategoryChange={changeCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onAdd={() => setEditState({ mode: 'create' })}
          onReorder={reorder}
          onMovePhase={moveGoalPhase}
          onBulkDelete={() => setBulkConfirm(true)}
          onMoveCategory={moveSelectedToCategory}
          onOpen={(g) => setEditState({ mode: 'edit', goal: g })}
          onAdvance={advance}
          onRevert={revert}
          onDelete={(g) => setDeleteConfirm(g)}
          onOpenMilestones={(g) => setMilestonesGoalId(g.id)}
        />
      )}
      {view === 'focus' && (
        <GoalFocus
          goals={goals}
          onAdd={() => setEditState({ mode: 'create' })}
          onOpen={(g) => setEditState({ mode: 'edit', goal: g })}
          onAdvance={advance}
          onRevert={revert}
          onDelete={(g) => setDeleteConfirm(g)}
          onOpenMilestones={(g) => setMilestonesGoalId(g.id)}
        />
      )}
      {view === 'insights' && <GoalInsights goals={goals} />}

      {view === 'board' && activeCategory === 'collaborative' && (
        <GoalActivityFeed events={activity} helpGoals={helpGoals} resources={resources} onAnswer={answerHelp} loading={activityLoading} />
      )}

      {/* Modals */}
      {editState && (
        <GoalEditModal
          mode={editState.mode}
          goal={editState.goal}
          defaultCategory={activeCategory}
          onClose={() => setEditState(null)}
          onSubmit={handleEditSubmit}
          onOpenMilestones={(g) => {
            setEditState(null);
            setMilestonesGoalId(g.id);
          }}
          onOpenAgent={(g) => {
            setEditState(null);
            setAgentGoalId(g.id);
          }}
        />
      )}
      {milestonesGoal && (
        <MilestonesModal
          goal={milestonesGoal}
          onClose={() => setMilestonesGoalId(null)}
          onAdd={addMilestone}
          onToggle={toggleMilestone}
          onDelete={deleteMilestone}
        />
      )}
      {agentGoal && (
        <AgentModal
          goal={agentGoal}
          onClose={() => setAgentGoalId(null)}
          onHandoff={handoffToAgent}
          onRecall={recallFromAgent}
          onOpenMilestones={(g) => {
            setAgentGoalId(null);
            setMilestonesGoalId(g.id);
          }}
        />
      )}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete goal?"
          message={`“${deleteConfirm.title}” will be deleted. You can undo right after.`}
          onConfirm={() => executeDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      {bulkConfirm && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} goal${selectedIds.size !== 1 ? 's' : ''}?`}
          message="This cannot be undone."
          loading={bulkDeleting}
          onConfirm={executeBulkDelete}
          onCancel={() => setBulkConfirm(false)}
        />
      )}
      {toast && <Toast toast={toast} onUndo={undoDelete} onDismiss={dismissToast} />}
    </div>
  );
}
