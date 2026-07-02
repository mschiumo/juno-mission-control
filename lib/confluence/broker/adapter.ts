/**
 * Broker adapter interface for ConfluenceTrading execution.
 *
 * The execution service talks ONLY to this interface. Milestone 1 ships the
 * deterministic {@link PaperBrokerAdapter}; Milestone 3 swaps in a live adapter
 * backed by the Robinhood Trading MCP without the execution service changing.
 *
 * There is no LLM anywhere in this layer — an adapter is plain code reacting to
 * a validated, guardrail-checked order request.
 */

import type { OrderStatus, TradeDirection } from '@/types/confluence';

export interface PlaceLimitOrderRequest {
  /** Our internal order id, for correlation in logs/paper fills. */
  orderId: string;
  ticker: string;
  side: TradeDirection;
  limitPrice: number;
  shares: number;
  timeInForce: 'day' | 'gtc';
}

export interface BrokerOrderState {
  /** The broker's id for the order. */
  brokerOrderId: string;
  status: OrderStatus;
  filledShares: number;
  avgFillPrice?: number;
  /** Populated on rejected/failed. */
  error?: string;
}

/**
 * Minimal surface the execution service needs. Kept deliberately small so the
 * live Robinhood MCP adapter is a thin translation, not a re-implementation.
 */
export interface BrokerAdapter {
  /** Human label for the audit trail, e.g. "paper" or "robinhood-mcp". */
  readonly name: string;

  /** Submit a limit order. Returns the broker's initial view of the order. */
  placeLimitOrder(req: PlaceLimitOrderRequest): Promise<BrokerOrderState>;

  /** Poll current status of a previously-placed order. */
  getOrderStatus(brokerOrderId: string): Promise<BrokerOrderState>;

  /** Best-effort cancel. Returns the resulting state. */
  cancelOrder(brokerOrderId: string): Promise<BrokerOrderState>;
}
