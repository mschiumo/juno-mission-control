/**
 * Trading Goals API
 *
 * GET  /api/trading-goals  — list goals with freshly-computed progress
 * POST /api/trading-goals  — create a goal
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getAllTrades } from '@/lib/db/trades-v2';
import { getAllGoals, saveGoal, getJournaledDates } from '@/lib/db/trading-goals';
import { computeGoalProgress } from '@/lib/trading/goal-progress';
import {
  GOAL_METRICS,
  type TradingGoal,
  type GoalGuardrail,
  type CreateGoalRequest,
  type GoalWithProgress,
} from '@/types/trading-goals';

function usesJournal(metric: string, guardrails?: GoalGuardrail[]): boolean {
  return (
    metric === 'journal_consistency' ||
    (guardrails || []).some((g) => g.metric === 'journal_consistency')
  );
}

function isValidDate(s?: string): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeGuardrails(gs?: GoalGuardrail[]): GoalGuardrail[] | undefined {
  if (!gs || !Array.isArray(gs) || gs.length === 0) return undefined;
  const valid = gs
    .filter((g) => g && g.metric in GOAL_METRICS && typeof g.target === 'number' && isFinite(g.target))
    .map((g) => ({
      metric: g.metric,
      target: g.target,
      direction: GOAL_METRICS[g.metric].direction,
    }));
  return valid.length ? valid : undefined;
}

function validateGoalInput(b: Partial<CreateGoalRequest>): string | null {
  if (!b || typeof b !== 'object') return 'Invalid request body';
  if (!b.title || !b.title.trim()) return 'Title is required';
  if (!b.metric || !(b.metric in GOAL_METRICS)) return 'Unknown goal metric';
  if (typeof b.target !== 'number' || !isFinite(b.target)) return 'Target must be a number';
  if (b.target < 0) return 'Target must be zero or greater';
  if (!isValidDate(b.startDate) || !isValidDate(b.endDate)) {
    return 'Start and end dates are required (YYYY-MM-DD)';
  }
  if ((b.endDate as string) < (b.startDate as string)) {
    return 'End date must be on or after the start date';
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const [goals, trades] = await Promise.all([getAllGoals(userId), getAllTrades(userId)]);

    const needsJournal = goals.some((g) => usesJournal(g.metric, g.guardrails));
    const journaledDates = needsJournal ? await getJournaledDates(userId) : undefined;

    const result: GoalWithProgress[] = goals
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((goal) => ({ goal, progress: computeGoalProgress(goal, trades, { journaledDates }) }));

    return NextResponse.json({ success: true, goals: result });
  } catch (e) {
    console.error('Error listing trading goals:', e);
    return NextResponse.json({ success: false, error: 'Failed to load goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = (await request.json()) as CreateGoalRequest;
    const validationError = validateGoalInput(body);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const meta = GOAL_METRICS[body.metric];
    const now = new Date().toISOString();
    const goal: TradingGoal = {
      id: crypto.randomUUID(),
      userId,
      title: body.title.trim(),
      category: meta.category,
      metric: body.metric,
      target: body.target,
      direction: meta.direction,
      startDate: body.startDate,
      endDate: body.endDate,
      guardrails: normalizeGuardrails(body.guardrails),
      note: body.note?.trim() || undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await saveGoal(goal, userId);

    const trades = await getAllTrades(userId);
    const journaledDates = usesJournal(goal.metric, goal.guardrails)
      ? await getJournaledDates(userId)
      : undefined;
    const progress = computeGoalProgress(goal, trades, { journaledDates });

    return NextResponse.json({ success: true, goal, progress }, { status: 201 });
  } catch (e) {
    console.error('Error creating trading goal:', e);
    return NextResponse.json({ success: false, error: 'Failed to create goal' }, { status: 500 });
  }
}
