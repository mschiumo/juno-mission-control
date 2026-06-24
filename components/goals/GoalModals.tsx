'use client';

import React, { useState } from 'react';
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
  Target as TargetIcon,
} from 'lucide-react';
import type { ActionItem, Category, Goal, GoalTarget, Priority, Recurrence } from '@/lib/goals/types';
import { categoryLabels, priorityMeta } from './shared';

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
const labelStyle: React.CSSProperties = { color: 'var(--text-tertiary)' };

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-in">
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
  target?: GoalTarget;
}

export function GoalEditModal({
  mode,
  goal,
  defaultCategory,
  onClose,
  onSubmit,
  onOpenMilestones,
}: {
  mode: 'create' | 'edit';
  goal?: Goal;
  defaultCategory: Category;
  onClose: () => void;
  onSubmit: (value: GoalFormValue) => Promise<void> | void;
  onOpenMilestones?: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [category, setCategory] = useState<Category>(goal?.category ?? defaultCategory);
  const [priority, setPriority] = useState<Priority | 'none'>(goal?.priority ?? 'none');
  const [dueDate, setDueDate] = useState(goal?.dueDate?.slice(0, 10) ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(goal?.recurrence ?? 'none');
  const [hasTarget, setHasTarget] = useState(!!goal?.target);
  const [targetCurrent, setTargetCurrent] = useState(String(goal?.target?.current ?? 0));
  const [targetGoal, setTargetGoal] = useState(String(goal?.target?.target ?? ''));
  const [targetUnit, setTargetUnit] = useState(goal?.target?.unit ?? '');
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
      target:
        hasTarget && Number(targetGoal) > 0
          ? { current: Number(targetCurrent) || 0, target: Number(targetGoal), unit: targetUnit.trim() || undefined }
          : undefined,
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
      maxWidth="max-w-lg"
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

        {/* Numeric target */}
        <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <TargetIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Track a number
            </span>
            <button
              type="button"
              onClick={() => setHasTarget((v) => !v)}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: hasTarget ? 'var(--accent)' : 'var(--surface-3)' }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                style={{ transform: hasTarget ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </label>
          {hasTarget && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div>
                <label className="block text-[10px] mb-1" style={labelStyle}>
                  Current
                </label>
                <input
                  type="number"
                  value={targetCurrent}
                  onChange={(e) => setTargetCurrent(e.target.value)}
                  className={fieldClass}
                  style={fieldBase}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={labelStyle}>
                  Target
                </label>
                <input
                  type="number"
                  value={targetGoal}
                  onChange={(e) => setTargetGoal(e.target.value)}
                  placeholder="5"
                  className={fieldClass}
                  style={fieldBase}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={labelStyle}>
                  Unit
                </label>
                <input
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value)}
                  placeholder="reps"
                  className={fieldClass}
                  style={fieldBase}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                />
              </div>
            </div>
          )}
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
