/**
 * Order reconciliation — heal app↔broker desyncs.
 *
 * The failure mode this exists for (and which happened on the first live
 * trade): the broker ACCEPTS an order but the app can't read the response, so
 * the app records `failed`/`staged` with no broker id — an orphan the status
 * poll can never fix, while a REAL order works at Robinhood.
 *
 * Two repair passes, both read-only at the broker (this module never places
 * or cancels anything):
 *   A. Orphans (no brokerOrderId, status staged/failed): match against the
 *      broker's recent `placed_agent: 'agentic'` orders by symbol + side +
 *      quantity + price + creation-time proximity. Only UNIQUE matches link;
 *      ambiguity is reported, never guessed.
 *   B. Failed-with-id records: re-poll the broker directly; if the broker
 *      disagrees with our terminal `failed`, adopt the broker's truth.
 *
 * Every repair writes an `order.reconciled` audit event, and repaired orders
 * are re-refreshed so a fill discovered here chains its protective stop.
 */

import { appendAudit } from '@/lib/db/confluence/audit';
import { getAllOrders, transitionOrder } from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';
import { refreshOrderStatus } from './execution';
import type { ExecutionOrder } from '@/types/confluence';

/** How far back to ask the broker for orders (bounds the search). */
const LOOKBACK_DAYS = 7;
/** App-record vs broker-order creation times must be within this window. */
const TIME_TOLERANCE_MS = 10 * 60 * 1000;

export interface BrokerOrderRow {
  id?: string;
  symbol?: string;
  side?: string;
  type?: string;
  state?: string;
  quantity?: string | number;
  price?: string | number;
  created_at?: string;
}

export interface ReconcileMatch {
  appOrderId: string;
  brokerOrderId: string;
}

