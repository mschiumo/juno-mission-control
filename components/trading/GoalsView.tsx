'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore, createContext, useContext } from 'react';
import {
  Target,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  XCircle,
  Trophy,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Shield,
} from 'lucide-react';
import CreateGoalModal from './CreateGoalModal';
import { moveWithinSection } from '@/lib/trading/goal-order';
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
  const gray = { color: 'var(--text-secondary)', bg: 'var(--surface-2)' };
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

/* ----------------------------- drag to reorder ----------------------------- */

/**
 * Reordering is desktop-only: it needs a real pointer and the two-column
 * layout. Touch devices keep the plain list (the browser would otherwise
 * fight native scrolling for the gesture).
 */
const DESKTOP_DRAG_MQ = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
function subscribeDesktopDrag(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_DRAG_MQ);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
function useDesktopDrag(): boolean {
  return useSyncExternalStore(
    subscribeDesktopDrag,
    () => window.matchMedia(DESKTOP_DRAG_MQ).matches,
    () => false,
  );
}

/** Which section a grid belongs to. A drag can only be dropped in the section it started in. */
type SectionKey = 'active' | 'achieved' | 'missed' | 'archived';
type ActiveDrag = { id: string; section: SectionKey };

type DragCtx = {
  canDrag: boolean;
  drag: ActiveDrag | null;
  start: (d: ActiveDrag) => void;
  end: () => void;
  /** Drop the dragged goal into `toId`'s slot. `sectionItems` is the section's current list. */
  drop: (sectionItems: GoalWithProgress[], fromId: string, toId: string) => void;
};
const DragContext = createContext<DragCtx>({
  canDrag: false,
  drag: null,
  start: () => {},
  end: () => {},
  drop: () => {},
});

/** True while a drag from a *different* section is in flight — this section can't accept it. */
function useSectionLocked(section: SectionKey): boolean {
  const { drag } = useContext(DragContext);
  return drag !== null && drag.section !== section;
}

function LockedHint() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
    >
      <Lock className="w-3 h-3" />
      Reorder within a section only
    </span>
  );
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

