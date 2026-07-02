/**
 * Poll a single order's broker status (owner-only).
 *
 * POST /api/confluence/orders/:id/refresh
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { refreshOrderStatus } from '@/lib/confluence/execution';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const order = await refreshOrderStatus(id, userId);
  if (!order) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, order });
}
