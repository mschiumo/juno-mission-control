/**
 * Trading Goals API — single goal
 *
 * PATCH  /api/trading-goals/:id  — edit fields, or archive/unarchive (status)
 * DELETE /api/trading-goals/:id  — delete a goal
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getAllTrades } from '@/lib/db/trades-v2';
import {
  getGoalById,
  updateGoal,
  deleteGoal,
  getJournaledDates,
} from '@/lib/db/trading-goals';
import { computeGoalProgress } from '@/lib/trading/goal-progress';
import {
  GOAL_METRICS,
  type TradingGoal,
  type GoalGuardrail,
  type UpdateGoalRequest,
} from '@/types/trading-goals';

type RouteParams = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const { id } = await params;
    const existing = await getGoalById(id, userId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Goal not found' }, { status: 404 });
    }

    const body = (await request.json()) as UpdateGoalRequest;
    const updates: Partial<TradingGoal> = {};

    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
    if (typeof body.target === 'number' && isFinite(body.target) && body.target >= 0) {
      updates.target = body.target;
    }
    if (isValidDate(body.startDate)) updates.startDate = body.startDate as string;
    if (isValidDate(body.endDate)) updates.endDate = body.endDate as string;
    if (body.note !== undefined) updates.note = body.note?.trim() || undefined;
    if (body.guardrails !== undefined) updates.guardrails = normalizeGuardrails(body.guardrails);
    if (body.status === 'active' || body.status === 'archived') {
      updates.status = body.status;
      updates.archivedAt = body.status === 'archived' ? new Date().toISOString() : undefined;
    }

    const startDate = updates.startDate ?? existing.startDate;
    const endDate = updates.endDate ?? existing.endDate;
    if (endDate < startDate) {
      return NextResponse.json(
        { success: false, error: 'End date must be on or after the start date' },
        { status: 400 },
      );
    }

    const updated = await updateGoal(id, updates, userId);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Goal not found' }, { status: 404 });
    }

    const trades = await getAllTrades(userId);
    const needsJournal =
      updated.metric === 'journal_consistency' ||
      (updated.guardrails || []).some((g) => g.metric === 'journal_consistency');
    const journaledDates = needsJournal ? await getJournaledDates(userId) : undefined;
    const progress = computeGoalProgress(updated, trades, { journaledDates });

    return NextResponse.json({ success: true, goal: updated, progress });
  } catch (e) {
    console.error('Error updating trading goal:', e);
    return NextResponse.json({ success: false, error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const { id } = await params;
    const ok = await deleteGoal(id, userId);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Goal not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error deleting trading goal:', e);
    return NextResponse.json({ success: false, error: 'Failed to delete goal' }, { status: 500 });
  }
}
