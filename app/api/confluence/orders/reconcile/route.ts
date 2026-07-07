/**
 * Owner-triggered order reconciliation (see lib/confluence/reconcile.ts).
 *
 * Heals app↔broker desyncs — orphaned `failed`/`staged` records whose orders
 * actually exist at Robinhood. READ-ONLY at the broker: links and re-polls,
 * never places or cancels. The 30-min poll cron also runs this automatically.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { reconcileOrders } from '@/lib/confluence/reconcile';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const result = await reconcileOrders(userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconcile failed';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
