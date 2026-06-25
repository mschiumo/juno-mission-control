'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Repeat,
  Flag,
  Check,
  Loader2,
  AlertTriangle,
  Circle,
  CheckCircle,
  ListChecks,
  RotateCcw,
  AlertCircle,
  Bot,
  Send,
  Target as TargetIcon,
} from 'lucide-react';
import type { ActionItem, Category, Goal, Priority, Recurrence } from '@/lib/goals/types';
import { categoryLabels, priorityMeta, agentStatusMeta } from './shared';

// ── Shared field styling ──────────────────────────────────────────────────────

const fieldBase: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
};
function onFieldFocus(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--border-focus)';
}
function onFieldBlur(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--border-default)';
}
const fieldClass = 'w-full px-3 py-2.5 rounded-xl text-sm transition-colors focus:outline-none placeholder:text-[var(--text-tertiary)]';
const labelClass = 'block text-[11px] mb-1.5 uppercase tracking-wider';
const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)' };

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'var(--surface-2)',
              color: active ? '#fff' : opt.color ?? 'var(--text-secondary)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-md',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  const content = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-backdrop-in">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxWidth} max-h-[88vh] flex flex-col rounded-2xl shadow-2xl animate-zoom-in`}
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex-shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
  // Portal to <body> so the overlay escapes the Goals `.card` (which has a
  // transform from animate-fade-up + overflow:hidden, which would otherwise
  // clip a position:fixed child and trap it inside the card).
  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      style={{ background: 'var(--accent)', color: '#fff' }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
      style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
    >
      {children}
    </button>
  );
}

// ── Create / Edit modal ────────────────────────────────────────────────────────

export interface GoalFormValue {
  title: string;
  notes?: string;
  category: Category;
  priority?: Priority;
  dueDate?: string;
  recurrence: Recurrence;
}

