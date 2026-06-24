'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2, Shield, Plus } from 'lucide-react';
import {
  GOAL_METRICS,
  METRICS_BY_CATEGORY,
  GOAL_CATEGORY_LABELS,
  type GoalCategory,
  type GoalMetric,
  type GoalGuardrail,
  type TradingGoal,
  type GoalWithProgress,
} from '@/types/trading-goals';
import { countTradingDays } from '@/lib/trading/trading-days';
import { getTodayInEST } from '@/lib/date-utils';

const CATEGORY_ORDER: GoalCategory[] = ['profit', 'guardrail', 'consistency', 'journaling'];
const GUARDRAIL_OPTIONS: GoalMetric[] = ['max_daily_loss', 'max_trade_loss', 'max_trades_per_day'];

function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDateShort(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function unitAffix(metric: GoalMetric): { prefix: string; suffix: string } {
  const unit = GOAL_METRICS[metric].unit;
  if (unit === 'currency') return { prefix: '$', suffix: '' };
  if (unit === 'percent') return { prefix: '', suffix: '%' };
  if (unit === 'ratio') return { prefix: '', suffix: '×' };
  return { prefix: '', suffix: '' };
}

function defaultTitle(metric: GoalMetric, targetStr: string, endDate: string): string {
  const t = targetStr || GOAL_METRICS[metric].targetPlaceholder;
  const by = endDate ? ` by ${fmtDateShort(endDate)}` : '';
  switch (metric) {
    case 'net_profit':
      return `Earn $${t}${by}`;
    case 'win_rate':
      return `Hit a ${t}% win rate${by}`;
    case 'profit_factor':
      return `Reach a ${t}× profit factor${by}`;
    case 'green_days':
      return `${t} green days${by}`;
    case 'max_drawdown':
      return `Keep drawdown under $${t}`;
    case 'max_daily_loss':
      return `No day worse than -$${t}`;
    case 'max_trade_loss':
      return `No trade worse than -$${t}`;
    case 'max_trades_per_day':
      return `Cap at ${t} trades per day`;
    case 'quality_setups':
      return `${t}% A+ setups${by}`;
    case 'journal_consistency':
      return `Journal every trading day${by}`;
    default:
      return 'New goal';
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (result: GoalWithProgress) => void;
  editingGoal?: TradingGoal | null;
}

export default function CreateGoalModal({ isOpen, onClose, onSaved, editingGoal }: Props) {
  const isEdit = !!editingGoal;
  const today = useMemo(() => getTodayInEST(), []);

  const [category, setCategory] = useState<GoalCategory>('profit');
  const [metric, setMetric] = useState<GoalMetric>('net_profit');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addCalendarDays(today, 14));
  const [note, setNote] = useState('');
  const [guardrailOn, setGuardrailOn] = useState(false);
  const [guardrailMetric, setGuardrailMetric] = useState<GoalMetric>('max_daily_loss');
  const [guardrailTarget, setGuardrailTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / prefill when opened.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    if (editingGoal) {
      setCategory(editingGoal.category);
      setMetric(editingGoal.metric);
      setTarget(String(editingGoal.target));
      setTitle(editingGoal.title);
      setTitleTouched(true);
      setStartDate(editingGoal.startDate);
      setEndDate(editingGoal.endDate);
      setNote(editingGoal.note || '');
      const g = editingGoal.guardrails?.[0];
      setGuardrailOn(!!g);
      if (g) {
        setGuardrailMetric(g.metric);
        setGuardrailTarget(String(g.target));
      }
    } else {
      setCategory('profit');
      setMetric('net_profit');
      setTarget('');
      setTitle('');
      setTitleTouched(false);
      setStartDate(today);
      setEndDate(addCalendarDays(today, 14));
      setNote('');
      setGuardrailOn(false);
      setGuardrailMetric('max_daily_loss');
      setGuardrailTarget('');
    }
  }, [isOpen, editingGoal, today]);

  // Keep the metric valid for the chosen category.
  useEffect(() => {
    if (!METRICS_BY_CATEGORY[category].includes(metric)) {
      setMetric(METRICS_BY_CATEGORY[category][0]);
    }
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-title until the user edits it.
  useEffect(() => {
    if (!titleTouched) setTitle(defaultTitle(metric, target, endDate));
  }, [metric, target, endDate, titleTouched]);

  const tradingDays = useMemo(() => countTradingDays(startDate, endDate), [startDate, endDate]);
  const meta = GOAL_METRICS[metric];
  const affix = unitAffix(metric);
  const guardrailAffix = unitAffix(guardrailMetric);
  const canGuardrail = category !== 'guardrail';

  const submit = useCallback(async () => {
    setError(null);
    const targetNum = parseFloat(target);
    if (!title.trim()) {
      setError('Give your goal a title.');
      return;
    }
    if (isNaN(targetNum) || targetNum < 0) {
      setError('Enter a target value.');
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }

    const guardrails: GoalGuardrail[] | undefined =
      guardrailOn && canGuardrail && guardrailTarget !== '' && !isNaN(parseFloat(guardrailTarget))
        ? [
            {
              metric: guardrailMetric,
              target: parseFloat(guardrailTarget),
              direction: GOAL_METRICS[guardrailMetric].direction,
            },
          ]
        : undefined;

    setSaving(true);
    try {
      const url = isEdit ? `/api/trading-goals/${editingGoal!.id}` : '/api/trading-goals';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit
        ? { title: title.trim(), target: targetNum, startDate, endDate, note, guardrails: guardrails ?? [] }
        : { title: title.trim(), metric, target: targetNum, startDate, endDate, note, guardrails };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save goal');
      onSaved({ goal: data.goal, progress: data.progress });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save goal');
    } finally {
      setSaving(false);
    }
  }, [
    target,
    title,
    startDate,
    endDate,
    guardrailOn,
    canGuardrail,
    guardrailTarget,
    guardrailMetric,
    isEdit,
    editingGoal,
    metric,
    note,
    onSaved,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isEdit ? 'Edit goal' : 'New goal'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Tracked automatically from your trade history
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Category */}
          {!isEdit && (
            <Field label="Category">
              <div className="grid grid-cols-2 gap-2">
                {CATEGORY_ORDER.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all text-left"
                    style={
                      category === c
                        ? { background: 'var(--accent-dim)', border: '1px solid rgba(255,107,0,0.35)', color: 'var(--accent-light)' }
                        : { background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }
                    }
                  >
                    {GOAL_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Metric */}
          <Field label="Metric">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as GoalMetric)}
              disabled={isEdit}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                opacity: isEdit ? 0.6 : 1,
              }}
            >
              {METRICS_BY_CATEGORY[category].map((m) => (
                <option key={m} value={m}>
                  {GOAL_METRICS[m].label}
                </option>
              ))}
            </select>
            <p className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--text-tertiary)' }}>
              {meta.description}
            </p>
          </Field>

          {/* Target */}
          <Field label={meta.direction === 'lte' ? 'Limit' : 'Target'}>
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
            >
              {affix.prefix && (
                <span className="pl-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {affix.prefix}
                </span>
              )}
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={meta.targetPlaceholder}
                className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none num"
                style={{ color: 'var(--text-primary)' }}
              />
              {affix.suffix && (
                <span className="pr-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {affix.suffix}
                </span>
              )}
            </div>
          </Field>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none num"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
            </Field>
            <Field label="End">
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none num"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
            </Field>
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="num font-semibold" style={{ color: 'var(--accent-light)' }}>
              {tradingDays}
            </span>
            <span>trading day{tradingDays === 1 ? '' : 's'} in this window (weekends &amp; market holidays excluded)</span>
          </div>

          {/* Title */}
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder="Name your goal"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </Field>

          {/* Optional guardrail */}
          {canGuardrail && (
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={guardrailOn} onChange={(e) => setGuardrailOn(e.target.checked)} />
                <Shield className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Add a guardrail
                </span>
              </label>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Pair this goal with a discipline cap — it&apos;s only fully met if the cap holds too.
              </p>
              {guardrailOn && (
                <div className="flex items-center gap-2 mt-2.5">
                  <select
                    value={guardrailMetric}
                    onChange={(e) => setGuardrailMetric(e.target.value as GoalMetric)}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  >
                    {GUARDRAIL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {GOAL_METRICS[m].label}
                      </option>
                    ))}
                  </select>
                  <div
                    className="flex items-center rounded-lg overflow-hidden"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
                  >
                    {guardrailAffix.prefix && (
                      <span className="pl-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {guardrailAffix.prefix}
                      </span>
                    )}
                    <input
                      type="number"
                      value={guardrailTarget}
                      onChange={(e) => setGuardrailTarget(e.target.value)}
                      placeholder={GOAL_METRICS[guardrailMetric].targetPlaceholder}
                      className="w-20 bg-transparent px-2.5 py-1.5 text-xs focus:outline-none num"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    {guardrailAffix.suffix && (
                      <span className="pr-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {guardrailAffix.suffix}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Why this goal, how you'll get there, anything to remember…"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </Field>

          {error && (
            <p className="text-xs" style={{ color: 'var(--negative)' }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 sticky bottom-0"
          style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
            style={{ background: 'var(--accent)', color: 'white', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {isEdit ? 'Save changes' : 'Create goal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
