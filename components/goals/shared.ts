/**
 * Shared UI metadata + pure helpers for the Goals tab components.
 * All colors reference the "Dark Precision" design tokens (app/globals.css),
 * never hardcoded hex, so the tab stays on-brand.
 */
import type { Phase, Category, Source, Priority, Recurrence, AgentStatus, ActivityActor, ActivityKind, Goal, GoalsData } from '@/lib/goals/types';
import { getTodayInEST } from '@/lib/date-utils';

// ── Label / color maps ──────────────────────────────────────────────────────

export const phaseLabels: Record<Phase, string> = {
  'not-started': 'To Do',
  'in-progress': 'In Progress',
  achieved: 'Done',
};

export const phaseAccent: Record<Phase, string> = {
  'not-started': 'var(--text-tertiary)',
  'in-progress': 'var(--warning)',
  achieved: 'var(--positive)',
};

export const categoryLabels: Record<Category, string> = {
  yearly: 'Yearly',
  weekly: 'Weekly',
  daily: 'Daily',
  collaborative: 'Collaborative',
};

export const categoryDescriptions: Record<Category, string> = {
  yearly: 'Long-term ambitions',
  weekly: 'This week’s targets',
  daily: 'Daily habits & tasks',
  collaborative: 'Tasks you hand off to Claude agents',
};

export const CATEGORY_ORDER: Category[] = ['daily', 'weekly', 'yearly', 'collaborative'];
export const PHASE_ORDER: Phase[] = ['not-started', 'in-progress', 'achieved'];

