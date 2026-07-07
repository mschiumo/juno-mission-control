import { describe, expect, it } from 'vitest';
import { isOrphan, matchOrphans } from '@/lib/confluence/reconcile';
import type { ExecutionOrder } from '@/types/confluence';

function appOrder(over: Partial<ExecutionOrder>): ExecutionOrder {
  return {
    id: 'app-1',
    proposalId: 'p1',
    createdAt: '2026-07-07T18:09:07.000Z',
    updatedAt: '2026-07-07T18:09:07.000Z',
    symbol: 'BMY',
    accountNumber: '462746538',
    side: 'buy',
    type: 'limit',
    kind: 'entry',
    limitPrice: 56.42,
    quantity: 1,
    timeInForce: 'gfd',
    refId: 'r1',
    status: 'failed',
    filledQuantity: 0,
    isPaper: false,
    history: [],
    ...over,
  };
}

// The real BMY desync, verbatim from the broker.
const bmyBroker = {
  id: '6a4d40c5-fdd4-41ea-974a-f569ee2de292',
  symbol: 'BMY',
  side: 'buy',
  type: 'limit',
  state: 'confirmed',
  quantity: '1.000000',
  price: '56.420000',
  created_at: '2026-07-07T18:09:09.973357Z',
};

describe('isOrphan', () => {
  it('flags failed/staged records without a broker id', () => {
    expect(isOrphan(appOrder({}))).toBe(true);
    expect(isOrphan(appOrder({ status: 'staged' }))).toBe(true);
  });
  it('leaves linked or healthy records alone', () => {
    expect(isOrphan(appOrder({ brokerOrderId: 'x' }))).toBe(false);
    expect(isOrphan(appOrder({ status: 'submitted' }))).toBe(false);
  });
});

describe('matchOrphans', () => {
  it('links the real BMY desync case', () => {
    const { matches, ambiguous } = matchOrphans([appOrder({})], [bmyBroker], new Set());
    expect(matches).toEqual([{ appOrderId: 'app-1', brokerOrderId: bmyBroker.id }]);
    expect(ambiguous).toEqual([]);
  });

  it('requires price to the cent and side/qty/symbol equality', () => {
    expect(matchOrphans([appOrder({ limitPrice: 56.43 })], [bmyBroker], new Set()).matches).toEqual([]);
    expect(matchOrphans([appOrder({ side: 'sell' })], [bmyBroker], new Set()).matches).toEqual([]);
    expect(matchOrphans([appOrder({ quantity: 2 })], [bmyBroker], new Set()).matches).toEqual([]);
    expect(matchOrphans([appOrder({ symbol: 'BMZ' })], [bmyBroker], new Set()).matches).toEqual([]);
  });

  it('rejects creation times outside the ±10 minute window', () => {
    const late = { ...bmyBroker, created_at: '2026-07-07T18:25:00.000Z' };
    expect(matchOrphans([appOrder({})], [late], new Set()).matches).toEqual([]);
  });

  it('never links a broker order already claimed by another app record', () => {
    const { matches } = matchOrphans([appOrder({})], [bmyBroker], new Set([bmyBroker.id]));
    expect(matches).toEqual([]);
  });

  it('reports ambiguity instead of guessing between twins', () => {
    const twin = { ...bmyBroker, id: 'twin-id', created_at: '2026-07-07T18:09:30.000Z' };
    const { matches, ambiguous } = matchOrphans([appOrder({})], [bmyBroker, twin], new Set());
    expect(matches).toEqual([]);
    expect(ambiguous).toHaveLength(1);
  });

  it('two orphans claim two distinct broker twins deterministically', () => {
    const twin = { ...bmyBroker, id: 'twin-id', created_at: '2026-07-07T18:09:30.000Z' };
    const second = appOrder({ id: 'app-2', createdAt: '2026-07-07T18:09:29.000Z' });
    // First orphan sees two candidates → ambiguous; it must NOT grab one blindly.
    const { matches } = matchOrphans([appOrder({}), second], [bmyBroker, twin], new Set());
    expect(matches).toEqual([]);
  });
});
