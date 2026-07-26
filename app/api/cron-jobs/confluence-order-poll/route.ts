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
 *   3. Take-profit completion: when a held position trades at/through the
 *      target the human approved at entry, place a GTC LIMIT exit at the
 *      target (fills at target or better) via execution.placeTakeProfit —
 *      deterministic completion of the approved plan, exit-only.
 *
 * PLACES NO ENTRIES — refresh, exit completion, and expiry only. When the
 * bots acted (fills, take-profits, expiries), an execution report email goes
 * to the owner.
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts.
 */

import { NextResponse } from 'next/server';
import React from 'react';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { postToCronResults } from '@/lib/cron-helpers';
import { getActiveOrders, getAllOrders } from '@/lib/db/confluence/orders';
import { appendAudit } from '@/lib/db/confluence/audit';
import { getRedisClient } from '@/lib/redis';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { cancelOrder, placeTakeProfit, refreshOrderStatus } from '@/lib/confluence/execution';
import { reconcileOrders } from '@/lib/confluence/reconcile';
import { sendEmail } from '@/lib/email';
import {
  ConfluenceExecutionEmail,
  type ExecutionEmailEvent,
} from '@/lib/emails/ConfluenceExecutionEmail';
import type { ExecutionOrder, SystemState } from '@/types/confluence';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  entry: 'entry',
  protective_stop: 'protective stop',
  take_profit: 'take-profit',
};

