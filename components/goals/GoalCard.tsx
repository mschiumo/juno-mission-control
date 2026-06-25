'use client';

import React from 'react';
import {
  GripVertical,
  Square,
  CheckSquare,
  Calendar,
  Repeat,
  Flame,
  FileText,
  ListChecks,
  ChevronRight,
  RotateCcw,
  X,
  Bot,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Goal } from '@/lib/goals/types';
import {
  phaseAccent,
  phaseLabels,
  priorityMeta,
  recurrenceLabels,
  sourceMeta,
  agentStatusMeta,
  categoryLabels,
  getDueStatus,
  milestoneProgress,
  targetProgress,
} from './shared';

export interface GoalCardActions {
  onOpen: (goal: Goal) => void;
  onToggleSelect?: (id: string) => void;
  onAdvance?: (goal: Goal) => void;
  onRevert?: (goal: Goal) => void;
  onDelete?: (goal: Goal) => void;
  onOpenMilestones?: (goal: Goal) => void;
}

export interface GoalCardProps extends GoalCardActions {
  goal: Goal;
  isSelected?: boolean;
  showCategory?: boolean;
  showPhase?: boolean;
  dragHandle?: React.ReactNode;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export default function GoalCard({
  goal,
  isSelected = false,
  showCategory = false,
  showPhase = false,
  dragHandle,
  onOpen,
  onToggleSelect,
  onAdvance,
  onRevert,
  onDelete,
  onOpenMilestones,
}: GoalCardProps) {
  const isAchieved = goal.phase === 'achieved';
  const priority = goal.priority;
  const accent = priority ? priorityMeta[priority].color : phaseAccent[goal.phase];
  const due = getDueStatus(goal.dueDate);
  const recurring = !!goal.recurrence && goal.recurrence !== 'none';
  const streak = goal.streak?.current ?? 0;
  const tProg = targetProgress(goal);
  const mProg = milestoneProgress(goal);
  const source = goal.source && goal.source !== 'mj' ? sourceMeta[goal.source] : null;
  const agent = goal.assignee === 'agent' ? agentStatusMeta[goal.agentStatus ?? 'queued'] : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="group/card relative flex items-stretch rounded-lg border transition-colors cursor-pointer"
      style={{
        background: 'var(--surface-2)',
        borderColor: isSelected ? 'var(--accent)' : 'var(--border-default)',
        boxShadow: isSelected ? '0 0 0 1px var(--accent-dim)' : undefined,
      }}
      onClick={() => onOpen(goal)}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)';
      }}
    >
      {/* Accent bar — priority when set, else phase */}
      <div className="w-1 flex-shrink-0 rounded-l-lg" style={{ background: accent }} />

      <div className="flex-1 min-w-0 px-3.5 py-3">
        {/* Title row */}
        <div className="flex items-start gap-2">
          {dragHandle}
          <p
            className="flex-1 min-w-0 text-[14px] leading-snug break-words"
            style={{
              color: isAchieved ? 'var(--text-tertiary)' : 'var(--text-primary)',
              textDecoration: isAchieved ? 'line-through' : 'none',
            }}
          >
            {goal.title}
          </p>
          {onToggleSelect && (
            <button
              onClick={(e) => {
                stop(e);
                onToggleSelect(goal.id);
              }}
              className={`flex-shrink-0 mt-0.5 transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
              }`}
              title="Select"
            >
              {isSelected ? (
                <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              ) : (
                <Square className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              )}
            </button>
          )}
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {agent && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ background: 'var(--surface-3)', color: agent.color }}
              title={`Claude agent: ${agent.label}`}
            >
              <Bot className={`w-3 h-3 ${agent.pulse ? 'animate-pulse' : ''}`} /> {agent.label}
            </span>
          )}
          {showPhase && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: phaseAccent[goal.phase] }} />
              {phaseLabels[goal.phase]}
            </span>
          )}
          {priority && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ background: 'var(--surface-3)', color: priorityMeta[priority].color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityMeta[priority].color }} />
              {priorityMeta[priority].label}
            </span>
          )}
          {recurring && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
              style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
            >
              <Repeat className="w-3 h-3" /> {recurrenceLabels[goal.recurrence!]}
            </span>
          )}
          {recurring && streak > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)' }}
              title={`${streak}-period streak`}
            >
              <Flame className="w-3 h-3" /> {streak}
            </span>
          )}
          {due && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: due.color }}>
              <Calendar className="w-3 h-3" /> {due.label}
            </span>
          )}
          {showCategory && (
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {categoryLabels[goal.category]}
            </span>
          )}
          {source && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px]"
              style={{ background: 'var(--surface-3)', color: source.color }}
            >
              <span>{source.icon}</span>
              {source.label}
            </span>
          )}
          {goal.notes && <FileText className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />}
        </div>

        {/* Progress — numeric target wins, else milestone checklist */}
        {tProg && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {tProg.current}/{tProg.target}
                {tProg.unit ? ` ${tProg.unit}` : ''}
              </span>
              <span className="text-[11px] font-medium" style={{ color: 'var(--accent-light)' }}>
                {tProg.pct}%
              </span>
            </div>
            <ProgressBar pct={tProg.pct} color="var(--accent)" />
          </div>
        )}
        {!tProg && mProg && (
          <button
            onClick={(e) => {
              stop(e);
              onOpenMilestones?.(goal);
            }}
            className="mt-2 w-full text-left"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <ListChecks className="w-3 h-3" /> {mProg.done}/{mProg.total}
              </span>
              <span className="text-[11px] font-medium" style={{ color: 'var(--positive)' }}>
                {Math.round((mProg.done / mProg.total) * 100)}%
              </span>
            </div>
            <ProgressBar pct={Math.round((mProg.done / mProg.total) * 100)} color="var(--positive)" />
          </button>
        )}
        {!tProg && !mProg && (goal.category === 'collaborative' || goal.aiAssisted) && onOpenMilestones && (
          <button
            onClick={(e) => {
              stop(e);
              onOpenMilestones(goal);
            }}
            className="mt-2 inline-flex items-center gap-1 text-[11px] transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ListChecks className="w-3 h-3" /> Add milestones
          </button>
        )}
      </div>

      {/* Hover quick-actions */}
      {(onAdvance || onRevert || onDelete) && (
        <div className="flex flex-col items-center justify-center gap-1 px-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
          {onAdvance && !isAchieved && (
            <button
              onClick={(e) => {
                stop(e);
                onAdvance(goal);
              }}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--positive)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
              title={goal.phase === 'not-started' ? 'Start' : 'Mark done'}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onRevert && goal.phase !== 'not-started' && (
            <button
              onClick={(e) => {
                stop(e);
                onRevert(goal);
              }}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              title="Move back"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                stop(e);
                onDelete(goal);
              }}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--negative)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
              title="Delete"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Drag-enabled wrapper for use inside a SortableContext (board columns). */
export function SortableGoalCard(props: GoalCardProps & { id: string }) {
  const { id, ...cardProps } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const handle = (
    <button
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover/card:opacity-100 transition-opacity"
      style={{ color: 'var(--text-tertiary)' }}
      title="Drag to reorder"
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      <GoalCard {...cardProps} dragHandle={handle} />
    </div>
  );
}