function PaceStats({ progress }: { progress: GoalProgress }) {
  const left = progress.tradingDaysRemaining;
  if (progress.met) {
    return (
      <span>
        Target reached{left > 0 ? ` with ${left} trading day${left === 1 ? '' : 's'} to spare` : ''} — keep it up.
      </span>
    );
  }
  if (left <= 0) return <span>Window closed.</span>;
  const cells = [
    {
      label: 'Pace needed',
      value: `${fmtValue(progress.unit, progress.requiredPerDay ?? 0)}/day`,
      highlight: true,
    },
    {
      label: 'Your pace',
      value: progress.actualPerDay !== undefined ? `${fmtValue(progress.unit, progress.actualPerDay)}/day` : '—',
      highlight: false,
    },
    {
      label: 'Projected',
      value: progress.projectedFinal !== undefined ? fmtValue(progress.unit, progress.projectedFinal) : '—',
      highlight: false,
    },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg px-2.5 py-1.5"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-secondary)' }}>
              {c.label}
            </div>
            <div className="text-sm font-bold num" style={{ color: c.highlight ? 'var(--accent-light)' : 'var(--text-primary)' }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>
        {left} trading day{left === 1 ? '' : 's'} left
        {progress.sampleSize > 0 && ` · ${progress.outcome === 'on_track' ? 'on pace' : 'behind pace'}`}
      </div>
    </div>
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
  if (metric === 'plan_adherence') return `${n} marked trade${n === 1 ? '' : 's'}`;
  return `${n} trade${n === 1 ? '' : 's'}`;
}

type GoalHandlers = {
  onEdit: (g: TradingGoal) => void;
  onArchive: (g: TradingGoal) => void;
  onDelete: (g: TradingGoal) => void;
};

function GoalCard({
  gwp,
  section,
  sectionItems,
  dimmed = false,
  onEdit,
  onArchive,
  onDelete,
}: GoalHandlers & {
  gwp: GoalWithProgress;
  section: SectionKey;
  /** The section's full list, in display order — the drop target set for a drag from this card. */
  sectionItems: GoalWithProgress[];
  /** Closed-window goal shown below the active grid — visually recede without hiding detail. */
  dimmed?: boolean;
}) {
  const { goal, progress } = gwp;
  const meta = GOAL_METRICS[goal.metric];
  const disp = outcomeDisplay(progress.outcome, progress.direction);
  const lte = progress.direction === 'lte';
  const archived = goal.status === 'archived';
  const barColor = progress.outcome === 'no_data' ? 'rgba(255,255,255,0.15)' : disp.color;

  const { canDrag, drag, start, end, drop } = useContext(DragContext);
  const cardRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  // Nothing to reorder in a one-card section, so don't show a handle there.
  const draggable = canDrag && sectionItems.length > 1;
  const isDragging = drag?.id === goal.id;
  // Only a drag that started in this same section may land here.
  const acceptsDrop = drag !== null && drag.section === section && !isDragging;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', goal.id);
    const el = cardRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top);
    }
    start({ id: goal.id, section });
  };
  const onDragOver = (e: React.DragEvent) => {
    // Not calling preventDefault leaves the browser's default: drop refused,
    // "not-allowed" cursor — exactly the cue we want for a foreign section.
    if (!acceptsDrop && !isDragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (acceptsDrop && !over) setOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!acceptsDrop) return;
    e.preventDefault();
    setOver(false);
    drop(sectionItems, drag.id, goal.id);
    end();
  };

  return (
    <div
      ref={cardRef}
      className="group rounded-xl p-4 sm:p-5 transition-[opacity,box-shadow]"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-default)',
        opacity: isDragging ? 0.35 : archived ? 0.6 : dimmed ? 0.8 : 1,
        boxShadow: over ? '0 0 0 2px var(--accent)' : undefined,
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        {draggable && (
          <span
            role="button"
            aria-label="Drag to reorder within this section"
            title="Drag to reorder within this section"
            draggable
            onDragStart={onDragStart}
            onDragEnd={end}
            className="shrink-0 -ml-2 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded cursor-grab active:cursor-grabbing opacity-35 group-hover:opacity-80 hover:opacity-100! transition-opacity"
            style={{ color: 'var(--text-secondary)' }}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {goal.title}
            </h3>
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
            >
              {GOAL_CATEGORY_LABELS[goal.category]}
            </span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
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
          <span className="text-xs num" style={{ color: 'var(--text-secondary)' }}>
            / {fmtValue(progress.unit, progress.target)}
            {lte ? ' limit' : ''}
          </span>
        </div>
        {progress.met && <CheckCircle2 className="w-4 h-4" style={{ color: '#00C896' }} />}
      </div>

      <ProgressBar pct={progress.pct} color={barColor} />

      {/* context line */}
      <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {progress.paced && progress.tradingDaysRemaining > 0 ? (
          <PaceStats progress={progress} />
        ) : progress.outcome === 'no_data' ? (
          <span>No closed trades in this window yet — progress updates as you import trades.</span>
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

      {goal.note && (
        <p className="mt-3 text-[11px] italic leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {goal.note}
        </p>
      )}

      {/* footer / actions */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
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
        Set a target like “earn $1,050 by July 13” and ConfluenceTrading tracks it automatically from your imported
        trades — with the daily run-rate you need to stay on pace.
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

function GoalGrid({
  items,
  section,
  dimmed,
  ...handlers
}: GoalHandlers & { items: GoalWithProgress[]; section: SectionKey; dimmed?: boolean }) {
  const locked = useSectionLocked(section);
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity"
      style={{ opacity: locked ? 0.4 : 1 }}
    >
      {items.map((gwp) => (
        <GoalCard key={gwp.goal.id} gwp={gwp} section={section} sectionItems={items} dimmed={dimmed} {...handlers} />
      ))}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  blurb,
  color,
  action,
  locked = false,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  blurb?: string;
  color: string;
  action?: React.ReactNode;
  /** A drag from another section is in flight — say why this one won't take it. */
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {icon}
          {title}
        </span>
        <span
          className="text-[11px] font-semibold num px-1.5 py-0.5 rounded"
          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
        >
          {count}
        </span>
        {locked ? (
          <LockedHint />
        ) : (
          blurb && (
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {blurb}
            </span>
          )
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Goals whose window has ended (achieved or missed). Rendered below the active
 * grid, separated by a rule, and collapsible so a long history of closed goals
 * never crowds what the trader is working toward right now.
 */
function ClosedSection({
  icon,
  title,
  blurb,
  color,
  section,
  items,
  dimmed,
  open,
  onToggle,
  ...handlers
}: GoalHandlers & {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  color: string;
  section: SectionKey;
  items: GoalWithProgress[];
  dimmed?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const locked = useSectionLocked(section);
  return (
    <div className="pt-5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <SectionHeader
        icon={icon}
        title={title}
        count={items.length}
        blurb={blurb}
        color={color}
        locked={locked}
        action={
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-xs font-medium shrink-0 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Show'}
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        }
      />
      {open && <GoalGrid items={items} section={section} dimmed={dimmed} {...handlers} />}
    </div>
  );
}

/** Shown in place of the active grid when every goal's window has closed. */
function NoActiveGoals({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="rounded-xl px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3"
      style={{ background: 'var(--surface-1)', border: '1px dashed var(--border-default)' }}
    >
      <div className="text-center sm:text-left">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          No active goals
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Every goal’s window has closed. Set a new target to keep your run-rate in view.
        </div>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold shrink-0"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <Plus className="w-3.5 h-3.5" /> New Goal
      </button>
    </div>
  );
}

/* ----------------------------- main view ----------------------------- */

export default function GoalsView({ refreshKey }: { refreshKey?: number }) {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TradingGoal | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showAchieved, setShowAchieved] = useState(true);
  const [showMissed, setShowMissed] = useState(true);
  const canDrag = useDesktopDrag();
  const [drag, setDrag] = useState<ActiveDrag | null>(null);

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
  }, [load, refreshKey]);

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

  const startDrag = useCallback((d: ActiveDrag) => setDrag(d), []);
  const endDrag = useCallback(() => setDrag(null), []);
  const dropGoal = useCallback(
    (sectionItems: GoalWithProgress[], fromId: string, toId: string) => {
      const next = moveWithinSection(
        goals.map((g) => g.goal.id),
        sectionItems.map((g) => g.goal.id),
        fromId,
        toId,
      );
      if (!next) return;
      const byId = new Map(goals.map((g) => [g.goal.id, g]));
      // Optimistic: reorder locally now, persist in the background, resync on failure.
      setGoals(next.flatMap((id) => byId.get(id) ?? []));
      fetch('/api/trading-goals/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next }),
      })
        .then((r) => {
          if (!r.ok) load();
        })
        .catch(() => load());
    },
    [goals, load],
  );
  const dragCtx = useMemo<DragCtx>(
    () => ({ canDrag, drag, start: startDrag, end: endDrag, drop: dropGoal }),
    [canDrag, drag, startDrag, endDrag, dropGoal],
  );

  const unarchived = goals.filter((x) => x.goal.status !== 'archived');
  // 'achieved' / 'missed' are only assigned once the window has ended, so
  // everything else is a goal the trader can still move.
  const active = unarchived.filter((x) => x.progress.outcome !== 'achieved' && x.progress.outcome !== 'missed');
  const achieved = unarchived.filter((x) => x.progress.outcome === 'achieved');
  const missed = unarchived.filter((x) => x.progress.outcome === 'missed');
  const archived = goals.filter((x) => x.goal.status === 'archived');
  const hasClosed = achieved.length > 0 || missed.length > 0;
  const handlers = { onEdit: openEdit, onArchive: handleArchive, onDelete: handleDelete };
  const activeLocked = drag !== null && drag.section !== 'active';

  return (
    <DragContext.Provider value={dragCtx}>
      <div className="space-y-5">
        {/* header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Goals
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
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
        ) : unarchived.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <div>
            {hasClosed && (
              <SectionHeader
                icon={<Target className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />}
                title="Active"
                count={active.length}
                color="var(--text-primary)"
                locked={activeLocked}
              />
            )}
            {active.length === 0 ? <NoActiveGoals onCreate={openCreate} /> : <GoalGrid items={active} section="active" {...handlers} />}
          </div>
        )}

        {!loading && achieved.length > 0 && (
          <ClosedSection
            icon={<Trophy className="w-3.5 h-3.5" />}
            title="Achieved"
            blurb="Window closed with the target met"
            color="#00C896"
            section="achieved"
            items={achieved}
            open={showAchieved}
            onToggle={() => setShowAchieved((s) => !s)}
            {...handlers}
          />
        )}

        {!loading && missed.length > 0 && (
          <ClosedSection
            icon={<XCircle className="w-3.5 h-3.5" />}
            title="Missed"
            blurb="Window closed before the target was met"
            color="#FF3D57"
            section="missed"
            items={missed}
            dimmed
            open={showMissed}
            onToggle={() => setShowMissed((s) => !s)}
            {...handlers}
          />
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
              <GoalGrid items={archived} section="archived" {...handlers} />
            )}
          </div>
        )}

        <CreateGoalModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => load()} editingGoal={editing} />
      </div>
    </DragContext.Provider>
  );
}
