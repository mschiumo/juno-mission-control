/**
 * Synthetic OCO — automatic take-profit at the HUMAN-APPROVED target.
 *
 * A true bracket (stop + target-sell resting together) needs OCO orders,
 * which the broker MCP doesn't offer — and a cash account rejects two open
 * sells for the same shares. So this engine emulates OCO in the 30-minute
 * poll with an explicit, hysteresis-bounded state machine:
 *
 *   AT TARGET  (last ≥ target):        cancel the protective stop, place a
 *                                      GTC limit sell AT the target.
 *   RETREATED  (last ≤ target×0.995,   cancel the unfilled take-profit,
 *               take-profit not filled): restore the protective stop for the
 *                                      remaining shares.
 *   IN BETWEEN (0.995×target..target): leave everything as-is (hysteresis —
 *                                      no flapping between states).
 *
 * ⚠️ DISCLOSED TRADEOFF: between the stop's cancellation and any restore,
 * the position has a working sell limit but NO stop underneath — bounded by
 * one poll cycle (≤30 min in market hours). The feature ships OFF and is an
 * explicit Settings opt-in (system_state.autoTakeProfit).
 *
 * Every action is deterministic completion of the plan the human approved
 * (entry, stop, AND target came through the approve route), only ever
 * reduces exposure, and respects the kill switch absolutely: a disarmed
 * system neither cancels nor places anything — positions keep their stops.
 */

import { appendAudit } from '@/lib/db/confluence/audit';
import { getAllOrders, getActiveOrders, saveOrder, transitionOrder } from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getRedisClient } from '@/lib/redis';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';
import { getBrokerAdapter } from './broker';
import { cancelOrder, placeProtectiveStop } from './execution';
import { oppositeSide } from './protective-stop';
import type { ExecutionOrder, SystemState } from '@/types/confluence';
import { isTerminalOrderStatus } from '@/types/confluence';

/** Restore hysteresis: retreat this far below target before re-arming the stop. */
export const TP_RETREAT_FRACTION = 0.995;

export interface OcoAction {
  kind: 'switch_to_take_profit' | 'restore_stop';
  entryOrderId: string;
  symbol: string;
  /** switch: the working protective stop to cancel. */
  stopOrderId?: string;
  /** restore: the unfilled take-profit to cancel. */
  takeProfitOrderId?: string;
  /** Shares involved (remaining unfilled shares on a restore). */
  quantity: number;
  targetPrice: number;
}

export interface OcoSnapshot {
  /** Filled entries with an approved target (kind entry, filledQuantity > 0). */
  entries: ExecutionOrder[];
  /** ACTIVE protective stops, by protectsOrderId. */
  activeStops: Map<string, ExecutionOrder>;
  /** Take-profit orders (any status), by protectsOrderId. */
  takeProfits: Map<string, ExecutionOrder[]>;
  /** Live last price per symbol (uppercase). */
  lastPrices: Map<string, number>;
}

/**
 * Pure planner — decides the OCO transitions for one poll tick. No I/O, no
 * side effects; unit-tested against every state of the machine.
 */
export function planOcoActions(snap: OcoSnapshot): OcoAction[] {
  const actions: OcoAction[] = [];
  for (const entry of snap.entries) {
    const target = entry.targetPrice;
    if (!(typeof target === 'number' && target > 0)) continue;
    const last = snap.lastPrices.get(entry.symbol.toUpperCase());
    if (last == null) continue;

    const tps = snap.takeProfits.get(entry.id) ?? [];
    const activeTp = tps.find((o) => !isTerminalOrderStatus(o.status));
    const stop = snap.activeStops.get(entry.id);

    if (activeTp) {
      // Phase B — an unfilled take-profit is working. Restore the stop only
      // on a real retreat (hysteresis); otherwise leave it to fill.
      const remaining = activeTp.quantity - activeTp.filledQuantity;
      if (last <= target * TP_RETREAT_FRACTION && remaining > 0) {
        actions.push({
          kind: 'restore_stop',
          entryOrderId: entry.id,
          symbol: entry.symbol,
          takeProfitOrderId: activeTp.id,
          quantity: remaining,
          targetPrice: target,
        });
      }
      continue;
    }

    // Phase A — no take-profit working: switch when the target is reached.
    // Requires a working protective stop to swap out (a NO-STOP position is
    // a disarmed-at-fill anomaly the owner must resolve first — the engine
    // never places a sell for shares it can't account for).
    if (stop && last >= target) {
      actions.push({
        kind: 'switch_to_take_profit',
        entryOrderId: entry.id,
        symbol: entry.symbol,
        stopOrderId: stop.id,
        quantity: stop.quantity - stop.filledQuantity,
        targetPrice: target,
      });
    }
  }
  return actions;
}

