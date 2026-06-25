/**
 * Shared Goals model — imported by the API routes, the reset cron, and the UI.
 *
 * Every field added by the revamp is OPTIONAL so existing stored JSON
 * (`goals_data:{userId}`) keeps deserializing unchanged.
 */
import { getNowInEST } from '@/lib/date-utils';

export type Phase = 'not-started' | 'in-progress' | 'achieved';
export type Category = 'yearly' | 'weekly' | 'daily' | 'collaborative';
export type Source = 'mj' | 'ai' | 'subagent';
export type Priority = 'low' | 'medium' | 'high';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

// Collaborative goals can be handed off to a Claude agent which reports progress.
export type Assignee = 'me' | 'agent';
export type AgentStatus = 'queued' | 'working' | 'blocked' | 'done';
export interface AgentLogEntry {
  at: string; // EST ISO timestamp
  message: string;
  by?: string; // optional agent / session label
}

export interface ActionItem {
  id: string;
  text: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
}

/** Numeric progress, e.g. "Lift 4x this week" => { current: 2, target: 4, unit: 'lifts' }. */
export interface GoalTarget {
  current: number;
  target: number;
  unit?: string;
}

/** Streak bookkeeping for recurring goals — maintained by the reset cron. */
export interface GoalStreak {
  current: number;
  best: number;
  lastCompletedPeriodKey?: string;
}

export interface Goal {
  id: string;
  title: string;
  phase: Phase;
  category: Category;
  notes?: string;
  aiAssisted?: boolean;
  actionItems?: ActionItem[];
  source?: Source;
  dueDate?: string;
  createdAt?: string;
  order?: number;

  // ── Revamp additions (all optional, back-compat) ──
  priority?: Priority;
  target?: GoalTarget;
  recurrence?: Recurrence; // absent === 'none'
  completedAt?: string; // EST ISO, set when phase -> 'achieved'

  // write/cron-managed bookkeeping (not user-edited directly)
  lastPeriodKey?: string; // the period this recurring goal currently "belongs to"
  recurrenceAnchor?: string; // EST ISO when recurrence was enabled
  streak?: GoalStreak;

  // ── Collaborative agent handoff (optional) ──
  assignee?: Assignee; // 'agent' once handed off to Claude
  agentStatus?: AgentStatus; // agent-reported state
  agentLog?: AgentLogEntry[]; // progress timeline written by the agent (capped)
  assignedAt?: string; // EST ISO when handed off
}

export interface GoalsData {
  yearly: Goal[];
  weekly: Goal[];
  daily: Goal[];
  collaborative: Goal[];
}

/** One closed-period outcome for a recurring goal. Stored under goals_history. */
export interface PeriodRecord {
  periodKey: string;
  completed: boolean;
  value?: number;
  recordedAt: string;
}

/** History keyed by goalId. Lives in its own Redis key, written only by the cron. */
export type GoalsHistory = Record<string, PeriodRecord[]>;

export const CATEGORIES: Category[] = ['daily', 'weekly', 'yearly', 'collaborative'];

/** Max history records kept per goal (~6mo daily / ~3.5yr weekly). */
export const HISTORY_CAP = 180;

/** Max agent progress-log entries kept per collaborative goal. */
export const AGENT_LOG_CAP = 50;

export function goalsKey(userId: string): string {
  return `goals_data:${userId}`;
}

export function goalsHistoryKey(userId: string): string {
  return `goals_history:${userId}`;
}

export function isValidCategory(cat: string): cat is Category {
  return cat === 'yearly' || cat === 'weekly' || cat === 'daily' || cat === 'collaborative';
}

/**
 * Apply a phase transition while keeping `completedAt` consistent.
 * The single place phase is mutated — used by POST, PUT and the reset cron so
 * the completion timestamp never drifts. Mutates and returns the goal.
 */
export function applyPhase(goal: Goal, newPhase: Phase): Goal {
  goal.phase = newPhase;
  if (newPhase === 'achieved') {
    if (!goal.completedAt) goal.completedAt = getNowInEST();
  } else {
    delete goal.completedAt;
  }
  return goal;
}
