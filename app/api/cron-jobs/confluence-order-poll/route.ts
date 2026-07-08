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
import { getActiveOrders, getAllOrders } from '@/lib/db/confluence/orders';
import { appendAudit } from '@/lib/db/confluence/audit';
import { getRedisClient } from '@/lib/redis';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { cancelOrder, refreshOrderStatus } from '@/lib/confluence/execution';
import { reconcileOrders } from '@/lib/confluence/reconcile';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Owner account not found' }, { status: 404 });
    }
    const userId = owner.id;

    // Heal desyncs first (orphaned failed/staged records that exist at the
    // broker) so the refresh pass below can poll them like any other order.
    // Cheap no-op when nothing is desynced; never throws the poll over.
    const events: string[] = [];
    try {
      const rec = await reconcileOrders(userId);
      for (const l of rec.linked) events.push(`reconciled ${l}`);
      for (const c of rec.corrected) events.push(`corrected ${c}`);
    } catch (err) {
      events.push(`reconcile failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    const active = await getActiveOrders(userId);
    if (active.length === 0 && events.length === 0) {
      return NextResponse.json({ success: true, refreshed: 0, note: 'no active orders' });
    }

    const state = await getSystemState(userId);
    const maxAgeMs = state.entryOrderMaxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

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

    // ── Take-profit watch: flag held positions trading at/above the APPROVED
    // target (from the filled entry). Notification only — nothing is sold;
    // the sell stays a human decision. One notification per entry order.
    try {
      const notified = await checkTargetsReached(userId);
      events.push(...notified);
    } catch {
      /* advisory — never fails the poll */
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


/**
 * One-time "target reached" notifications for held positions. Compares live
 * quotes (read-only) against the target approved on each filled entry; the
 * Redis flag makes each entry notify exactly once. Nothing is sold here.
 */
async function checkTargetsReached(userId: string): Promise<string[]> {
  if (!isRobinhoodConfigured()) return [];
  const all = await getAllOrders(userId);

  // Net held shares per symbol from the fill log.
  const net = new Map<string, number>();
  for (const o of all) {
    if (!(o.filledQuantity > 0)) continue;
    const sign = o.side === 'buy' ? 1 : -1;
    net.set(o.symbol.toUpperCase(), (net.get(o.symbol.toUpperCase()) ?? 0) + sign * o.filledQuantity);
  }

  // Filled entries with an approved target on a still-held symbol.
  const watch = all.filter(
    (o) =>
      (o.kind ?? 'entry') === 'entry' &&
      o.filledQuantity > 0 &&
      typeof o.targetPrice === 'number' &&
      (net.get(o.symbol.toUpperCase()) ?? 0) > 0,
  );
  if (watch.length === 0) return [];

  const symbols = [...new Set(watch.map((o) => o.symbol.toUpperCase()))].slice(0, 20);
  const q = await callRobinhoodTool<{
    data?: { results?: { quote?: { symbol?: string; last_trade_price?: string } }[] };
  }>('get_equity_quotes', { symbols }, { retries: 2 });
  const last = new Map<string, number>();
  for (const entry of q?.data?.results ?? []) {
    const sym = entry.quote?.symbol?.toUpperCase();
    const price = Number(entry.quote?.last_trade_price);
    if (sym && Number.isFinite(price)) last.set(sym, price);
  }

  const redis = await getRedisClient();
  const out: string[] = [];
  for (const entry of watch) {
    const price = last.get(entry.symbol.toUpperCase());
    if (price == null || price < entry.targetPrice!) continue;
    const flagKey = `confluence:target-notified:${userId}:${entry.id}`;
    const first = await redis.set(flagKey, '1', { NX: true, EX: 14 * 24 * 60 * 60 });
    if (first !== 'OK') continue; // already notified
    await appendAudit(userId, {
      actor: 'system',
      actorId: 'system',
      eventType: 'position.target_reached',
      entityType: 'order',
      entityId: entry.id,
      after: { symbol: entry.symbol, lastPrice: price, targetPrice: entry.targetPrice },
      note: `🎯 ${entry.symbol} reached its approved target: last $${price} ≥ target $${entry.targetPrice}. Take-profit is your call — sell via a manual sell proposal or in the Robinhood app (the protective stop stays working).`,
    });
    out.push(`🎯 ${entry.symbol} AT TARGET ($${price} ≥ $${entry.targetPrice})`);
  }
  return out;
}
