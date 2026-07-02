/**
 * Deterministic PAPER broker adapter (Milestone 1).
 *
 * Simulates a limit order's lifecycle with no external calls and no money at
 * risk, so the whole spine — propose → approve → stage → submit → working →
 * filled — can be watched end to end before a real broker is ever wired up.
 *
 * Simulated broker state is persisted in Redis (keyed by brokerOrderId) so the
 * status survives across serverless invocations. Behaviour is intentionally
 * simple and predictable:
 *   - placeLimitOrder  → order goes `working` (staged at the limit).
 *   - getOrderStatus   → first poll fills it completely at the limit price.
 *   - cancelOrder      → cancels iff not yet filled.
 */

import { getRedisClient } from '@/lib/redis';
import type { BrokerAdapter, BrokerOrderState, PlaceLimitOrderRequest } from './adapter';

interface PaperOrderRecord {
  brokerOrderId: string;
  ticker: string;
  side: 'buy' | 'sell';
  limitPrice: number;
  shares: number;
  status: 'working' | 'filled' | 'canceled';
  filledShares: number;
  avgFillPrice?: number;
  submittedAt: string;
}

function paperKey(brokerOrderId: string): string {
  return `confluence:paper:${brokerOrderId}`;
}

async function readRecord(brokerOrderId: string): Promise<PaperOrderRecord | null> {
  const redis = await getRedisClient();
  const data = await redis.get(paperKey(brokerOrderId));
  return data ? (JSON.parse(data) as PaperOrderRecord) : null;
}

async function writeRecord(rec: PaperOrderRecord): Promise<void> {
  const redis = await getRedisClient();
  // Paper records are ephemeral simulation state; expire after 7 days.
  await redis.set(paperKey(rec.brokerOrderId), JSON.stringify(rec), { EX: 60 * 60 * 24 * 7 });
}

function toState(rec: PaperOrderRecord): BrokerOrderState {
  return {
    brokerOrderId: rec.brokerOrderId,
    status: rec.status,
    filledShares: rec.filledShares,
    avgFillPrice: rec.avgFillPrice,
  };
}

export class PaperBrokerAdapter implements BrokerAdapter {
  readonly name = 'paper';

  async placeLimitOrder(req: PlaceLimitOrderRequest): Promise<BrokerOrderState> {
    const rec: PaperOrderRecord = {
      brokerOrderId: `paper-${req.orderId}`,
      ticker: req.ticker,
      side: req.side,
      limitPrice: req.limitPrice,
      shares: req.shares,
      status: 'working',
      filledShares: 0,
      submittedAt: new Date().toISOString(),
    };
    await writeRecord(rec);
    return toState(rec);
  }

  async getOrderStatus(brokerOrderId: string): Promise<BrokerOrderState> {
    const rec = await readRecord(brokerOrderId);
    if (!rec) {
      return {
        brokerOrderId,
        status: 'failed',
        filledShares: 0,
        error: 'Paper order not found',
      };
    }
    // A working paper order fills completely at its limit on the next poll.
    if (rec.status === 'working') {
      rec.status = 'filled';
      rec.filledShares = rec.shares;
      rec.avgFillPrice = rec.limitPrice;
      await writeRecord(rec);
    }
    return toState(rec);
  }

  async cancelOrder(brokerOrderId: string): Promise<BrokerOrderState> {
    const rec = await readRecord(brokerOrderId);
    if (!rec) {
      return { brokerOrderId, status: 'failed', filledShares: 0, error: 'Paper order not found' };
    }
    if (rec.status === 'working') {
      rec.status = 'canceled';
      await writeRecord(rec);
    }
    return toState(rec);
  }
}
