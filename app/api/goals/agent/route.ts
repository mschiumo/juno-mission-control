/**
 * Agent API for Collaborative goals.
 *
 * Lets a headless Claude agent (Claude Code, a scheduled routine, or an API
 * script) pull tasks the owner handed off and report progress back — without a
 * browser session. Authenticated by `Authorization: Bearer <AGENT_SECRET>`
 * (enforced in middleware.ts and re-checked here). All reads/writes are scoped
 * to the owner's collaborative goals only.
 *
 *   GET  /api/goals/agent?status=queued   → the agent's task queue
 *   POST /api/goals/agent                 → report progress on one task
 *        body: { goalId, status?, log?, addActionItems?: string[],
 *                completeActionItem?: id, phase?, by? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { getNowInEST } from '@/lib/date-utils';
import {
  Goal,
  GoalsData,
  ActionItem,
  AgentStatus,
  AgentLogEntry,
  Phase,
  goalsKey,
  applyPhase,
  AGENT_LOG_CAP,
} from '@/lib/goals/types';

export const dynamic = 'force-dynamic';

const EMPTY: GoalsData = { yearly: [], weekly: [], daily: [], collaborative: [] };
const AGENT_STATUSES: AgentStatus[] = ['queued', 'working', 'blocked', 'done'];
const PHASES: Phase[] = ['not-started', 'in-progress', 'achieved'];

function checkSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: 'Agent API not configured (set AGENT_SECRET)' }, { status: 503 });
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== secret) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  return null;
}

async function loadOwner(): Promise<{ userId: string; goals: GoalsData } | null> {
  const user = await getUserByEmail(OWNER_EMAIL);
  if (!user) return null;
  const redis = await getRedisClient();
  const raw = await redis.get(goalsKey(user.id));
  return { userId: user.id, goals: raw ? (JSON.parse(raw) as GoalsData) : EMPTY };
}

export async function GET(request: NextRequest) {
  const denied = checkSecret(request);
  if (denied) return denied;

  const loaded = await loadOwner();
  if (!loaded) return NextResponse.json({ success: false, error: 'Owner not found' }, { status: 404 });

  const statusFilter = new URL(request.url).searchParams.get('status');
  const tasks = loaded.goals.collaborative
    .filter((g) => g.assignee === 'agent' && (!statusFilter || g.agentStatus === statusFilter))
    .map((g) => ({
      id: g.id,
      title: g.title,
      notes: g.notes ?? '',
      phase: g.phase,
      agentStatus: g.agentStatus ?? 'queued',
      dueDate: g.dueDate,
      assignedAt: g.assignedAt,
      actionItems: (g.actionItems ?? []).map((i) => ({ id: i.id, text: i.text, status: i.status })),
    }));

  return NextResponse.json({ success: true, count: tasks.length, tasks, generatedAt: getNowInEST() });
}

export async function POST(request: NextRequest) {
  const denied = checkSecret(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const goalId = typeof body.goalId === 'string' ? body.goalId : undefined;
  if (!goalId) return NextResponse.json({ success: false, error: 'goalId required' }, { status: 400 });

  const loaded = await loadOwner();
  if (!loaded) return NextResponse.json({ success: false, error: 'Owner not found' }, { status: 404 });
  const { userId, goals } = loaded;

  const goal: Goal | undefined = goals.collaborative.find((g) => g.id === goalId);
  if (!goal) return NextResponse.json({ success: false, error: 'Collaborative goal not found' }, { status: 404 });
  if (goal.assignee !== 'agent') {
    return NextResponse.json({ success: false, error: 'Goal is not handed off to an agent' }, { status: 409 });
  }

  const nowEST = getNowInEST();
  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim() : 'claude';

  // Status (auto-advances phase for the common cases).
  const status = body.status as AgentStatus | undefined;
  if (status && AGENT_STATUSES.includes(status)) {
    goal.agentStatus = status;
    if (status === 'done') applyPhase(goal, 'achieved');
    else if (status === 'working' && goal.phase === 'not-started') applyPhase(goal, 'in-progress');
  }

  // Explicit phase override.
  const phase = body.phase as Phase | undefined;
  if (phase && PHASES.includes(phase)) applyPhase(goal, phase);

  // Add sub-tasks (milestones).
  if (Array.isArray(body.addActionItems)) {
    const items: ActionItem[] = goal.actionItems ?? [];
    for (const t of body.addActionItems) {
      if (typeof t === 'string' && t.trim()) items.push({ id: randomUUID(), text: t.trim(), status: 'pending', createdAt: nowEST });
    }
    goal.actionItems = items;
  }

  // Complete a sub-task.
  const completeId = typeof body.completeActionItem === 'string' ? body.completeActionItem : undefined;
  if (completeId && goal.actionItems) {
    goal.actionItems = goal.actionItems.map((i) => (i.id === completeId ? { ...i, status: 'completed' } : i));
  }

  // Append a progress-log line (capped).
  if (typeof body.log === 'string' && body.log.trim()) {
    const entry: AgentLogEntry = { at: nowEST, message: body.log.trim(), by };
    const arr = goal.agentLog ?? [];
    arr.push(entry);
    if (arr.length > AGENT_LOG_CAP) arr.splice(0, arr.length - AGENT_LOG_CAP);
    goal.agentLog = arr;
  }

  const redis = await getRedisClient();
  await redis.set(goalsKey(userId), JSON.stringify(goals));
  return NextResponse.json({ success: true, goal });
}
