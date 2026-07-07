/**
 * Market-hours order poll (every 30 min, weekdays) — keeps the app's order
 * ledger reconciled with the broker without anyone clicking refresh:
 *
 *   1. Refresh every active order against the broker. Fill detection here is
 *      what chains the protective stop (see execution.placeProtectiveStop) —
 *      this cron is why a fill gets its stop within ~30 minutes.
 *   2. Auto-cancel unfilled ENTRY orders older than system_state's
 *      entryOrderMaxAgeDays — a resting swing limit must not outlive the
 *      setup that justified it. Protective stops are NEVER auto-cancelled
 *      (they guard a live position). A cancel that reveals a partial fill
 *      still chains a stop for the held shares (see execution.cancelOrder).
 *
 * PLACES NO ENTRIES — refresh, protective completion, and expiry only.
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts.
 */

import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { postToCronResults } from '@/lib/cron-helpers';
import { getActiveOrders } from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { cancelOrder, refreshOrderStatus } from '@/lib/confluence/execution';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Owner account not found' }, { status: 404 });
    }
    const userId = owner.id;

    const active = await getActiveOrders(userId);
    if (active.length === 0) {
      return NextResponse.json({ success: true, refreshed: 0, note: 'no active orders' });
    }

    const state = await getSystemState(userId);
    const maxAgeMs = state.entryOrderMaxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const events: string[] = [];
    let refreshed = 0;
    let expired = 0;

    for (const order of active) {
      const before = order.status;
      const beforeFilled = order.filledQuantity;
      const latest = await refreshOrderStatus(order.id, userId);
      refreshed++;
      if (latest && (latest.status !== before || latest.filledQuantity !== beforeFilled)) {
        events.push(`${latest.symbol} ${latest.kind ?? 'entry'} → ${latest.status}`);
      }

      // Expiry applies to entries that are still working after the refresh.
      const isEntry = (latest?.kind ?? 'entry') === 'entry';
      const stillActive = latest && !['filled', 'cancelled', 'rejected', 'failed'].includes(latest.status);
      const age = now - new Date(order.createdAt).getTime();
      if (isEntry && stillActive && age > maxAgeMs) {
        const cancelled = await cancelOrder(order.id, 'system:auto-expiry', userId);
        expired++;
        events.push(
          `${order.symbol} entry auto-expired after ${state.entryOrderMaxAgeDays}d (unfilled ${cancelled?.status ?? 'cancel requested'})`,
        );
      }
    }

    if (events.length > 0) {
      await postToCronResults('confluence-order-poll', `Order poll: ${events.join('; ')}`, 'review');
    }
    return NextResponse.json({ success: true, refreshed, expired, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order poll failed';
    await postToCronResults('confluence-order-poll', `Order poll FAILED: ${message}`, 'error');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
