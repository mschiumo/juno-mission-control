/**
 * LIVE Robinhood broker adapter (Milestone 3) — places REAL orders with REAL money.
 *
 * Implements the deterministic BrokerAdapter against the Robinhood Trading MCP
 * (place_equity_order / get_equity_orders / cancel_equity_order) via the
 * server-side MCP client. This is plain code reacting to an already-approved,
 * guardrail-checked, account-pinned order — no LLM anywhere in this path.
 *
 * ⚠️ NOT E2E-VERIFIED FROM DEV. This is built to the documented Robinhood MCP
 * tool schemas, but placing a real order was never (and must never be) done from
 * a dev box. It needs: CONFLUENCE_ALLOW_LIVE=true (server gate), a pinned
 * agentic account (agentic_allowed=true), and ROBINHOOD_MCP_TOKEN. First run it
 * against the small funded account with tiny caps and the kill switch handy.
 */

import { callRobinhoodTool, payloadSnippet } from '@/lib/confluence/robinhood/mcp-client';
import type { BrokerAdapter, BrokerOrderState, PlaceLimitOrderRequest } from './adapter';
import type { OrderStatus, TradeDirection } from '@/types/confluence';

/** Map a Robinhood order state string to our OrderStatus. */
function mapState(state: string | undefined): OrderStatus {
  switch ((state || '').toLowerCase()) {
    case 'filled':
      return 'filled';
    case 'partially_filled':
      return 'partially_filled';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'rejected':
      return 'rejected';
    case 'failed':
    case 'voided':
      return 'failed';
    // new / queued / confirmed / unconfirmed / pending / pending_cancel
    default:
      return 'submitted';
  }
}

export interface RhOrder {
  id?: string;
  order_id?: string;
  state?: string;
  cumulative_quantity?: string;
  filled_quantity?: string;
  average_price?: string;
  reject_reason?: string;
}

/** Robinhood tool results are `{ data: {...} }`; some wrap the order directly. */
function unwrap<T>(res: unknown): T {
  const r = res as { data?: T } | T;
  return (r && typeof r === 'object' && 'data' in (r as object) ? (r as { data: T }).data : (r as T));
}

/**
 * Find the order object in a place_equity_order response, whatever the
 * wrapping: the order directly, `{data: order}`, `{order}`, or `{data: {order}}`.
 * An object counts as the order only if it carries an id.
 */
