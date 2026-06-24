import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireOwner } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST, getPeriodKey, type PeriodRecurrence } from '@/lib/date-utils';
import {
  Goal,
  GoalsData,
  Category,
  Phase,
  Recurrence,
  CATEGORIES,
  goalsKey,
  goalsHistoryKey,
  isValidCategory,
  applyPhase,
} from '@/lib/goals/types';

// Default goals structure — seeds a brand-new owner account.
const DEFAULT_GOALS: GoalsData = {
  yearly: [
    { id: 'y1', title: 'Generate steady self-generated income', phase: 'in-progress', category: 'yearly', source: 'mj' },
    { id: 'y2', title: 'Master physical health & fitness', phase: 'in-progress', category: 'yearly', source: 'mj' },
    { id: 'y3', title: 'Launch KeepLiving brand', phase: 'not-started', category: 'yearly', source: 'mj' },
    { id: 'y4', title: 'Move overseas successfully', phase: 'not-started', category: 'yearly', source: 'mj' },
  ],
  weekly: [
    { id: 'w1', title: 'Lift 4x this week', phase: 'in-progress', category: 'weekly', source: 'mj' },
    { id: 'w2', title: 'Run 5x this week', phase: 'in-progress', category: 'weekly', source: 'mj' },
    { id: 'w3', title: 'Trade daily with discipline', phase: 'in-progress', category: 'weekly', source: 'mj' },
    { id: 'w4', title: 'Publish 1 blog post', phase: 'not-started', category: 'weekly', source: 'mj' },
  ],
  daily: [
    { id: 'd1', title: 'Make bed', phase: 'achieved', category: 'daily', source: 'mj' },
    { id: 'd2', title: 'Take morning meds', phase: 'in-progress', category: 'daily', source: 'mj' },
    { id: 'd3', title: 'Read market brief', phase: 'not-started', category: 'daily', source: 'mj' },
    { id: 'd4', title: 'Exercise/Lift', phase: 'not-started', category: 'daily', source: 'mj' },
  ],
  collaborative: [],
};

type RedisClient = Awaited<ReturnType<typeof getRedisClient>>;

/**
 * Coerce stored JSON into a complete GoalsData and lazily fill bookkeeping.
 * Missing categories backfill to [] (NOT DEFAULT_GOALS — that would resurrect
 * deleted seed goals). Recurring goals without a lastPeriodKey are pinned to the
 * current period so the reset cron's first encounter sees no rollover.
 * Pure read-time normalization — the GET handler never writes this back.
 */
function normalizeGoals(raw: Partial<GoalsData> | null | undefined): GoalsData {
  const goals: GoalsData = {
    yearly: raw?.yearly ?? [],
    weekly: raw?.weekly ?? [],
    daily: raw?.daily ?? [],
    collaborative: raw?.collaborative ?? [],
  };
  for (const cat of CATEGORIES) {
    for (const g of goals[cat]) {
      if (g.recurrence && g.recurrence !== 'none' && !g.lastPeriodKey) {
        g.lastPeriodKey = getPeriodKey(g.recurrence as PeriodRecurrence);
      }
    }
  }
  return goals;
}

async function readGoals(redis: RedisClient, userId: string): Promise<GoalsData> {
  const stored = await redis.get(goalsKey(userId));
  if (stored) return normalizeGoals(JSON.parse(stored));
  return normalizeGoals(JSON.parse(JSON.stringify(DEFAULT_GOALS)));
}

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const goals = await readGoals(redis, userId);
    return NextResponse.json({ success: true, data: goals, timestamp: getNowInEST() });
  } catch (err) {
    // Redis unavailable — fall back to defaults so the UI still renders.
    console.error('Goals fetch error:', err);
    return NextResponse.json({ success: true, data: DEFAULT_GOALS, timestamp: getNowInEST() });
  }
}

// Update an existing goal (phase / notes / fields).
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();
    const { goalId, newPhase, category, notes, aiAssisted, actionItems, title, dueDate, priority, target, recurrence } = body;

    if (!goalId || !category) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidCategory(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const redis = await getRedisClient();
    const goals = await readGoals(redis, userId);

    const cat = category as Category;
    const goalIndex = goals[cat].findIndex((g) => g.id === goalId);
    if (goalIndex === -1) {
      return NextResponse.json({ success: false, error: 'Goal not found' }, { status: 404 });
    }
    const goal = goals[cat][goalIndex];

    if (newPhase) applyPhase(goal, newPhase as Phase);
    if (notes !== undefined) goal.notes = notes;
    if (aiAssisted !== undefined) goal.aiAssisted = aiAssisted;
    if (actionItems !== undefined) goal.actionItems = actionItems;
    if (title !== undefined) goal.title = title;
    if (dueDate !== undefined) goal.dueDate = dueDate || undefined;
    if (priority !== undefined) goal.priority = priority || undefined;
    if (target !== undefined) goal.target = target || undefined;

    if (recurrence !== undefined) {
      const prev: Recurrence = goal.recurrence ?? 'none';
      const next: Recurrence = recurrence || 'none';
      goal.recurrence = next === 'none' ? undefined : next;
      if (next !== 'none' && next !== prev) {
        // Newly enabled (or cadence changed): pin to current period, reset streak
        // run but preserve best, stamp the anchor.
        goal.lastPeriodKey = getPeriodKey(next as PeriodRecurrence);
        goal.recurrenceAnchor = getNowInEST();
        goal.streak = { current: 0, best: goal.streak?.best ?? 0 };
      } else if (next === 'none') {
        delete goal.lastPeriodKey;
      }
    }

    await redis.set(goalsKey(userId), JSON.stringify(goals));
    return NextResponse.json({ success: true, data: goals, timestamp: getNowInEST() });
  } catch (err) {
    console.error('Goal update error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update goal' }, { status: 500 });
  }
}