function kindLabel(o: ExecutionOrder): string {
  return KIND_LABEL[o.kind ?? 'entry'] ?? 'order';
}

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
    const emailEvents: ExecutionEmailEvent[] = [];
    try {
      const rec = await reconcileOrders(userId);
      for (const l of rec.linked) events.push(`reconciled ${l}`);
      for (const c of rec.corrected) events.push(`corrected ${c}`);
    } catch (err) {
      events.push(`reconcile failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    const state = await getSystemState(userId);
    const maxAgeMs = state.entryOrderMaxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let refreshed = 0;
    let expired = 0;

    const active = await getActiveOrders(userId);
    for (const order of active) {
      const before = order.status;
      const beforeFilled = order.filledQuantity;
      const latest = await refreshOrderStatus(order.id, userId);
      refreshed++;
      if (latest && (latest.status !== before || latest.filledQuantity !== beforeFilled)) {
        events.push(`${latest.symbol} ${latest.kind ?? 'entry'} → ${latest.status}`);
        // Executions (full or growing partial fills) go in the owner report.
        if (latest.filledQuantity > beforeFilled) {
          emailEvents.push({
            tone: 'fill',
            headline: `${latest.symbol} ${kindLabel(latest)} ${latest.status === 'filled' ? 'FILLED' : 'partially filled'}`,
            detail:
              `${latest.side === 'buy' ? 'Bought' : 'Sold'} ${latest.filledQuantity}/${latest.quantity}` +
              `${latest.avgFillPrice != null ? ` @ $${latest.avgFillPrice}` : ''}` +
              ` (${latest.isPaper ? 'paper' : 'live'})`,
          });
        }
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
        emailEvents.push({
          tone: 'action',
          headline: `${order.symbol} entry auto-expired`,
          detail: `Unfilled after ${state.entryOrderMaxAgeDays} days — resting limit cancelled.`,
        });
      }
    }

    // ── Take-profit completion: held positions trading at/through the
    // APPROVED target (from the filled entry) get their limit exit placed.
    try {
      const tp = await processTakeProfits(userId, state);
      events.push(...tp.lines);
      emailEvents.push(...tp.emailEvents);
    } catch {
      /* advisory — never fails the poll */
    }

    // ── Owner report: the bots acted (or tried to) without a human present.
    if (emailEvents.length > 0 && owner.email) {
      const generatedAt = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      const fills = emailEvents.filter((e) => e.tone === 'fill').length;
      const warns = emailEvents.filter((e) => e.tone === 'warn').length;
      const subject =
        warns > 0
          ? `⚠️ Confluence bot report: action needed (${emailEvents.length} events)`
          : fills > 0
            ? `⚡ Confluence bot report: ${fills} order${fills === 1 ? '' : 's'} executed`
            : `Confluence bot report: ${emailEvents.length} event${emailEvents.length === 1 ? '' : 's'}`;
      try {
        await sendEmail({
          to: owner.email,
          subject,
          react: React.createElement(ConfluenceExecutionEmail, {
            generatedAt: `${generatedAt} ET`,
            events: emailEvents,
            paperMode: state.paperMode,
          }),
        });
      } catch (err) {
        events.push(`report email failed: ${err instanceof Error ? err.message : 'unknown'}`);
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

/**
 * Place take-profit exits for held positions trading at/through the approved
 * target. Quotes are read once per poll; placeTakeProfit's pure guard makes
 * re-invocation idempotent (an existing working take-profit blocks, a FAILED
 * one is retried next poll). The one-time Redis flag only throttles the
 * "target reached" notification, never the placement itself.
 */
async function processTakeProfits(
  userId: string,
  state: SystemState,
): Promise<{ lines: string[]; emailEvents: ExecutionEmailEvent[] }> {
  const lines: string[] = [];
  const emailEvents: ExecutionEmailEvent[] = [];
  if (!isRobinhoodConfigured()) return { lines, emailEvents };
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
  if (watch.length === 0) return { lines, emailEvents };

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
  for (const entry of watch) {
    const price = last.get(entry.symbol.toUpperCase());
    if (price == null || price < entry.targetPrice!) continue;

    // One-time "target reached" note per entry (notification only — the
    // placement below is governed by the pure guard, not this flag).
    const flagKey = `confluence:target-notified:${userId}:${entry.id}`;
    const first = await redis.set(flagKey, '1', { NX: true, EX: 14 * 24 * 60 * 60 });
    if (first === 'OK') {
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'position.target_reached',
        entityType: 'order',
        entityId: entry.id,
        after: { symbol: entry.symbol, lastPrice: price, targetPrice: entry.targetPrice },
        note: `🎯 ${entry.symbol} reached its approved target: last $${price} ≥ target $${entry.targetPrice}. Placing the take-profit limit at the target.`,
      });
      lines.push(`🎯 ${entry.symbol} AT TARGET ($${price} ≥ $${entry.targetPrice})`);
    }

    const result = await placeTakeProfit(entry.id, price, userId);
    if (result.ok) {
      lines.push(`take-profit placed: ${entry.symbol} ${result.order?.quantity} limit $${entry.targetPrice}`);
      emailEvents.push({
        tone: 'action',
        headline: `🎯 ${entry.symbol} take-profit placed at target`,
        detail: `Last $${price} reached target $${entry.targetPrice} — sell ${result.order?.quantity} limit $${entry.targetPrice} GTC (${entry.isPaper ? 'paper' : 'live'}). Protective stop cancelled to free the shares.`,
      });
    } else if (result.code === 'failed' || result.code === 'stop_not_cancelled') {
      lines.push(`take-profit ${result.code}: ${entry.symbol} (${result.reason})`);
      emailEvents.push({
        tone: 'warn',
        headline: `${entry.symbol} take-profit ${result.code === 'failed' ? 'FAILED' : 'stood down'}`,
        detail: result.reason,
      });
    } else if (result.code === 'kill_switch' && first === 'OK') {
      // Disarmed system: surface it in the first at-target report only — the
      // audit throttle inside placeTakeProfit handles the ongoing reminders.
      emailEvents.push({
        tone: 'warn',
        headline: `${entry.symbol} AT TARGET but trading is disarmed`,
        detail: `Take-profit NOT placed. Arm execution in Agents → Settings to lock in the profit.`,
      });
    }
  }
  return { lines, emailEvents };
}