/** Build the snapshot from the order log + live quotes (read-only). */
async function buildSnapshot(userId: string): Promise<OcoSnapshot | null> {
  const all = await getAllOrders(userId);

  // Net held shares per symbol — the engine only manages symbols still held.
  const net = new Map<string, number>();
  for (const o of all) {
    if (!(o.filledQuantity > 0)) continue;
    const sym = o.symbol.toUpperCase();
    net.set(sym, (net.get(sym) ?? 0) + (o.side === 'buy' ? 1 : -1) * o.filledQuantity);
  }

  const entries = all.filter(
    (o) =>
      (o.kind ?? 'entry') === 'entry' &&
      o.filledQuantity > 0 &&
      typeof o.targetPrice === 'number' &&
      (net.get(o.symbol.toUpperCase()) ?? 0) > 0,
  );
  if (entries.length === 0) return null;

  const active = await getActiveOrders(userId);
  const activeStops = new Map<string, ExecutionOrder>();
  for (const o of active) {
    if (o.kind === 'protective_stop' && o.protectsOrderId) activeStops.set(o.protectsOrderId, o);
  }
  const takeProfits = new Map<string, ExecutionOrder[]>();
  for (const o of all) {
    if (o.kind === 'take_profit' && o.protectsOrderId) {
      takeProfits.set(o.protectsOrderId, [...(takeProfits.get(o.protectsOrderId) ?? []), o]);
    }
  }

  const symbols = [...new Set(entries.map((o) => o.symbol.toUpperCase()))].slice(0, 20);
  const q = await callRobinhoodTool<{
    data?: { results?: { quote?: { symbol?: string; last_trade_price?: string } }[] };
  }>('get_equity_quotes', { symbols }, { retries: 2 });
  const lastPrices = new Map<string, number>();
  for (const entry of q?.data?.results ?? []) {
    const sym = entry.quote?.symbol?.toUpperCase();
    const price = Number(entry.quote?.last_trade_price);
    if (sym && Number.isFinite(price)) lastPrices.set(sym, price);
  }

  return { entries, activeStops, takeProfits, lastPrices };
}

/**
 * Run one OCO tick for the user. No-ops unless system_state.autoTakeProfit
 * is enabled AND trading is armed. Returns human-readable event lines for
 * the cron summary.
 */
export async function runTakeProfitEngine(userId: string): Promise<string[]> {
  const state = await getSystemState(userId);
  if (!state.autoTakeProfit) return [];
  if (!state.tradingEnabled) return []; // kill switch is absolute — touch nothing
  if (!state.paperMode && !isRobinhoodConfigured()) return [];

  const snap = await buildSnapshot(userId);
  if (!snap) return [];
  const actions = planOcoActions(snap);
  const events: string[] = [];

  for (const action of actions) {
    // Serialize per entry — the same lock namespace guards manual refreshes.
    const redis = await getRedisClient();
    const lockKey = `confluence:oco-lock:${userId}:${action.entryOrderId}`;
    const acquired = await redis.set(lockKey, '1', { NX: true, EX: 60 });
    if (acquired !== 'OK') continue;
    try {
      if (action.kind === 'switch_to_take_profit') {
        events.push(await switchToTakeProfit(action, state, userId));
      } else {
        events.push(await restoreStop(action, userId));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      events.push(`OCO ${action.kind} FAILED for ${action.symbol}: ${message}`);
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  }
  return events;
}

/** Phase A: cancel the stop, place the GTC limit sell at the approved target. */
async function switchToTakeProfit(action: OcoAction, state: SystemState, userId: string): Promise<string> {
  // 1. Cancel the protective stop (audited by cancelOrder).
  await cancelOrder(action.stopOrderId!, 'system:oco', userId);

  // 2. Stage + place the take-profit limit sell.
  const all = await getAllOrders(userId);
  const entry = all.find((o) => o.id === action.entryOrderId)!;
  const now = new Date().toISOString();
  const staged: ExecutionOrder = {
    id: crypto.randomUUID(),
    proposalId: entry.proposalId,
    createdAt: now,
    updatedAt: now,
    symbol: entry.symbol,
    accountNumber: entry.accountNumber,
    side: oppositeSide(entry.side),
    type: 'limit',
    kind: 'take_profit',
    protectsOrderId: entry.id,
    limitPrice: action.targetPrice,
    quantity: action.quantity,
    timeInForce: 'gtc',
    refId: crypto.randomUUID(),
    status: 'staged',
    filledQuantity: 0,
    isPaper: entry.isPaper,
    history: [{ status: 'staged', ts: now }],
  };
  await saveOrder(staged, userId);

  const adapter = getBrokerAdapter(entry.isPaper);
  const brokerState = await adapter.placeLimitOrder({
    orderId: staged.id,
    refId: staged.refId,
    accountNumber: entry.accountNumber,
    symbol: entry.symbol,
    side: staged.side,
    limitPrice: action.targetPrice,
    quantity: action.quantity,
    timeInForce: 'gtc',
  });
  await transitionOrder(staged.id, userId, {
    status: brokerState.status,
    filledQuantity: brokerState.filledQuantity,
    avgFillPrice: brokerState.avgFillPrice,
    brokerOrderId: brokerState.brokerOrderId,
    lastError: brokerState.error,
    detail: `take-profit via ${adapter.name} (synthetic OCO)`,
  });
  await appendAudit(userId, {
    actor: 'system',
    actorId: 'system:oco',
    eventType: 'order.take_profit_placed',
    entityType: 'order',
    entityId: staged.id,
    after: { entryOrderId: entry.id, targetPrice: action.targetPrice, quantity: action.quantity, status: brokerState.status },
    note:
      `🎯 ${entry.symbol} reached its approved target — protective stop cancelled, GTC limit sell ` +
      `${action.quantity} @ $${action.targetPrice} placed (${brokerState.status}). ` +
      `⚠️ No stop underneath until this fills or the retreat-restore re-arms one (≤1 poll cycle).`,
  });
  return `🎯 ${entry.symbol} OCO: stop → take-profit sell ${action.quantity} @ $${action.targetPrice}`;
}

/** Phase B: cancel the unfilled take-profit, re-arm the protective stop. */
async function restoreStop(action: OcoAction, userId: string): Promise<string> {
  await cancelOrder(action.takeProfitOrderId!, 'system:oco', userId);
  const result = await placeProtectiveStop(action.entryOrderId, userId, {
    afterOcoRestore: true,
    quantityOverride: action.quantity,
  });
  return result.ok
    ? `↩️ ${action.symbol} OCO: price retreated — take-profit cancelled, stop restored for ${action.quantity}`
    : `⚠️ ${action.symbol} OCO restore: take-profit cancelled but stop NOT restored (${result.code}) — position may be unprotected`;
}
