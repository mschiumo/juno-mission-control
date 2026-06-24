'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import CreateGoalModal from './CreateGoalModal';
import {
  GOAL_METRICS,
  GOAL_CATEGORY_LABELS,
  type GoalWithProgress,
  type TradingGoal,
  type GoalProgress,
  type GoalUnit,
  type GoalOutcome,
  type GoalDirection,
} from '@/types/trading-goals';

/* ----------------------------- formatting ----------------------------- */

function fmtCurrency(v: number): string {
  if (!isFinite(v)) return '∞';
  const abs = Math.abs(Math.round(v));
  const s = `$${abs.toLocaleString('en-US')}`;
  return v < 0 ? `-${s}` : s;
}

function fmtValue(unit: GoalUnit, v: number): string {
  if (!isFinite(v)) return '∞';
  switch (unit) {
    case 'currency':
      return fmtCurrency(v);
    case 'percent':
      return `${Math.round(v)}%`;
    case 'ratio':
      return `${v.toFixed(2)}×`;
    case 'count':
      return String(Math.round(v));
    default:
      return String(v);
  }
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function outcomeDisplay(outcome: GoalOutcome, direction: GoalDirection): { label: string; color: string; bg: string } {
  const lte = direction === 'lte';
  const green = { color: '#00C896', bg: 'rgba(0,200,150,0.12)' };
  const blue = { color: '#3B9EFF', bg: 'rgba(59,158,255,0.12)' };
  const amber = { color: '#F5A623', bg: 'rgba(245,166,35,0.12)' };
  const red = { color: '#FF3D57', bg: 'rgba(255,61,87,0.12)' };
  const gray = { color: 'var(--text-tertiary)', bg: 'var(--surface-2)' };
  switch (outcome) {
    case 'achieved':
      return { label: lte ? 'Held' : 'Achieved', ...green };
    case 'ahead':
      return { label: lte ? 'Within limit' : 'Ahead of pace', ...green };
    case 'on_track':
      return { label: 'On track', ...blue };
    case 'behind':
      return lte ? { label: 'Breached', ...red } : { label: 'Behind pace', ...amber };
    case 'missed':
      return { label: lte ? 'Breached' : 'Missed', ...red };
    case 'no_data':
    default:
      return { label: 'No data yet', ...gray };
  }
}

/* ----------------------------- subcomponents ----------------------------- */

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

function PaceLine({ progress }: { progress: GoalProgress }) {
  const left = progress.tradingDaysRemaining;
  if (progress.met) {
    return (
      <span>
        Target reached with {left} trading day{left === 1 ? '' : 's'} to spare — keep it up.
      </span>
    );
  }
  if (left <= 0) return <span>Window closed.</span>;
  const req = progress.requiredPerDay ?? 0;
  const proj = progress.projectedFinal;
  return (
    <span>
      Need{' '}
      <strong className="num" style={{ color: 'var(--text-primary)' }}>
        {fmtValue(progress.unit, req)}/day
      </strong>{' '}
      across {left} trading day{left === 1 ? '' : 's'} left
      {proj !== undefined && (
        <>
          {' '}· on pace for{' '}
          <span className="num" style={{ color: progress.outcome === 'on_track' ? '#00C896' : '#F5A623' }}>
            {fmtValue(progress.unit, proj)}
          </span>
        </>
      )}
    </span>
  );
}

function NonPacedLine({ progress, lte }: { progress: GoalProgress; lte: boolean }) {
  const left = progress.tradingDaysRemaining;
  const leftTxt = left > 0 ? `${left} trading day${left === 1 ? '' : 's'} left` : 'window closed';
  if (lte) {
    return (
      <span>
        {progress.met ? 'Within limit' : 'Over limit'} — worst so far {fmtValue(progress.unit, progress.current)} vs{' '}
        {fmtValue(progress.unit, progress.target)} cap · {leftTxt}
      </span>
    );
  }
  return (
    <span>
      {fmtValue(progress.unit, progress.current)} of {fmtValue(progress.unit, progress.target)} target · {leftTxt}
    </span>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 rounded-md transition-opacity opacity-60 hover:opacity-100"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </button>
  );
}

function sampleLabel(metric: string, n: number): string {
  if (n <= 0) return '';
  if (metric === 'journal_consistency') return `${n} trading day${n === 1 ? '' : 's'}`;
  if (metric === 'quality_setups') return `${n} rated trade${n === 1 ? '' : 's'}`;
  return `${n} trade${n === 1 ? '' : 's'}`;
}

function GoalCard({
  gwp,
  onEdit,
  onArchive,
  onDelete,
}: {
  gwp: GoalWithProgress;
  onEdit: (g: TradingGoal) => void;
  onArchive: (g: TradingGoal) => void;
  onDelete: (g: TradingGoal) => void;
}) {
  const { goal, progress } = gwp;
  const meta = GOAL_METRICS[goal.metric];
  const disp = outcomeDisplay(progress.outcome, progress.direction);
  const lte = progress.direction === 'lte';
  const archived = goal.status === 'archived';
  const barColor = progress.outcome === 'no_data' ? 'rgba(255,255,255,0.15)' : disp.color;

  return (
    <div
      className="rounded-xl p-4 sm:p-5"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', opacity: archived ? 0.6 : 1 }}
    >
      {/* top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {goal.title}
            </h3>
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}
            >
              {GOAL_CATEGORY_LABELS[goal.category]}
            </span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {meta.label} · {fmtDate(goal.startDate)} – {fmtDate(goal.endDate)}
          </p>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-md whitespace-nowrap shrink-0"
          style={{ color: disp.color, background: disp.bg }}
        >
          {disp.label}
        </span>
      </div>

      {/* value line */}
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold num" style={{ color: 'var(--text-primary)' }}>
            {fmtValue(progress.unit, progress.current)}
          </span>
          <span className="text-xs num" style={{ color: 'var(--text-tertiary)' }}>
            / {fmtValue(progress.unit, progress.target)}
            {lte ? ' limit' : ''}
          </span>
        </div>
        {progress.met && <CheckCircle2 className="w-4 h-4" style={{ color: '#00C896' }} />}
      </div>

      <ProgressBar pct={progress.pct} color={barColor} />

      {/* context line */}
      <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {progress.outcome === 'no_data' ? (
          <span>No closed trades in this window yet — progress updates as you import trades.</span>
        ) : progress.paced ? (
          <PaceLine progress={progress} />
        ) : (
          <NonPacedLine progress={progress} lte={lte} />
        )}
      </div>

      {/* guardrails */}
      {progress.guardrailResults && progress.guardrailResults.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {progress.guardrailResults.map((g) => (
            <span
              key={g.metric}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
              style={{
                background: g.breached ? 'rgba(255,61,87,0.1)' : 'rgba(0,200,150,0.1)',
                color: g.breached ? '#FF3D57' : '#00C896',
              }}
            >
              <Shield className="w-3 h-3" />
              {g.label} ≤ {fmtValue(g.unit, g.target)} · {g.breached ? 'breached' : 'ok'} ({fmtValue(g.unit, g.current)})
            </span>
          ))}
        </div>
      )}

      {/* footer / actions */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {sampleLabel(goal.metric, progress.sampleSize)}
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn title="Edit" onClick={() => onEdit(goal)}>
            <Pencil className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title={archived ? 'Unarchive' : 'Archive'} onClick={() => onArchive(goal)}>
            {archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </IconBtn>
          <IconBtn title="Delete" onClick={() => onDelete(goal)}>
            <Trash2 className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl px-6 py-12 text-center" style={{ background: 'var(--surface-1)', border: '1px dashed var(--border-default)' }}>
      <Target className="w-9 h-9 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        No goals yet
      </h3>
      <p className="text-xs mb-4 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
        Set a target like “earn $1,050 by July 13” and Juno tracks it automatically from your imported trades — with the
        daily run-rate you need to stay on pace.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <Plus className="w-3.5 h-3.5" /> Create your first goal
      </button>
    </div>
  );
}

/* ----------------------------- main view ----------------------------- */

export default function GoalsView() {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TradingGoal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/trading-goals')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setGoals(data.goals || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (g: TradingGoal) => {
    setEditing(g);
    setModalOpen(true);
  };

  const handleArchive = useCallback(
    async (g: TradingGoal) => {
      await fetch(`/api/trading-goals/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: g.status === 'archived' ? 'active' : 'archived' }),
      }).catch(() => {});
      load();
    },
    [load],
  );

  const handleDelete = useCallback(
    async (g: TradingGoal) => {
      if (!window.confirm(`Delete “${g.title}”? This can't be undone.`)) return;
      await fetch(`/api/trading-goals/${g.id}`, { method: 'DELETE' }).catch(() => {});
      load();
    },
    [load],
  );

  const active = goals.filter((x) => x.goal.status !== 'archived');
  const archived = goals.filter((x) => x.goal.status === 'archived');

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Goals
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Profit targets, guardrails, and consistency — updated automatically from your trade history.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Plus className="w-3.5 h-3.5" /> New Goal
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : active.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {active.map((gwp) => (
            <GoalCard key={gwp.goal.id} gwp={gwp} onEdit={openEdit} onArchive={handleArchive} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="text-xs font-medium mb-3 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {archived.map((gwp) => (
                <GoalCard key={gwp.goal.id} gwp={gwp} onEdit={openEdit} onArchive={handleArchive} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateGoalModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => load()} editingGoal={editing} />
    </div>
  );
}
