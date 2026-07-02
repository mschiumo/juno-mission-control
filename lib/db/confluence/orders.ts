/**
 * Execution-order storage for ConfluenceTrading.
 *
 * One JSON blob per user under `confluence:orders:${userId}`. Orders are only
 * ever created by the deterministic execution service in response to an
 * approved proposal — never by the LLM.
 */

import { getRedisClient } from '@/lib/redis';
import type { ExecutionOrder, OrderStatus } from '@/types/confluence';
import { isTerminalOrderStatus } from '@/types/confluence';

function ordersKey(userId: string): string {
  return `confluence:orders:${userId}`;
}

export async function getAllOrders(userId: string): Promise<ExecutionOrder[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(ordersKey(userId));
    if (!data) return [];
    const parsed = JSON.parse(data);
    return (parsed.orders as ExecutionOrder[]) || [];
  } catch (error) {
    console.error('Error getting orders from Redis:', error);
    return [];
  }
}

export async function getOrderById(id: string, userId: string): Promise<ExecutionOrder | null> {
  const all = await getAllOrders(userId);
  return all.find((o) => o.id === id) || null;
}

export async function getOrderByProposalId(
  proposalId: string,
  userId: string,
): Promise<ExecutionOrder | null> {
  const all = await getAllOrders(userId);
  return all.find((o) => o.proposalId === proposalId) || null;
}

/** Orders that are not in a terminal state — the set used for exposure caps. */
export async function getOpenOrders(userId: string): Promise<ExecutionOrder[]> {
  const all = await getAllOrders(userId);
  return all.filter((o) => !isTerminalOrderStatus(o.status));
}

export async function saveOrder(order: ExecutionOrder, userId: string): Promise<ExecutionOrder> {
  const redis = await getRedisClient();
  const existing = await getAllOrders(userId);
  const index = existing.findIndex((o) => o.id === order.id);
  const withStamp = { ...order, updatedAt: new Date().toISOString() };
  if (index >= 0) {
    existing[index] = withStamp;
  } else {
    existing.push(withStamp);
  }
  await redis.set(ordersKey(userId), JSON.stringify({ orders: existing }));
  return withStamp;
}

/**
 * Apply a status transition and append to the order's immutable history in one
 * write. Identity fields are preserved.
 */
export async function transitionOrder(
  id: string,
  userId: string,
  next: {
    status: OrderStatus;
    filledShares?: number;
    avgFillPrice?: number;
    brokerOrderId?: string;
    error?: string;
    detail?: string;
  },
): Promise<ExecutionOrder | null> {
  const redis = await getRedisClient();
  const existing = await getAllOrders(userId);
  const index = existing.findIndex((o) => o.id === id);
  if (index === -1) return null;
  const current = existing[index];
  const now = new Date().toISOString();
  const updated: ExecutionOrder = {
    ...current,
    status: next.status,
    filledShares: next.filledShares ?? current.filledShares,
    avgFillPrice: next.avgFillPrice ?? current.avgFillPrice,
    brokerOrderId: next.brokerOrderId ?? current.brokerOrderId,
    error: next.error ?? current.error,
    updatedAt: now,
    history: [...current.history, { status: next.status, ts: now, detail: next.detail }],
  };
  existing[index] = updated;
  await redis.set(ordersKey(userId), JSON.stringify({ orders: existing }));
  return updated;
}
