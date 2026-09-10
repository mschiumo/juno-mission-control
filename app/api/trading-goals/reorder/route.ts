/**
 * Trading Goals API — arrangement
 *
 * PUT /api/trading-goals/reorder — persist a drag-and-drop arrangement.
 * Body: { ids: string[] } — goal ids in display order. Each goal's position
 * becomes its `sortOrder`; ids that aren't the caller's goals are ignored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { reorderGoals } from '@/lib/db/trading-goals';

const MAX_IDS = 500;

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireFeature('goals');
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string' && id.length > 0)) {
      return NextResponse.json({ success: false, error: 'ids must be a non-empty array of goal ids' }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ success: false, error: `At most ${MAX_IDS} ids per request` }, { status: 400 });
    }
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ success: false, error: 'ids must be unique' }, { status: 400 });
    }

    await reorderGoals(userId, ids as string[]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error reordering trading goals:', e);
    return NextResponse.json({ success: false, error: 'Failed to reorder goals' }, { status: 500 });
  }
}