export function GoalEditModal({
  mode,
  goal,
  defaultCategory,
  onClose,
  onSubmit,
  onOpenMilestones,
  onOpenAgent,
}: {
  mode: 'create' | 'edit';
  goal?: Goal;
  defaultCategory: Category;
  onClose: () => void;
  onSubmit: (value: GoalFormValue) => Promise<void> | void;
  onOpenMilestones?: (goal: Goal) => void;
  onOpenAgent?: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [category, setCategory] = useState<Category>(goal?.category ?? defaultCategory);
  const [priority, setPriority] = useState<Priority | 'none'>(goal?.priority ?? 'none');
  const [dueDate, setDueDate] = useState(goal?.dueDate?.slice(0, 10) ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(goal?.recurrence ?? 'none');
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const value: GoalFormValue = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      category,
      priority: priority === 'none' ? undefined : priority,
      dueDate: dueDate || undefined,
      recurrence,
    };
    try {
      await onSubmit(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={mode === 'create' ? 'New goal' : 'Edit goal'}
      icon={
        <div className="p-1.5 rounded-lg" style={{ background: 'var(--accent-dim)' }}>
          <TargetIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
      }
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={submit} disabled={!canSave}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {mode === 'create' ? 'Create' : 'Save'}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle}>
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you want to accomplish?"
            className={fieldClass}
            style={fieldBase}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        </div>

        {mode === 'create' && (
          <div>
            <label className={labelClass} style={labelStyle}>
              Category
            </label>
            <Segmented
              value={category}
              onChange={setCategory}
              options={(['daily', 'weekly', 'yearly', 'collaborative'] as Category[]).map((c) => ({
                value: c,
                label: categoryLabels[c],
              }))}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>
              <span className="inline-flex items-center gap-1">
                <Flag className="w-3 h-3" /> Priority
              </span>
            </label>
            <Segmented<Priority | 'none'>
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'none', label: 'None' },
                { value: 'low', label: 'Low', color: priorityMeta.low.color },
                { value: 'medium', label: 'Med', color: priorityMeta.medium.color },
                { value: 'high', label: 'High', color: priorityMeta.high.color },
              ]}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Due date
              </span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${fieldClass} appearance-none`}
              style={fieldBase}
              onFocus={onFieldFocus}
              onBlur={onFieldBlur}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>
            <span className="inline-flex items-center gap-1">
              <Repeat className="w-3 h-3" /> Repeats
            </span>
          </label>
          <Segmented<Recurrence>
            value={recurrence}
            onChange={setRecurrence}
            options={[
              { value: 'none', label: 'One-time' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, links, the why…"
            rows={3}
            className={`${fieldClass} resize-none`}
            style={fieldBase}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
          />
        </div>

        {mode === 'edit' && goal && onOpenMilestones && (
          <button
            onClick={() => onOpenMilestones(goal)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <span className="inline-flex items-center gap-2 text-sm">
              <ListChecks className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Milestones
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {goal.actionItems?.filter((i) => i.status === 'completed').length ?? 0}/{goal.actionItems?.length ?? 0}
            </span>
          </button>
        )}

        {mode === 'edit' && goal && goal.category === 'collaborative' && onOpenAgent && (
          <button
            onClick={() => onOpenAgent(goal)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <span className="inline-flex items-center gap-2 text-sm">
              <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Claude agent
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {goal.assignee === 'agent' ? agentStatusMeta[goal.agentStatus ?? 'queued'].label : 'Hand off →'}
            </span>
          </button>
        )}
      </div>
    </ModalShell>
  );
}

// ── Milestones (action items) modal ──────────────────────────────────────────

export function MilestonesModal({
  goal,
  onClose,
  onAdd,
  onToggle,
  onDelete,
}: {
  goal: Goal;
  onClose: () => void;
  onAdd: (text: string) => void;
  onToggle: (item: ActionItem) => void;
  onDelete: (itemId: string) => void;
}) {
  const [text, setText] = useState('');
  const items = goal.actionItems ?? [];
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <ModalShell
      title="Milestones"
      subtitle={goal.title}
      maxWidth="max-w-lg"
      icon={
        <div className="p-1.5 rounded-lg" style={{ background: 'var(--accent-dim)' }}>
          <ListChecks className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
      }
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add a milestone…"
            className={fieldClass}
            style={fieldBase}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
          />
          <button
            onClick={add}
            disabled={!text.trim()}
            className="px-3 rounded-xl transition-colors disabled:opacity-40 flex items-center"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      }
    >
      {items.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--text-tertiary)' }}>
          <ListChecks className="w-9 h-9 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No milestones yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const done = item.status === 'completed';
            const prog = item.status === 'in-progress';
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: 'var(--surface-2)',
                  border: `1px solid ${done ? 'var(--positive-dim)' : prog ? 'var(--warning-dim)' : 'var(--border-subtle)'}`,
                }}
              >
                <button
                  onClick={() => onToggle(item)}
                  className="flex-shrink-0"
                  title="Cycle status"
                >
                  {done ? (
                    <CheckCircle className="w-4 h-4" style={{ color: 'var(--positive)' }} />
                  ) : prog ? (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--warning)' }} />
                  ) : (
                    <Circle className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </button>
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: done ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {item.text}
                </span>
                <button onClick={() => onDelete(item.id)} className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}

// ── Claude agent handoff + progress modal ────────────────────────────────────

export function AgentModal({
  goal,
  onClose,
  onHandoff,
  onRecall,
  onOpenMilestones,
}: {
  goal: Goal;
  onClose: () => void;
  onHandoff: (goal: Goal) => void;
  onRecall: (goal: Goal) => void;
  onOpenMilestones: (goal: Goal) => void;
}) {
  const handedOff = goal.assignee === 'agent';
  const status = agentStatusMeta[goal.agentStatus ?? 'queued'];
  const log = goal.agentLog ?? [];
  const done = (goal.actionItems ?? []).filter((i) => i.status === 'completed').length;
  const total = (goal.actionItems ?? []).length;

  return (
    <ModalShell
      title="Claude agent"
      subtitle={goal.title}
      maxWidth="max-w-lg"
      icon={
        <div className="p-1.5 rounded-lg" style={{ background: 'var(--accent-dim)' }}>
          <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
      }
      onClose={onClose}
      footer={
        handedOff ? (
          <div className="flex gap-2">
            <GhostButton onClick={() => onRecall(goal)}>Recall task</GhostButton>
            <PrimaryButton onClick={onClose}>
              <Check className="w-4 h-4" /> Done
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={() => onHandoff(goal)}>
              <Send className="w-4 h-4" /> Hand off to Claude
            </PrimaryButton>
          </div>
        )
      }
    >
      {!handedOff ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Hand this task to a Claude agent. It enters the agent queue, where a Claude agent picks it
            up, works it, and posts progress back here.
          </p>
          <div
            className="rounded-xl p-3 text-xs"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            Tip: add milestones first so the agent has a concrete checklist to work through.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status.pulse ? 'animate-pulse' : ''}`} style={{ background: status.color }} />
              <span className="text-sm font-medium" style={{ color: status.color }}>
                {status.label}
              </span>
            </div>
            <button
              onClick={() => onOpenMilestones(goal)}
              className="text-xs inline-flex items-center gap-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ListChecks className="w-3.5 h-3.5" /> {done}/{total} milestones
            </button>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              Progress log
            </div>
            {log.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                No updates yet — the agent will post progress here.
              </div>
            ) : (
              <ol className="space-y-2.5">
                {[...log].reverse().map((e, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                    <div className="min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {e.message}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {e.by ? ` · ${e.by}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell
      title={title}
      maxWidth="max-w-sm"
      icon={<AlertTriangle className="w-4 h-4" style={{ color: 'var(--negative)' }} />}
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <GhostButton onClick={onCancel} disabled={loading}>
            Cancel
          </GhostButton>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--negative)', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
    </ModalShell>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'undo';
}

export function Toast({ toast, onUndo, onDismiss }: { toast: ToastState; onUndo?: () => void; onDismiss: () => void }) {
  const color =
    toast.type === 'error' ? 'var(--negative)' : toast.type === 'undo' ? 'var(--accent)' : 'var(--positive)';
  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-fade-up"
      style={{ background: 'var(--surface-2)', border: `1px solid ${color}`, color: 'var(--text-primary)' }}
    >
      {toast.type === 'success' && <Check className="w-4 h-4" style={{ color }} />}
      {toast.type === 'error' && <AlertCircle className="w-4 h-4" style={{ color }} />}
      {toast.type === 'undo' && <RotateCcw className="w-4 h-4" style={{ color }} />}
      <span>{toast.message}</span>
      {toast.type === 'undo' && onUndo && (
        <button
          onClick={onUndo}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Undo
        </button>
      )}
      <button onClick={onDismiss} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
