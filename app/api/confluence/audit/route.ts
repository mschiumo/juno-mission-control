/**
 * ConfluenceTrading audit log (owner-only, read-only).
 *
 * GET /api/confluence/audit?limit=200 — newest-first immutable event trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getAuditLog } from '@/lib/db/confluence/audit';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const limitParam = Number(request.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

  const events = await getAuditLog(userId, limit);
  return NextResponse.json({ success: true, events });
}
