'use client';

import React, { useState } from 'react';
import {
  Plus,
  Pencil,
  Send,
  RotateCcw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  CornerUpLeft,
  MessagesSquare,
} from 'lucide-react';
import type { ActivityEvent, ActivityKind, Goal } from '@/lib/goals/types';
import { activityActorMeta, activityKindColor, timeAgo } from './shared';

const KIND_ICON: Record<ActivityKind, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  created: Plus,
  updated: Pencil,
  handoff: Send,
  recall: RotateCcw,
  progress: Activity,
  completed: CheckCircle2,
  reopened: RotateCcw,
  blocked: AlertTriangle,
  help_request: HelpCircle,
  help_answer: CornerUpLeft,
};

// Messages longer than this get clamped with a show-more toggle.
const LONG = 140;

function HelpItem({ goal, onAnswer }: { goal: Goal; onAnswer: (goal: Goal, text: string) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const question = goal.helpRequest?.question ?? '';
  const long = question.length > LONG;
  const submit = () => {
    if (text.trim()) {
      onAnswer(goal, text.trim());
      setText('');
    }
  };
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--warning-dim)', border: '1px solid var(--warning)' }}>
      <div className="flex items-center gap-2 mb-1">
        <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--warning)' }} />
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {goal.title}
        </span>
      </div>
      <p className={`text-sm ${open ? '' : 'line-clamp-3'}`} style={{ color: 'var(--text-secondary)' }}>
        {question}
      </p>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--warning)' }}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
      <div className="flex gap-2 mt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Reply to Claude…"
          className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="px-3 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-1"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </div>
    </div>
  );
}

function ActivityRow({ e }: { e: ActivityEvent }) {
  const [open, setOpen] = useState(false);
  const actor = activityActorMeta[e.actor];
  const Icon = KIND_ICON[e.kind] ?? Activity;
  const color = activityKindColor[e.kind] ?? 'var(--text-secondary)';
  const long = e.message.length > LONG;

  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${open ? '' : 'line-clamp-2'} ${long ? 'cursor-pointer' : ''}`}
          onClick={() => long && setOpen((v) => !v)}
        >
          <span style={{ color: actor.color }}>
            {actor.icon} {actor.label}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}> · {e.message}</span>
        </p>
        {long && (
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      <span className="text-[11px] flex-shrink-0 num" style={{ color: 'var(--text-tertiary)' }}>
        {timeAgo(e.at)}
      </span>
    </li>
  );
}

export default function GoalActivityFeed({
  events,
  helpGoals,
  onAnswer,
  loading,
}: {
  events: ActivityEvent[];
  helpGoals: Goal[];
  onAnswer: (goal: Goal, text: string) => void;
  loading?: boolean;
}) {
  const ordered = [...events].reverse(); // newest first

  return (
    <div className="mt-5 rounded-2xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-3">
        <MessagesSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Collaboration activity
        </h3>
      </div>

      {helpGoals.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
            Needs your input
          </div>
          {helpGoals.map((g) => (
            <HelpItem key={g.id} goal={g} onAnswer={onAnswer} />
          ))}
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
        Recent activity
      </div>
      {loading && events.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Loading…
        </div>
      ) : ordered.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No activity yet — hand a task to Claude or update one to see it here.
        </div>
      ) : (
        <ol className="space-y-2.5 max-h-80 overflow-y-auto">
          {ordered.map((e) => (
            <ActivityRow key={e.id} e={e} />
          ))}
        </ol>
      )}
    </div>
  );
}
