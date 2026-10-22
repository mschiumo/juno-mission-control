/**
 * Owner-triggered order reconciliation (see lib/confluence/reconcile.ts).
 *
 * Heals app↔broker desyncs — orphaned `failed`/`staged` records whose orders
 * actually exist at Robinhood. READ-ONLY at the broker: links and re-polls,
 * never places or cancels. Also mirrors shares sold outside the app (see
 * lib/confluence/external-exits.ts), which may cancel app exits left working
 * on a position the broker no longer holds. The 30-min poll cron runs both.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { reconcileOrders } from '@/lib/confluence/reconcile';
import { syncExternalExits } from '@/lib/confluence/external-exits';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const result = await reconcileOrders(userId);
    const externalExits = await syncExternalExits(userId);
    return NextResponse.json({ success: true, ...result, externalExits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconcile failed';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
