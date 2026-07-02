/**
 * orders storage — created ONLY on approval by the deterministic execution
 * service. One JSON blob per user under `confluence:orders:${userId}`.
 */

import { getRedisClient } from '@/lib/redis';
import type { ExecutionOrder, OrderStatus } from '@/types/confluence';
import { isActiveOrderStatus, isTerminalOrderStatus } from '@/types/confluence';

function ordersKey(userId: string): string {
  return `confluence:orders:${userId}`;
}

export async function getAllOrders(userId: string): Promise<ExecutionOrder[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(ordersKey(userId));
    if (!data) return [];
    return (JSON.parse(data).orders as ExecutionOrder[]) || [];
  } catch (error) {
    console.error('Error getting orders from Redis:', error);
    return [];
  }
}

export async function getOrderById(id: string, userId: string): Promise<ExecutionOrder | null> {
  const all = await getAllOrders(userId);
  return all.find((o) => o.id === id) || null;
}

/** All non-terminal orders — the set used for the total-exposure cap. */
export async function getActiveOrders(userId: string): Promise<ExecutionOrder[]> {
  const all = await getAllOrders(userId);
  return all.filter((o) => isActiveOrderStatus(o.status));
}

/**
 * Whether the proposal already has a live (non-terminal) order. Backs the
 * canonical "at most one active order per proposal" unique index.
 */
export async function hasActiveOrderForProposal(proposalId: string, userId: string): Promise<boolean> {
  const all = await getAllOrders(userId);
  return all.some((o) => o.proposalId === proposalId && isActiveOrderStatus(o.status));
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
 * Apply a status transition, append to the order's local history, and set the
 * relevant timestamps (submittedAt / filledAt) in one write. Identity fields
 * are preserved.
 */
export async function transitionOrder(
  id: string,
  userId: string,
  next: {
    status: OrderStatus;
    filledQuantity?: number;
    avgFillPrice?: number;
    brokerOrderId?: string;
    lastError?: string;
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
    filledQuantity: next.filledQuantity ?? current.filledQuantity,
    avgFillPrice: next.avgFillPrice ?? current.avgFillPrice,
    brokerOrderId: next.brokerOrderId ?? current.brokerOrderId,
    lastError: next.lastError ?? current.lastError,
    submittedAt:
      current.submittedAt ?? (next.status === 'submitted' || next.status === 'partially_filled' ? now : undefined),
    filledAt: current.filledAt ?? (next.status === 'filled' ? now : undefined),
    updatedAt: now,
    history: [...current.history, { status: next.status, ts: now, detail: next.detail }],
  };
  existing[index] = updated;
  await redis.set(ordersKey(userId), JSON.stringify({ orders: existing }));
  return updated;
}

export { isTerminalOrderStatus };
