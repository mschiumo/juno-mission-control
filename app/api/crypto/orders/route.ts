import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { listOrders } from '@/lib/db/crypto/collections';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const orders = await listOrders(userId);
  return NextResponse.json({ success: true, orders: orders.slice(0, 50) });
}
