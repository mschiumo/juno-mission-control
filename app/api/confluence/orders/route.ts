/**
 * ConfluenceTrading orders API (owner-only).
 *
 * GET /api/confluence/orders            — list all orders (newest first)
 * GET /api/confluence/orders?refresh=1  — poll every non-terminal order's broker
 *                                          status first, then return the list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getAllOrders, getOpenOrders } from '@/lib/db/confluence/orders';
import { refreshOrderStatus } from '@/lib/confluence/execution';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  if (request.nextUrl.searchParams.get('refresh') === '1') {
    const open = await getOpenOrders(userId);
    // Poll sequentially — the count is tiny and this keeps Redis writes ordered.
    for (const o of open) {
      await refreshOrderStatus(o.id, userId);
    }
  }

  const orders = await getAllOrders(userId);
  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ success: true, orders });
}
