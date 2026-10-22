/**
 * External-exit sync — mirror shares the owner sold OUTSIDE the app.
 *
 * The failure mode this exists for: the owner liquidated VZ/OXY/MFC/DVN by
 * hand in the Robinhood app. The app's ledger derives "held shares" from its
 * own fill log, so it still believed those positions were open — the poll
 * then tried to place a take-profit sell against shares that no longer
 * existed ("Not enough shares to sell"), and the agent refused to re-propose
 * the symbols because they looked held.
 *
 * Robinhood's positions are the source of truth for what is held. When the
 * broker holds FEWER shares of a symbol than the ledger's open entries claim,
 * the shortfall is recorded as a ledger-only `external_exit` child of those
 * entries (oldest first, matching FIFO lot depletion). Every downstream
 * reader — the stop/take-profit guards, the agent's in-play check, the
 * Performance panel, the review ingest — then sees the position as closed.
 *
 * Safety:
 *   - Never places anything. The only broker writes are cancels of app exit
 *     orders still working against a symbol the broker holds ZERO shares of
 *     (they protect nothing).
 *   - Fails safe: an unreadable positions payload records nothing.
 *   - Entries filled within the grace window are left alone so a positions
 *     read that lags a fresh fill can't mark it closed (and skip its stop).
 *   - A Redis lock prevents two pollers from recording the same shortfall.
 *   - Extra shares at the broker (manual BUYS) are ignored — the app never
 *     protects or exits shares the human didn't approve through it.
 */

import { appendAudit } from '@/lib/db/confluence/audit';
import { getAllOrders, saveOrder } from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getRedisClient } from '@/lib/redis';
import { callRobinhoodTool, isRobinhoodAvailable } from '@/lib/confluence/robinhood/mcp-client';
import { cancelOrder, refreshOrderStatus } from './execution';
import type { ExecutionOrder } from '@/types/confluence';
import { isActiveOrderStatus, isTerminalOrderStatus } from '@/types/confluence';

/** A fresh fill may not show in the broker's positions yet — don't touch it. */
export const EXTERNAL_EXIT_GRACE_MS = 15 * 60 * 1000;
/** Bound on positions pages to walk (the agentic account holds a handful). */
const MAX_POSITION_PAGES = 5;

const EXIT_KINDS = new Set(['protective_stop', 'take_profit', 'external_exit']);

/** A still-open slice of an app entry, as the ledger sees it. */
export interface OpenLot {
  entryId: string;
  symbol: string;
  remaining: number;
  filledAtMs: number;
}

export interface PlannedExternalExit {
  entryId: string;
  symbol: string;
  quantity: number;
}

export interface BrokerFillRow {
  id?: string;
  symbol?: string;
  side?: string;
  state?: string;
  cumulative_quantity?: string | number;
  average_price?: string | number;
  created_at?: string;
  last_transaction_at?: string;
}

