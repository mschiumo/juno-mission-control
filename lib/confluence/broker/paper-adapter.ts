/**
 * Deterministic PAPER broker adapter (Milestone 1).
 *
 * Simulates a limit order's lifecycle with no external calls and no money at
 * risk, so the whole spine — propose → approve → stage → submit → filled — can
 * be watched end to end before a real broker is wired up.
 *
 * Simulated broker state is persisted in Redis (keyed by refId, the idempotency
 * key) so status survives across serverless invocations and a re-send with the
 * same refId is deduped rather than double-placed. Behaviour is predictable:
 *   - placeLimitOrder  → order goes `submitted` (live at the paper broker).
 *   - getOrderStatus   → first poll fills it completely at the limit price.
 *   - cancelOrder      → cancels iff not yet filled.
 */

import { getRedisClient } from '@/lib/redis';
import type { BrokerAdapter, BrokerOrderState, PlaceLimitOrderRequest } from './adapter';

interface PaperOrderRecord {
  brokerOrderId: string;
  refId: string;
  symbol: string;
  side: 'buy' | 'sell';
  limitPrice: number;
  quantity: number;
  status: 'submitted' | 'filled' | 'cancelled';
  filledQuantity: number;
  avgFillPrice?: number;
  submittedAt: string;
}

// Keyed by refId so an idempotent re-send resolves to the same simulated order.
function paperKey(refId: string): string {
  return `confluence:paper:${refId}`;
}
// Secondary index: brokerOrderId → refId, so status/cancel can find the record.
function brokerIndexKey(brokerOrderId: string): string {
  return `confluence:paper:broker:${brokerOrderId}`;
}

async function readByRef(refId: string): Promise<PaperOrderRecord | null> {
  const redis = await getRedisClient();
  const data = await redis.get(paperKey(refId));
  return data ? (JSON.parse(data) as PaperOrderRecord) : null;
}

async function readByBrokerId(brokerOrderId: string): Promise<PaperOrderRecord | null> {
  const redis = await getRedisClient();
  const refId = await redis.get(brokerIndexKey(brokerOrderId));
  return refId ? readByRef(refId) : null;
}

async function write(rec: PaperOrderRecord): Promise<void> {
  const redis = await getRedisClient();
  const ttl = { EX: 60 * 60 * 24 * 7 }; // ephemeral simulation state; 7 days
  await redis.set(paperKey(rec.refId), JSON.stringify(rec), ttl);
  await redis.set(brokerIndexKey(rec.brokerOrderId), rec.refId, ttl);
}

function toState(rec: PaperOrderRecord): BrokerOrderState {
  return {
    brokerOrderId: rec.brokerOrderId,
    status: rec.status,
    filledQuantity: rec.filledQuantity,
    avgFillPrice: rec.avgFillPrice,
  };
}

export class PaperBrokerAdapter implements BrokerAdapter {
  readonly name = 'paper';

  async placeLimitOrder(req: PlaceLimitOrderRequest): Promise<BrokerOrderState> {
    // Idempotency: a re-send with the same refId returns the existing order.
    const existing = await readByRef(req.refId);
    if (existing) return toState(existing);

    const rec: PaperOrderRecord = {
      brokerOrderId: `paper-${req.orderId}`,
      refId: req.refId,
      symbol: req.symbol,
      side: req.side,
      limitPrice: req.limitPrice,
      quantity: req.quantity,
      status: 'submitted',
      filledQuantity: 0,
      submittedAt: new Date().toISOString(),
    };
    await write(rec);
    return toState(rec);
  }

  async getOrderStatus(brokerOrderId: string): Promise<BrokerOrderState> {
    const rec = await readByBrokerId(brokerOrderId);
    if (!rec) {
      return { brokerOrderId, status: 'failed', filledQuantity: 0, error: 'Paper order not found' };
    }
    // A submitted paper order fills completely at its limit on the next poll.
    if (rec.status === 'submitted') {
      rec.status = 'filled';
      rec.filledQuantity = rec.quantity;
      rec.avgFillPrice = rec.limitPrice;
      await write(rec);
    }
    return toState(rec);
  }

  async cancelOrder(brokerOrderId: string): Promise<BrokerOrderState> {
    const rec = await readByBrokerId(brokerOrderId);
    if (!rec) {
      return { brokerOrderId, status: 'failed', filledQuantity: 0, error: 'Paper order not found' };
    }
    if (rec.status === 'submitted') {
      rec.status = 'cancelled';
      await write(rec);
    }
    return toState(rec);
  }
}