function num(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** An app order the status poll can never repair on its own. */
export function isOrphan(o: ExecutionOrder): boolean {
  return !o.brokerOrderId && (o.status === 'failed' || o.status === 'staged');
}

/**
 * Match orphaned app orders to broker rows — pure and conservative: a link
 * requires symbol, side, quantity, price (to the cent), and creation within
 * ±10 minutes, and must be UNIQUE in both directions. No guessing.
 */
export function matchOrphans(
  orphans: ExecutionOrder[],
  brokerRows: BrokerOrderRow[],
  alreadyLinkedBrokerIds: Set<string>,
): { matches: ReconcileMatch[]; ambiguous: string[] } {
  const matches: ReconcileMatch[] = [];
  const ambiguous: string[] = [];
  const claimed = new Set<string>(alreadyLinkedBrokerIds);

  for (const app of orphans) {
    const appCreated = new Date(app.createdAt).getTime();
    const candidates = brokerRows.filter((b) => {
      if (!b.id || claimed.has(b.id)) return false;
      if ((b.symbol || '').toUpperCase() !== app.symbol.toUpperCase()) return false;
      if ((b.side || '').toLowerCase() !== app.side) return false;
      const qty = num(b.quantity);
      if (qty === undefined || Math.abs(qty - app.quantity) > 1e-9) return false;
      // Entries are limit orders (price); protective stops carry the trigger
      // in limitPrice too — compare to the cent either way.
      const price = num(b.price);
      if (price === undefined || Math.abs(price - app.limitPrice) > 0.005) return false;
      const created = b.created_at ? new Date(b.created_at).getTime() : NaN;
      if (!Number.isFinite(created) || Math.abs(created - appCreated) > TIME_TOLERANCE_MS) return false;
      return true;
    });

    if (candidates.length === 1) {
      matches.push({ appOrderId: app.id, brokerOrderId: candidates[0].id! });
      claimed.add(candidates[0].id!);
    } else if (candidates.length > 1) {
      ambiguous.push(`${app.symbol} ${app.side} ${app.quantity} @ $${app.limitPrice}: ${candidates.length} broker candidates`);
    }
  }
  return { matches, ambiguous };
}

export interface ReconcileResult {
  checked: number;
  linked: string[]; // "SYM app-id → broker-id"
  corrected: string[]; // failed-with-id records the broker disagreed with
  ambiguous: string[];
  unmatchedOrphans: string[];
  skippedReason?: string;
}

/** Run both repair passes for the user. Broker access is read-only. */
export async function reconcileOrders(userId: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, linked: [], corrected: [], ambiguous: [], unmatchedOrphans: [] };

  const all = await getAllOrders(userId);
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const recent = all.filter((o) => new Date(o.createdAt).getTime() >= cutoff && !o.isPaper);
  const orphans = recent.filter(isOrphan);
  const failedWithId = recent.filter((o) => o.brokerOrderId && o.status === 'failed');
  result.checked = orphans.length + failedWithId.length;
  if (result.checked === 0) return result;

  const state = await getSystemState(userId);
  if (!state.agenticAccount || !isRobinhoodConfigured()) {
    result.skippedReason = 'Robinhood not configured or no agentic account pinned.';
    return result;
  }

  // Pass A — link orphans against the broker's recent agentic orders.
  if (orphans.length > 0) {
    const since = new Date(cutoff).toISOString();
    const res = await callRobinhoodTool<{ data?: { orders?: BrokerOrderRow[] } }>(
      'get_equity_orders',
      { account_number: state.agenticAccount, placed_agent: 'agentic', created_at_gte: since },
      { retries: 2 }, // read-only
    );
    const rows = res?.data?.orders ?? [];
    const linkedIds = new Set(recent.map((o) => o.brokerOrderId).filter((x): x is string => !!x));
    const { matches, ambiguous } = matchOrphans(orphans, rows, linkedIds);
    result.ambiguous = ambiguous;

    for (const m of matches) {
      const app = orphans.find((o) => o.id === m.appOrderId)!;
      await transitionOrder(app.id, userId, {
        // Non-terminal so the normal status poll takes over from here; the
        // refresh below immediately adopts the broker's real state.
        status: 'submitted',
        brokerOrderId: m.brokerOrderId,
        lastError: undefined,
        detail: 'reconciled: linked to broker order',
      });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'order.reconciled',
        entityType: 'order',
        entityId: app.id,
        before: { status: app.status, brokerOrderId: null },
        after: { status: 'submitted', brokerOrderId: m.brokerOrderId },
        note: `Reconciled ${app.symbol} ${app.side} ${app.quantity} @ $${app.limitPrice}: app record was '${app.status}' but the order exists at the broker (${m.brokerOrderId}). Linked; polling resumes.`,
      });
      // Adopt the broker's current state now — a fill chains its stop here.
      await refreshOrderStatus(app.id, userId);
      result.linked.push(`${app.symbol} ${app.id.slice(0, 8)} → ${m.brokerOrderId.slice(0, 8)}`);
    }
    const linkedApp = new Set(matches.map((m) => m.appOrderId));
    result.unmatchedOrphans = orphans
      .filter((o) => !linkedApp.has(o.id) && !ambiguous.some((a) => a.startsWith(o.symbol)))
      .map((o) => `${o.symbol} ${o.side} ${o.quantity} @ $${o.limitPrice} (${o.status})`);
  }

  // Pass B — terminal `failed` WITH a broker id: ask the broker directly.
  for (const app of failedWithId) {
    const res = await callRobinhoodTool<{ data?: { orders?: BrokerOrderRow[] } }>(
      'get_equity_orders',
      { account_number: state.agenticAccount, order_id: app.brokerOrderId },
      { retries: 2 },
    );
    const row = res?.data?.orders?.[0];
    const brokerState = (row?.state || '').toLowerCase();
    if (!row || brokerState === 'failed' || brokerState === 'rejected' || brokerState === 'voided') continue;
    await transitionOrder(app.id, userId, {
      status: 'submitted',
      lastError: undefined,
      detail: `reconciled: broker says '${row.state}', app said 'failed'`,
    });
    await appendAudit(userId, {
      actor: 'system',
      actorId: 'system',
      eventType: 'order.reconciled',
      entityType: 'order',
      entityId: app.id,
      before: { status: 'failed' },
      after: { status: 'submitted', brokerState: row.state },
      note: `Reconciled ${app.symbol}: app recorded 'failed' but the broker reports '${row.state}'. Polling resumes.`,
    });
    await refreshOrderStatus(app.id, userId);
    result.corrected.push(`${app.symbol} ${app.id.slice(0, 8)} (broker: ${row.state})`);
  }

  return result;
}
