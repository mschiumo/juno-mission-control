/**
 * ConfluenceTrading settings API (owner-only).
 *
 * GET /api/confluence/settings — current settings (caps, mode, kill switch)
 * PUT /api/confluence/settings — update settings; also records mode / kill-switch
 *                                changes in the audit log.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getSettings, updateSettings } from '@/lib/db/confluence/settings';
import { appendAudit } from '@/lib/db/confluence/audit';
import type { ConfluenceSettings } from '@/types/confluence';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const settings = await getSettings(userId);
  return NextResponse.json({ success: true, settings });
}

function coerceCap(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = (await request.json()) as Partial<ConfluenceSettings>;
    const current = await getSettings(userId);

    const updates: Partial<Omit<ConfluenceSettings, 'userId' | 'updatedAt'>> = {};
    if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
    if (typeof body.killSwitch === 'boolean') updates.killSwitch = body.killSwitch;
    if (body.mode === 'paper' || body.mode === 'live') updates.mode = body.mode;
    if (body.perPositionCapUsd !== undefined) {
      updates.perPositionCapUsd = coerceCap(body.perPositionCapUsd, current.perPositionCapUsd);
    }
    if (body.totalExposureCapUsd !== undefined) {
      updates.totalExposureCapUsd = coerceCap(body.totalExposureCapUsd, current.totalExposureCapUsd);
    }

    const next = await updateSettings(userId, updates);

    // Audit the safety-critical toggles explicitly.
    if (updates.killSwitch !== undefined && updates.killSwitch !== current.killSwitch) {
      await appendAudit(userId, {
        actor: 'user',
        type: 'kill_switch',
        summary: `Kill switch ${next.killSwitch ? 'ENGAGED' : 'released'}`,
      });
    }
    if (updates.mode !== undefined && updates.mode !== current.mode) {
      await appendAudit(userId, {
        actor: 'user',
        type: 'mode_changed',
        summary: `Execution mode changed ${current.mode} → ${next.mode}`,
      });
    }
    const capsChanged =
      updates.perPositionCapUsd !== undefined || updates.totalExposureCapUsd !== undefined;
    if (capsChanged) {
      await appendAudit(userId, {
        actor: 'user',
        type: 'settings_changed',
        summary: `Caps updated: per-position $${next.perPositionCapUsd}, total $${next.totalExposureCapUsd}`,
      });
    }

    return NextResponse.json({ success: true, settings: next });
  } catch (e) {
    console.error('Error updating ConfluenceTrading settings:', e);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
