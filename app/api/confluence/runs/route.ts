/**
 * ConfluenceTrading agent runs API (owner-only).
 *
 * GET  /api/confluence/runs  — recent agent runs (observability), newest first.
 * POST /api/confluence/runs  — trigger a run now (manual cadence). Expires stale
 *                              proposals first, then screens the universe.
 *
 * Triggering a run only produces `pending` proposals — it never places orders.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getAllRuns } from '@/lib/db/confluence/agent-runs';
import { runAgent } from '@/lib/confluence/agent/runner';
import { expireStaleProposals } from '@/lib/confluence/agent/expiry';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const runs = await getAllRuns(userId);
  return NextResponse.json({ success: true, runs });
}

export async function POST(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const expired = await expireStaleProposals(userId);
    const run = await runAgent(userId, { cadence: 'manual' });
    return NextResponse.json({ success: true, run, expired }, { status: 201 });
  } catch (e) {
    console.error('Error running ConfluenceTrading agent:', e);
    return NextResponse.json({ success: false, error: 'Agent run failed' }, { status: 500 });
  }
}
