import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getRiskState, listAuditEvents } from '@/lib/db/crypto/collections';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const [events, risk] = await Promise.all([listAuditEvents(userId), getRiskState(userId)]);
  return NextResponse.json({ success: true, events: events.slice(0, 100), risk });
}