// Create a new goal.
export async function PUT(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();
    const { title, category, notes, phase, aiAssisted, actionItems, source, dueDate, priority, target, recurrence } = body;

    if (!title || !category) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidCategory(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const redis = await getRedisClient();
    const goals = await readGoals(redis, userId);

    // MJ-created goals stay in their category; AI/subagent goals are collaborative.
    const goalSource: Goal['source'] = source || 'mj';
    const finalCategory: Category = goalSource !== 'mj' ? 'collaborative' : (category as Category);

    const recur: Recurrence = recurrence && recurrence !== 'none' ? recurrence : 'none';
    const nowEST = getNowInEST();

    const newGoal: Goal = {
      id: randomUUID(),
      title,
      phase: phase || 'not-started',
      category: finalCategory,
      notes: notes || undefined,
      aiAssisted: aiAssisted || goalSource !== 'mj',
      actionItems: actionItems || undefined,
      source: goalSource,
      dueDate: dueDate || undefined,
      priority: priority || undefined,
      target: target || undefined,
      recurrence: recur === 'none' ? undefined : recur,
      createdAt: nowEST,
    };
    if (recur !== 'none') {
      newGoal.lastPeriodKey = getPeriodKey(recur as PeriodRecurrence);
      newGoal.recurrenceAnchor = nowEST;
      newGoal.streak = { current: 0, best: 0 };
    }
    if (newGoal.phase === 'achieved') newGoal.completedAt = nowEST;

    goals[finalCategory].push(newGoal);
    await redis.set(goalsKey(userId), JSON.stringify(goals));
    return NextResponse.json({ success: true, data: goals, timestamp: getNowInEST() });
  } catch (err) {
    console.error('Goal create error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create goal' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const category = searchParams.get('category');

    if (!goalId || !category) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidCategory(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const redis = await getRedisClient();
    const goals = await readGoals(redis, userId);

    goals[category as Category] = goals[category as Category].filter((g) => g.id !== goalId);
    await redis.set(goalsKey(userId), JSON.stringify(goals));

    // Drop any recurrence history for the deleted goal so it can't be orphaned.
    try {
      const historyRaw = await redis.get(goalsHistoryKey(userId));
      if (historyRaw) {
        const history = JSON.parse(historyRaw) as Record<string, unknown>;
        if (goalId in history) {
          delete history[goalId];
          await redis.set(goalsHistoryKey(userId), JSON.stringify(history));
        }
      }
    } catch (e) {
      console.error('Failed to clean goal history:', e);
    }

    return NextResponse.json({ success: true, data: goals, timestamp: getNowInEST() });
  } catch (err) {
    console.error('Goal delete error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete goal' }, { status: 500 });
  }
}

// Move a goal between categories, or reorder within a category.
export async function PATCH(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();
    const { goalId, fromCategory, toCategory, reorder, category, orderedIds } = body;

    const redis = await getRedisClient();
    const goals = await readGoals(redis, userId);

    // Reorder within a category.
    if (reorder && category && Array.isArray(orderedIds)) {
      if (!isValidCategory(category)) {
        return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
      }
      const cat = category as Category;
      goals[cat] = goals[cat].map((goal) => {
        const newIndex = orderedIds.indexOf(goal.id);
        return newIndex !== -1 ? { ...goal, order: newIndex } : goal;
      });
      goals[cat].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      await redis.set(goalsKey(userId), JSON.stringify(goals));
      return NextResponse.json({ success: true, data: goals, timestamp: getNowInEST() });
    }

    // Move between categories.
    if (!goalId || !fromCategory || !toCategory) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidCategory(fromCategory) || !isValidCategory(toCategory)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const from = fromCategory as Category;
    const to = toCategory as Category;
    const goalIndex = goals[from].findIndex((g) => g.id === goalId);
    if (goalIndex === -1) {
      return NextResponse.json({ success: false, error: 'Goal not found in source category' }, { status: 404 });
    }
    const [goal] = goals[from].splice(goalIndex, 1);
    goal.category = to;
    goals[to].push(goal);
    await redis.set(goalsKey(userId), JSON.stringify(goals));
    return NextResponse.json({ success: true, data: goals, timestamp: getNowInEST() });
  } catch (err) {
    console.error('Goal move/reorder error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update goals' }, { status: 500 });
  }
}