export function unwrapOrder(res: unknown): RhOrder | null {
  const isOrder = (v: unknown): v is RhOrder =>
    !!v && typeof v === 'object' && (!!(v as RhOrder).id || !!(v as RhOrder).order_id);
  const root = res as { data?: unknown; order?: unknown };
  for (const candidate of [
    res,
    root?.data,
    root?.order,
    (root?.data as { order?: unknown } | undefined)?.order,
  ]) {
    if (isOrder(candidate)) return candidate;
  }
  return null;
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toState(o: RhOrder): BrokerOrderState {
  const status = mapState(o.state);
  return {
    brokerOrderId: o.id || o.order_id || '',
    status,
    filledQuantity: num(o.cumulative_quantity ?? o.filled_quantity) ?? 0,
    avgFillPrice: num(o.average_price),
    error: status === 'rejected' || status === 'failed' ? o.reject_reason || o.state : undefined,
  };
}

export class LiveRobinhoodAdapter implements BrokerAdapter {
  readonly name = 'robinhood-mcp';

  async placeLimitOrder(req: PlaceLimitOrderRequest): Promise<BrokerOrderState> {
    // Idempotent: refId is our per-order UUID; the upstream dedupes by ref_id.
    const res = await callRobinhoodTool<{ data?: RhOrder } | RhOrder>('place_equity_order', {
      account_number: req.accountNumber,
      symbol: req.symbol,
      side: req.side,
      type: 'limit',
      limit_price: String(req.limitPrice),
      quantity: String(req.quantity),
      time_in_force: req.timeInForce, // 'gfd' | 'gtc'
      market_hours: 'regular_hours',
      ref_id: req.refId,
    });
    const order = unwrapOrder(res);
    if (!order) {
      // ⚠️ Robinhood may have ACCEPTED the order even though we couldn't read
      // the response — include the raw payload so the mismatch is diagnosable,
      // and say loudly that the broker must be checked before any retry.
      return {
        brokerOrderId: '',
        status: 'failed',
        filledQuantity: 0,
        error:
          `place_equity_order response had no recognizable order object — the order MAY STILL BE LIVE at ` +
          `Robinhood; check the Robinhood app before retrying. Raw response: ${payloadSnippet(res)}`,
      };
    }
    return toState(order);
  }

  async getOrderStatus(brokerOrderId: string, accountNumber: string): Promise<BrokerOrderState> {
    const res = await callRobinhoodTool<{ data?: { orders?: RhOrder[] } } | { orders?: RhOrder[] }>(
      'get_equity_orders',
      { account_number: accountNumber, order_id: brokerOrderId },
    );
    const data = unwrap<{ orders?: RhOrder[] }>(res);
    const order = data.orders?.[0];
    if (!order) {
      // Not-found can be broker-side propagation lag right after placement.
      // Stay non-terminal (`submitted`) so polling continues — marking it
      // `failed` here would permanently orphan a possibly-live order.
      return {
        brokerOrderId,
        status: 'submitted',
        filledQuantity: 0,
        error: 'Order not found at broker yet — will keep polling',
      };
    }
    return { ...toState(order), brokerOrderId };
  }

  async cancelOrder(brokerOrderId: string, accountNumber: string): Promise<BrokerOrderState> {
    await callRobinhoodTool('cancel_equity_order', { account_number: accountNumber, order_id: brokerOrderId });
    // The cancel is async at the broker — re-poll for the authoritative state.
    return this.getOrderStatus(brokerOrderId, accountNumber);
  }
}

/**
 * Live-only pre-trade safety check: the account's real spendable buying power.
 * Used by the execution service to block an order that obviously can't fund
 * before it ever reaches the broker (belt-and-suspenders with the caps).
 */
export async function getBuyingPower(accountNumber: string): Promise<number> {
  const res = await callRobinhoodTool<{ data?: { buying_power?: { buying_power?: string } } }>('get_portfolio', {
    account_number: accountNumber,
  });
  const bp = res?.data?.buying_power?.buying_power;
  const n = Number(bp);
  if (!Number.isFinite(n)) {
    // A shape mismatch used to fail closed to $0, which surfaced as a
    // misleading `insufficient_buying_power`. Throw the real story instead —
    // the execution service fails safe either way (nothing staged).
    throw new Error(
      `get_portfolio response had no readable buying_power — raw response: ${payloadSnippet(res)}`,
    );
  }
  return n;
}

/**
 * Simulate a limit order via Robinhood's review_equity_order — returns the quote
 * and pre-trade alerts WITHOUT placing anything. Used by the dry-run to validate
 * the order-parameter mapping before any real order. Returns the raw review
 * payload so the caller can inspect estimated cost / alerts.
 */
export async function reviewLimitOrder(params: {
  accountNumber: string;
  symbol: string;
  side: TradeDirection;
  limitPrice: number;
  quantity: number;
  timeInForce: 'gfd' | 'gtc';
}): Promise<unknown> {
  return callRobinhoodTool('review_equity_order', {
    account_number: params.accountNumber,
    symbol: params.symbol,
    side: params.side,
    type: 'limit',
    limit_price: String(params.limitPrice),
    quantity: String(params.quantity),
    time_in_force: params.timeInForce,
    market_hours: 'regular_hours',
  });
}

export interface LiveAccountSummary {
  accountValue: number;
  buyingPower: number;
  cash: number;
}

/** The account's real total value / buying power / cash (for the Performance panel). */
export async function getAccountSummary(accountNumber: string): Promise<LiveAccountSummary> {
  const res = await callRobinhoodTool<{
    data?: { total_value?: string; cash?: string; buying_power?: { buying_power?: string } };
  }>('get_portfolio', { account_number: accountNumber });
  const d = res?.data ?? {};
  const n = (v: string | undefined) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    accountValue: n(d.total_value),
    buyingPower: n(d.buying_power?.buying_power),
    cash: n(d.cash),
  };
}
