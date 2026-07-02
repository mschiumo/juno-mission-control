/**
 * Broker adapter interface for ConfluenceTrading execution.
 *
 * The execution service talks ONLY to this interface. Milestone 1 ships the
 * deterministic {@link PaperBrokerAdapter}; Milestone 3 swaps in a live adapter
 * backed by the Robinhood Trading MCP without the execution service changing.
 *
 * No LLM lives in this layer — an adapter is plain code reacting to a validated,
 * guardrail-checked, account-pinned order request.
 */

import type { OrderStatus, TradeDirection, TimeInForce } from '@/types/confluence';

export interface PlaceLimitOrderRequest {
  /** Our internal order id, for correlation. */
  orderId: string;
  /** Idempotency key — the broker must dedupe re-sends by this. */
  refId: string;
  /** Account the order targets (the pinned agentic account, or 'PAPER'). */
  accountNumber: string;
  symbol: string;
  side: TradeDirection;
  limitPrice: number;
  quantity: number;
  timeInForce: TimeInForce;
}

export interface BrokerOrderState {
  brokerOrderId: string;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice?: number;
  /** Populated on rejected/failed. */
  error?: string;
}

export interface BrokerAdapter {
  /** Human label for the audit trail, e.g. "paper" or "robinhood-mcp". */
  readonly name: string;
  /** Submit a limit order. Returns the broker's initial view of the order. */
  placeLimitOrder(req: PlaceLimitOrderRequest): Promise<BrokerOrderState>;
  /** Poll current status of a previously-placed order. `accountNumber` is the
   * account the order lives in (the live broker requires it; paper ignores it). */
  getOrderStatus(brokerOrderId: string, accountNumber: string): Promise<BrokerOrderState>;
  /** Best-effort cancel. Returns the resulting state. */
  cancelOrder(brokerOrderId: string, accountNumber: string): Promise<BrokerOrderState>;
}