function num(v: string | number | undefined | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Open long lots per app entry: settled buy-entry fills minus everything their
 * exits (stop, take-profit, external) already closed. Live orders only.
 */
export function openLots(orders: ExecutionOrder[]): OpenLot[] {
  const lots: OpenLot[] = [];
  for (const e of orders) {
    if ((e.kind ?? 'entry') !== 'entry' || e.isPaper || e.side !== 'buy') continue;
    if (!(e.filledQuantity > 0)) continue;
    if (e.status !== 'filled' && !isTerminalOrderStatus(e.status)) continue;
    const closed = orders
      .filter((c) => c.protectsOrderId === e.id && EXIT_KINDS.has(c.kind ?? ''))
      .reduce((sum, c) => sum + Math.max(0, c.filledQuantity), 0);
    const remaining = e.filledQuantity - closed;
    if (!(remaining > 1e-9)) continue;
    lots.push({
      entryId: e.id,
      symbol: e.symbol.toUpperCase(),
      remaining,
      filledAtMs: new Date(e.filledAt ?? e.updatedAt ?? e.createdAt).getTime(),
    });
  }
  return lots;
}

/**
 * Pure: which open lots the broker no longer holds. Per symbol, the shortfall
 * (ledger held − broker held) is assigned to the OLDEST lots first; lots
 * inside the grace window are never assigned, so the shortfall may be only
 * partly recorded until they age out.
 */
export function planExternalExits(
  lots: OpenLot[],
  brokerHeld: Map<string, number>,
  nowMs: number,
  graceMs: number = EXTERNAL_EXIT_GRACE_MS,
): PlannedExternalExit[] {
  const bySymbol = new Map<string, OpenLot[]>();
  for (const lot of lots) bySymbol.set(lot.symbol, [...(bySymbol.get(lot.symbol) ?? []), lot]);

  const planned: PlannedExternalExit[] = [];
  for (const [symbol, symLots] of bySymbol) {
    const ledgerHeld = symLots.reduce((s, l) => s + l.remaining, 0);
    let shortfall = ledgerHeld - Math.max(0, brokerHeld.get(symbol) ?? 0);
    if (!(shortfall > 1e-9)) continue;
    const eligible = symLots
      .filter((l) => Number.isFinite(l.filledAtMs) && nowMs - l.filledAtMs >= graceMs)
      .sort((a, b) => a.filledAtMs - b.filledAtMs);
    for (const lot of eligible) {
      if (!(shortfall > 1e-9)) break;
      const quantity = Math.min(shortfall, lot.remaining);
      planned.push({ entryId: lot.entryId, symbol, quantity });
      shortfall -= quantity;
    }
  }
  return planned;
}

/**
 * Pure: the broker's filled SELLS of a symbol after `sinceMs` that no app
 * order accounts for — i.e. the owner's manual exits. Returns the
 * quantity-weighted average price (undefined when none are found).
 */
export function manualExitFill(
  symbol: string,
  rows: BrokerFillRow[],
  linkedBrokerIds: Set<string>,
  sinceMs: number,
): { avgPrice?: number; filledAt?: string; orderIds: string[] } {
  let qty = 0;
  let notional = 0;
  let filledAt: string | undefined;
  const orderIds: string[] = [];
  for (const r of rows) {
    if (!r.id || linkedBrokerIds.has(r.id)) continue;
    if ((r.symbol || '').toUpperCase() !== symbol) continue;
    if ((r.side || '').toLowerCase() !== 'sell' || (r.state || '').toLowerCase() !== 'filled') continue;
    const at = r.last_transaction_at ?? r.created_at;
    if (!at || new Date(at).getTime() < sinceMs) continue;
    const q = num(r.cumulative_quantity);
    const p = num(r.average_price);
    if (!(q && q > 0) || !(p && p > 0)) continue;
    qty += q;
    notional += q * p;
    orderIds.push(r.id);
    if (!filledAt || at > filledAt) filledAt = at;
  }
  return { avgPrice: qty > 0 ? Math.round((notional / qty) * 10000) / 10000 : undefined, filledAt, orderIds };
}

/** Read the broker's held shares per symbol; throws on an unreadable payload. */
async function getBrokerHeld(accountNumber: string): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_POSITION_PAGES; page++) {
    const res = await callRobinhoodTool<{
      data?: { positions?: { symbol?: string; quantity?: string | number }[]; results?: { symbol?: string; quantity?: string | number }[]; next?: string | null };
    }>('get_equity_positions', { account_number: accountNumber, ...(cursor ? { cursor } : {}) }, { retries: 2 });
    const rows = res?.data?.positions ?? res?.data?.results;
    // An empty array is a real answer ("you hold nothing"); a missing one is
    // a shape we don't understand — never read that as "everything sold".
    if (!Array.isArray(rows)) throw new Error('get_equity_positions returned no positions array');
    for (const p of rows) {
      const sym = (p.symbol || '').toUpperCase();
      const q = num(p.quantity);
      if (!sym || q === undefined) throw new Error(`unreadable position row for ${sym || 'unknown symbol'}`);
      held.set(sym, (held.get(sym) ?? 0) + q);
    }
    cursor = res?.data?.next || undefined;
    if (!cursor) return held;
  }
  throw new Error('positions pagination exceeded the page bound');
}

export interface ExternalExitResult {
  recorded: string[]; // "SYM qty @ $price"
  cancelled: string[]; // app exit orders pulled for fully-closed symbols
  skippedReason?: string;
}

/**
 * Bring the ledger in line with what the broker actually holds. Run by the
 * order poll after it refreshes active orders (so exits that filled at the
 * broker are already counted) and before take-profit/stop decisions.
 */
