/**
 * ConfluenceTrading system_state API (owner-only).
 *
 * GET /api/confluence/system — current control state (kill switch, paper mode,
 *                              pinned agentic account, exposure caps).
 * PUT /api/confluence/system — update state; emits killswitch.* / paper_mode.changed
 *                              audit events for the safety-critical toggles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getSystemState, updateSystemState } from '@/lib/db/confluence/system-state';
import { appendAudit } from '@/lib/db/confluence/audit';
import { isLiveAllowed } from '@/lib/confluence/broker';
import type { SystemState } from '@/types/confluence';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const state = await getSystemState(userId);
  return NextResponse.json({ success: true, state });
}

function coerceCap(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;

  try {
    const body = (await request.json()) as Partial<SystemState>;
    const current = await getSystemState(userId);

    const updates: Partial<Omit<SystemState, 'updatedAt'>> = {};
    if (typeof body.tradingEnabled === 'boolean') updates.tradingEnabled = body.tradingEnabled;
    if (typeof body.paperMode === 'boolean') updates.paperMode = body.paperMode;
    if (typeof body.autoTakeProfit === 'boolean') updates.autoTakeProfit = body.autoTakeProfit;
    if (typeof body.agenticAccount === 'string') updates.agenticAccount = body.agenticAccount.trim() || undefined;
    if (body.perPositionCapUsd !== undefined) {
      updates.perPositionCapUsd = coerceCap(body.perPositionCapUsd, current.perPositionCapUsd);
    }
    if (body.entryOrderMaxAgeDays !== undefined) {
      // 0 is not allowed — that would cancel entries the moment they're placed.
      const days = coerceCap(body.entryOrderMaxAgeDays, current.entryOrderMaxAgeDays);
      updates.entryOrderMaxAgeDays = days > 0 ? Math.floor(days) : current.entryOrderMaxAgeDays;
    }
    if (body.totalExposureCapUsd !== undefined) {
      updates.totalExposureCapUsd = coerceCap(body.totalExposureCapUsd, current.totalExposureCapUsd);
    }

    // Refuse to enter live mode unless it's armed at the server AND an agentic
    // account is pinned (invariant 4 + the deploy-level live gate).
    const nextPaper = updates.paperMode ?? current.paperMode;
    const nextAccount = updates.agenticAccount ?? current.agenticAccount;
    if (nextPaper === false) {
      if (!isLiveAllowed()) {
        return NextResponse.json(
          { success: false, error: 'Live execution is disabled on the server (set CONFLUENCE_ALLOW_LIVE=true).' },
          { status: 422 },
        );
      }
      if (!nextAccount) {
        return NextResponse.json(
          { success: false, error: 'Cannot switch to live mode without a pinned agentic account number.' },
          { status: 422 },
        );
      }
    }

    const next = await updateSystemState(userId, updates, email);

    // Audit the safety-critical toggles (canonical event vocabulary).
    if (updates.tradingEnabled !== undefined && updates.tradingEnabled !== current.tradingEnabled) {
      await appendAudit(userId, {
        actor: 'user',
        actorId: email,
        eventType: next.tradingEnabled ? 'killswitch.deactivated' : 'killswitch.activated',
        entityType: 'system',
        before: { tradingEnabled: current.tradingEnabled },
        after: { tradingEnabled: next.tradingEnabled },
        note: next.tradingEnabled ? 'Execution armed' : 'Kill switch engaged — execution disarmed',
      });
    }
    if (updates.paperMode !== undefined && updates.paperMode !== current.paperMode) {
      await appendAudit(userId, {
        actor: 'user',
        actorId: email,
        eventType: 'paper_mode.changed',
        entityType: 'system',
        before: { paperMode: current.paperMode },
        after: { paperMode: next.paperMode },
        note: `Paper mode ${next.paperMode ? 'ON' : 'OFF (LIVE)'}`,
      });
    }

    return NextResponse.json({ success: true, state: next });
  } catch (e) {
    console.error('Error updating ConfluenceTrading system state:', e);
    return NextResponse.json({ success: false, error: 'Failed to update system state' }, { status: 500 });
  }
}