export const priorityMeta: Record<Priority, { label: string; color: string }> = {
  high: { label: 'High', color: 'var(--accent)' },
  medium: { label: 'Medium', color: 'var(--warning)' },
  low: { label: 'Low', color: 'var(--text-tertiary)' },
};
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const recurrenceLabels: Record<Recurrence, string> = {
  none: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const sourceMeta: Record<Source, { label: string; color: string; icon: string }> = {
  mj: { label: 'MJ', color: 'var(--accent-light)', icon: '👤' },
  ai: { label: 'AI', color: '#c084fc', icon: '🤖' },
  subagent: { label: 'Agent', color: 'var(--info)', icon: '⚡' },
};

export const agentStatusMeta: Record<AgentStatus, { label: string; color: string; pulse?: boolean }> = {
  queued: { label: 'Queued', color: 'var(--text-secondary)' },
  working: { label: 'Working', color: 'var(--info)', pulse: true },
  blocked: { label: 'Blocked', color: 'var(--negative)' },
  done: { label: 'Done', color: 'var(--positive)' },
};

export const activityActorMeta: Record<ActivityActor, { label: string; color: string; icon: string }> = {
  mj: { label: 'You', color: 'var(--accent-light)', icon: '👤' },
  claude: { label: 'Claude', color: '#c084fc', icon: '🤖' },
};

export const activityKindColor: Record<ActivityKind, string> = {
  created: 'var(--text-secondary)',
  updated: 'var(--text-secondary)',
  handoff: 'var(--info)',
  recall: 'var(--text-secondary)',
  progress: 'var(--info)',
  completed: 'var(--positive)',
  reopened: 'var(--warning)',
  blocked: 'var(--negative)',
  help_request: 'var(--warning)',
  help_answer: 'var(--accent)',
  resource: 'var(--info)',
};

/** Short "time ago" for feed timestamps (e.g. "3m", "2h", "Jun 24"). */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'future';
export interface DueStatus {
  label: string;
  tone: DueTone;
  color: string;
}

/** Human due-date status relative to today (EST), with a token color. */
export function getDueStatus(dueDate?: string): DueStatus | null {
  if (!dueDate) return null;
  const today = getTodayInEST();
  const due = dueDate.slice(0, 10);
  const label = new Date(due + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  if (due < today) return { label, tone: 'overdue', color: 'var(--negative)' };
  if (due === today) return { label: 'Today', tone: 'today', color: 'var(--warning)' };
  if (daysBetween(today, due) <= 3) return { label, tone: 'soon', color: 'var(--warning)' };
  return { label, tone: 'future', color: 'var(--text-tertiary)' };
}

export function milestoneProgress(goal: Goal): { done: number; total: number } | null {
  const items = goal.actionItems;
  if (!items || items.length === 0) return null;
  return { done: items.filter((i) => i.status === 'completed').length, total: items.length };
}

export function targetProgress(
  goal: Goal,
): { current: number; target: number; pct: number; unit?: string } | null {
  const t = goal.target;
  if (!t || !t.target || t.target <= 0) return null;
  const pct = Math.min(100, Math.max(0, Math.round((t.current / t.target) * 100)));
  return { current: t.current, target: t.target, pct, unit: t.unit };
}

export function getProgressStats(list: Goal[]) {
  const total = list.length;
  const achieved = list.filter((g) => g.phase === 'achieved').length;
  const inProgress = list.filter((g) => g.phase === 'in-progress').length;
  const percentage = total > 0 ? Math.round((achieved / total) * 100) : 0;
  return { total, achieved, inProgress, percentage };
}

export function sortGoals(list: Goal[]): Goal[] {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function byPhase(list: Goal[], phase: Phase): Goal[] {
  return sortGoals(list.filter((g) => g.phase === phase));
}

export function matchesSearch(goal: Goal, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().trim();
  return !!(
    goal.title?.toLowerCase().includes(q) ||
    goal.notes?.toLowerCase().includes(q) ||
    goal.actionItems?.some((i) => i.text?.toLowerCase().includes(q)) ||
    goal.source?.toLowerCase().includes(q)
  );
}

export function allGoals(goals: GoalsData): Goal[] {
  return [...goals.daily, ...goals.weekly, ...goals.yearly, ...goals.collaborative];
}

/** Monday (YYYY-MM-DD) of the current EST week. */
export function currentWeekMondayEST(): string {
  const [y, m, d] = getTodayInEST().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

// ── Focus view ──────────────────────────────────────────────────────────────

export interface FocusGroup {
  key: string;
  title: string;
  accent: string;
  goals: Goal[];
}

function focusSort(list: Goal[]): Goal[] {
  return [...list].sort((a, b) => {
    const pa = a.priority ? PRIORITY_RANK[a.priority] : 3;
    const pb = b.priority ? PRIORITY_RANK[b.priority] : 3;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate?.slice(0, 10) ?? '9999-99-99';
    const db = b.dueDate?.slice(0, 10) ?? '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/**
 * "What do I do now" buckets across every category (achieved goals excluded).
 * Each goal lands in exactly one bucket, in priority order of urgency.
 */
export function buildFocusGroups(goals: GoalsData): FocusGroup[] {
  const today = getTodayInEST();
  const open = allGoals(goals).filter((g) => g.phase !== 'achieved');
  const used = new Set<string>();
  const take = (pred: (g: Goal) => boolean) => {
    const picked = open.filter((g) => !used.has(g.id) && pred(g));
    picked.forEach((g) => used.add(g.id));
    return focusSort(picked);
  };
  const due = (g: Goal) => g.dueDate?.slice(0, 10);

  const groups: FocusGroup[] = [
    { key: 'overdue', title: 'Overdue', accent: 'var(--negative)', goals: take((g) => !!due(g) && due(g)! < today) },
    { key: 'today', title: 'Due Today', accent: 'var(--warning)', goals: take((g) => due(g) === today) },
    { key: 'inprogress', title: 'In Progress', accent: 'var(--warning)', goals: take((g) => g.phase === 'in-progress') },
    {
      key: 'week',
      title: 'Due This Week',
      accent: 'var(--info)',
      goals: take((g) => {
        const d = due(g);
        if (!d) return false;
        const diff = daysBetween(today, d);
        return diff > 0 && diff <= 7;
      }),
    },
    { key: 'priority', title: 'High Priority', accent: 'var(--accent)', goals: take((g) => g.priority === 'high') },
  ];
  return groups.filter((grp) => grp.goals.length > 0);
}

// ── Insights (client-derivable, no history) ──────────────────────────────────

export function computeKpis(goals: GoalsData) {
  const all = allGoals(goals);
  const today = getTodayInEST();
  const monday = currentWeekMondayEST();
  const total = all.length;
  const achieved = all.filter((g) => g.phase === 'achieved').length;
  const active = total - achieved;
  const completionRate = total > 0 ? Math.round((achieved / total) * 100) : 0;
  const overdue = all.filter((g) => g.phase !== 'achieved' && g.dueDate && g.dueDate.slice(0, 10) < today).length;
  const completedThisWeek = all.filter((g) => g.completedAt && g.completedAt.slice(0, 10) >= monday).length;
  const bestStreak = all.reduce((max, g) => Math.max(max, g.streak?.best ?? 0), 0);
  return { total, achieved, active, completionRate, overdue, completedThisWeek, bestStreak };
}

export function categoryBreakdown(goals: GoalsData) {
  return CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: categoryLabels[cat],
    ...getProgressStats(goals[cat]),
  }));
}

export function phaseDistribution(goals: GoalsData) {
  const all = allGoals(goals);
  return PHASE_ORDER.map((p) => ({
    phase: p,
    label: phaseLabels[p],
    count: all.filter((g) => g.phase === p).length,
    color: phaseAccent[p],
  }));
}
