'use client';

import React, { useState } from 'react';
import { Plus, Search, X, Trash2, Square, CheckSquare, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Category, Goal, GoalsData, Phase } from '@/lib/goals/types';
import { SortableGoalCard, type GoalCardActions } from './GoalCard';
import {
  CATEGORY_ORDER,
  PHASE_ORDER,
  categoryLabels,
  categoryDescriptions,
  phaseAccent,
  phaseLabels,
  byPhase,
  getProgressStats,
  matchesSearch,
} from './shared';

interface GoalBoardProps extends Pick<GoalCardActions, 'onOpen' | 'onAdvance' | 'onRevert' | 'onDelete' | 'onOpenMilestones'> {
  goals: GoalsData;
  activeCategory: Category;
  onCategoryChange: (c: Category) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
  onAdd: () => void;
  onReorder: (orderedIds: string[]) => void;
  onMovePhase: (goal: Goal, phase: Phase) => void;
  onBulkDelete: () => void;
  onMoveCategory: (toCategory: Category) => void;
}

function DroppableColumn({ phase, children }: { phase: Phase; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  return (
    <div
      ref={setNodeRef}
      className="flex flex-col min-h-0 rounded-xl transition-colors"
      style={{
        background: 'var(--surface-1)',
        border: `1px solid ${isOver ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
      }}
    >
      {children}
    </div>
  );
}

export default function GoalBoard({
  goals,
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  selectedIds,
  setSelectedIds,
  onAdd,
  onReorder,
  onMovePhase,
  onBulkDelete,
  onMoveCategory,
  onOpen,
  onAdvance,
  onRevert,
  onDelete,
  onOpenMilestones,
}: GoalBoardProps) {
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);

  const categoryGoals = goals[activeCategory] ?? [];
  const stats = getProgressStats(categoryGoals);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveGoal(categoryGoals.find((g) => g.id === e.active.id) ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveGoal(null);
    const { active, over } = e;
    if (!over) return;
    const dragged = categoryGoals.find((g) => g.id === active.id);
    if (!dragged) return;
    const overId = over.id as string;

    // Dropped on a column (or a card in another column) → change phase.
    if ((PHASE_ORDER as string[]).includes(overId)) {
      if (dragged.phase !== overId) onMovePhase(dragged, overId as Phase);
      return;
    }
    const overGoal = categoryGoals.find((g) => g.id === overId);
    if (overGoal && overGoal.phase !== dragged.phase) {
      onMovePhase(dragged, overGoal.phase);
      return;
    }

    // Same-phase reorder.
    if (active.id !== overId) {
      const phaseGoals = byPhase(categoryGoals, dragged.phase);
      const oldIndex = phaseGoals.findIndex((g) => g.id === active.id);
      const newIndex = phaseGoals.findIndex((g) => g.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(phaseGoals, oldIndex, newIndex).map((g) => g.id));
      }
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 640 }}>
      {/* Controls: category tabs + search (or bulk bar) */}
      {selectedIds.size > 0 ? (
        <div
          className="flex items-center justify-between gap-2 mb-4 px-3 py-2 rounded-xl flex-wrap"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-default)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--accent-light)' }}>
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[11px] mr-0.5" style={{ color: 'var(--text-secondary)' }}>
                Move to
              </span>
              {CATEGORY_ORDER.filter((c) => c !== activeCategory).map((c) => (
                <button
                  key={c}
                  onClick={() => onMoveCategory(c)}
                  className="px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                >
                  {categoryLabels[c]}
                </button>
              ))}
            </div>
            <button
              onClick={onBulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'var(--negative-dim)', color: 'var(--negative)' }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORY_ORDER.map((cat) => {
              const active = cat === activeCategory;
              const count = (goals[cat] ?? []).length;
              return (
                <button
                  key={cat}
                  onClick={() => onCategoryChange(cat)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {categoryLabels[cat]}
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px]"
                    style={{
                      background: active ? 'rgba(255,255,255,0.2)' : 'var(--surface-3)',
                      color: active ? '#fff' : 'var(--text-tertiary)',
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-7 py-1.5 rounded-lg text-xs w-36 focus:w-52 transition-all focus:outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Category progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {categoryDescriptions[activeCategory]} · {stats.achieved}/{stats.total} done
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--accent-light)' }}>
            {stats.percentage}%
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.percentage}%`, background: 'var(--accent)' }}
          />
        </div>
      </div>

      {/* Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveGoal(null)}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
          {PHASE_ORDER.map((phase) => {
            const all = byPhase(categoryGoals, phase);
            const visible = all.filter((g) => matchesSearch(g, searchQuery));
            const filtered = searchQuery.trim().length > 0 && visible.length !== all.length;
            const phaseSelected = visible.length > 0 && visible.every((g) => selectedIds.has(g.id));

            return (
              <DroppableColumn key={phase} phase={phase}>
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: phaseAccent[phase] }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {phaseLabels[phase]}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: filtered ? 'var(--accent-dim)' : 'var(--surface-2)',
                        color: filtered ? 'var(--accent-light)' : 'var(--text-tertiary)',
                      }}
                    >
                      {filtered ? `${visible.length}/${all.length}` : visible.length}
                    </span>
                  </div>
                  {visible.length > 0 && (
                    <button
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (phaseSelected) visible.forEach((g) => next.delete(g.id));
                        else visible.forEach((g) => next.add(g.id));
                        setSelectedIds(next);
                      }}
                      style={{ color: phaseSelected ? 'var(--accent)' : 'var(--text-tertiary)' }}
                      title="Select all in column"
                    >
                      {phaseSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-[160px]">
                  <SortableContext items={visible.map((g) => g.id)} strategy={verticalListSortingStrategy} id={phase}>
                    {visible.map((goal) => (
                      <SortableGoalCard
                        key={goal.id}
                        id={goal.id}
                        goal={goal}
                        isSelected={selectedIds.has(goal.id)}
                        onOpen={onOpen}
                        onToggleSelect={toggleSelect}
                        onAdvance={onAdvance}
                        onRevert={onRevert}
                        onDelete={onDelete}
                        onOpenMilestones={onOpenMilestones}
                      />
                    ))}
                    {visible.length === 0 && (
                      <div
                        className="h-full min-h-[80px] flex items-center justify-center text-xs rounded-lg"
                        style={{ color: 'var(--text-disabled)', border: '1px dashed var(--border-subtle)' }}
                      >
                        {searchQuery.trim() ? 'No matches' : 'Empty'}
                      </div>
                    )}
                  </SortableContext>
                </div>

                {/* Quick add */}
                <button
                  onClick={onAdd}
                  className="flex items-center gap-1.5 px-3 py-2 m-2 mt-0 rounded-lg text-xs transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-2)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add goal
                </button>
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeGoal ? (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg shadow-2xl"
              style={{ background: 'var(--surface-3)', border: '2px solid var(--accent)' }}
            >
              <GripVertical className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
                {activeGoal.title}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