export async function syncExternalExits(userId: string): Promise<ExternalExitResult> {
  const result: ExternalExitResult = { recorded: [], cancelled: [] };

  let orders = await getAllOrders(userId);
  if (openLots(orders).length === 0) return result;

  const state = await getSystemState(userId);
  if (!state.agenticAccount || !(await isRobinhoodAvailable())) {
    result.skippedReason = 'Robinhood not configured or no agentic account pinned.';
    return result;
  }

  const redis = await getRedisClient();
  const lockKey = `confluence:external-exit-lock:${userId}`;
  if ((await redis.set(lockKey, '1', { NX: true, EX: 120 })) !== 'OK') {
    result.skippedReason = 'External-exit sync already in flight.';
    return result;
  }
  try {
    // Exits that filled at the broker but haven't been polled yet would read
    // as a manual sell — refresh the open lots' working exits first.
    const lotIds = new Set(openLots(orders).map((l) => l.entryId));
    const working = orders.filter(
      (o) => o.protectsOrderId && lotIds.has(o.protectsOrderId) && isActiveOrderStatus(o.status),
    );
    for (const o of working) await refreshOrderStatus(o.id, userId).catch(() => null);
    if (working.length > 0) orders = await getAllOrders(userId);

    const brokerHeld = await getBrokerHeld(state.agenticAccount);
    const planned = planExternalExits(openLots(orders), brokerHeld, Date.now());
    if (planned.length === 0) return result;

    // Price the exits from the owner's actual manual sells (advisory — a
    // missing price still closes the position, it just can't grade P&L).
    const entryById = new Map(orders.map((o) => [o.id, o]));
    const oldestFill = Math.min(
      ...planned.map((p) => new Date(entryById.get(p.entryId)!.filledAt ?? entryById.get(p.entryId)!.createdAt).getTime()),
    );
    let fills: BrokerFillRow[] = [];
    try {
      const res = await callRobinhoodTool<{ data?: { orders?: BrokerFillRow[] } }>(
        'get_equity_orders',
        { account_number: state.agenticAccount, state: 'filled', created_at_gte: new Date(oldestFill).toISOString() },
        { retries: 2 },
      );
      fills = res?.data?.orders ?? [];
    } catch {
      /* advisory */
    }
    const linked = new Set(orders.map((o) => o.brokerOrderId).filter((x): x is string => !!x));

    for (const plan of planned) {
      const entry = entryById.get(plan.entryId)!;
      const fill = manualExitFill(
        plan.symbol,
        fills,
        linked,
        new Date(entry.filledAt ?? entry.createdAt).getTime(),
      );

      // Nothing left at the broker → any exit still working for this entry
      // protects nothing. Pull it so it can't fire against a later position.
      if ((brokerHeld.get(plan.symbol) ?? 0) <= 0) {
        const stillWorking = (await getAllOrders(userId)).filter(
          (o) => o.protectsOrderId === entry.id && isActiveOrderStatus(o.status),
        );
        for (const o of stillWorking) {
          const c = await cancelOrder(o.id, 'system:external-exit', userId).catch(() => null);
          result.cancelled.push(`${o.symbol} ${o.kind} → ${c?.status ?? 'cancel failed'}`);
        }
      }

      const now = new Date().toISOString();
      const price = fill.avgPrice ?? entry.avgFillPrice ?? entry.limitPrice;
      const record: ExecutionOrder = {
        id: crypto.randomUUID(),
        proposalId: entry.proposalId,
        createdAt: now,
        updatedAt: now,
        symbol: entry.symbol,
        accountNumber: entry.accountNumber,
        side: 'sell',
        type: 'market',
        kind: 'external_exit',
        protectsOrderId: entry.id,
        limitPrice: price,
        quantity: plan.quantity,
        timeInForce: 'gfd',
        refId: crypto.randomUUID(),
        status: 'filled',
        filledQuantity: plan.quantity,
        avgFillPrice: fill.avgPrice,
        isPaper: false,
        filledAt: fill.filledAt ?? now,
        history: [{ status: 'filled', ts: now, detail: 'mirrored from broker positions (sold outside the app)' }],
      };
      await saveOrder(record, userId);
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.external_exit',
        entityType: 'order',
        entityId: record.id,
        before: { entryId: entry.id, ledgerHeld: plan.quantity },
        after: {
          brokerHeld: brokerHeld.get(plan.symbol) ?? 0,
          avgFillPrice: fill.avgPrice ?? null,
          brokerOrderIds: fill.orderIds,
        },
        note:
          `${entry.symbol}: ${plan.quantity} sh sold outside the app (Robinhood holds ` +
          `${brokerHeld.get(plan.symbol) ?? 0}) — recorded as a manual exit` +
          `${fill.avgPrice != null ? ` @ $${fill.avgPrice}` : ' (fill price not found)'}. ` +
          `No stop or take-profit will be placed for these shares.`,
      });
      result.recorded.push(`${entry.symbol} ${plan.quantity}${fill.avgPrice != null ? ` @ $${fill.avgPrice}` : ''}`);
    }
    return result;
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}
