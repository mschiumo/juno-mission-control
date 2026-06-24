'use client';

import React from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import type { Goal, GoalsData } from '@/lib/goals/types';
import GoalCard, { type GoalCardActions } from './GoalCard';
import { buildFocusGroups } from './shared';

interface GoalFocusProps extends Pick<GoalCardActions, 'onOpen' | 'onAdvance' | 'onRevert' | 'onDelete' | 'onOpenMilestones'> {
  goals: GoalsData;
  onAdd: () => void;
}

export default function GoalFocus({ goals, onAdd, onOpen, onAdvance, onRevert, onDelete, onOpenMilestones }: GoalFocusProps) {
  const groups = buildFocusGroups(goals);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16" style={{ minHeight: 360 }}>
        <CheckCircle2 className="w-12 h-12 mb-3" style={{ color: 'var(--positive)', opacity: 0.5 }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          You&apos;re all caught up
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          No overdue, due, or in-progress goals right now.
        </p>
        <button
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus className="w-3.5 h-3.5" /> Add a goal
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5" style={{ minHeight: 360 }}>
      {groups.map((group) => (
        <section key={group.key}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: group.accent }} />
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {group.title}
            </h3>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}
            >
              {group.goals.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {group.goals.map((goal: Goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                showCategory
                showPhase
                onOpen={onOpen}
                onAdvance={onAdvance}
                onRevert={onRevert}
                onDelete={onDelete}
                onOpenMilestones={onOpenMilestones}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
