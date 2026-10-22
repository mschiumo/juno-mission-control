import { describe, expect, it } from 'vitest';
import { manualExitFill, openLots, planExternalExits } from '@/lib/confluence/external-exits';
import { shouldPlaceProtectiveStop } from '@/lib/confluence/protective-stop';
import { shouldPlaceTakeProfit } from '@/lib/confluence/take-profit';
import type { ExecutionOrder, SystemState } from '@/types/confluence';

function order(over: Partial<ExecutionOrder>): ExecutionOrder {
  return {
    id: 'entry-mfc',
    proposalId: 'p1',
    createdAt: '2026-08-26T21:49:50.303Z',
    updatedAt: '2026-08-27T13:30:00.000Z',
    symbol: 'MFC',
    accountNumber: '462746538',
    side: 'buy',
    type: 'limit',
    kind: 'entry',
    limitPrice: 42.1,
    quantity: 3,
    timeInForce: 'gfd',
    stopPrice: 41.6,
    targetPrice: 45.65,
    refId: 'r1',
    status: 'filled',
    filledQuantity: 3,
    avgFillPrice: 42.05,
    filledAt: '2026-08-27T13:30:00.000Z',
    isPaper: false,
    history: [],
    ...over,
  };
}

const NOW = new Date('2026-10-22T18:30:00Z').getTime();
const state = { tradingEnabled: true } as SystemState;

describe('openLots', () => {
  it('subtracts every exit kind, including prior external exits', () => {
    const entry = order({});
    const cancelledStop = order({ id: 's1', kind: 'protective_stop', side: 'sell', protectsOrderId: 'entry-mfc', status: 'cancelled', filledQuantity: 0 });
    expect(openLots([entry, cancelledStop])).toEqual([
      expect.objectContaining({ entryId: 'entry-mfc', symbol: 'MFC', remaining: 3 }),
    ]);
    const ext = order({ id: 'x1', kind: 'external_exit', side: 'sell', protectsOrderId: 'entry-mfc', filledQuantity: 3 });
    expect(openLots([entry, cancelledStop, ext])).toEqual([]);
  });

  it('ignores paper, unfilled, and still-working entries', () => {
    expect(openLots([order({ isPaper: true })])).toEqual([]);
    expect(openLots([order({ filledQuantity: 0, status: 'cancelled' })])).toEqual([]);
    expect(openLots([order({ status: 'partially_filled', filledQuantity: 1 })])).toEqual([]);
  });
});

describe('planExternalExits', () => {
  const lots = openLots([
    order({}),
    order({ id: 'entry-vz', symbol: 'VZ', quantity: 2, filledQuantity: 2, filledAt: '2026-09-25T13:34:30Z' }),
  ]);

  it('closes every lot the broker no longer holds (the Oct 8 liquidation)', () => {
    expect(planExternalExits(lots, new Map(), NOW)).toEqual([
      { entryId: 'entry-mfc', symbol: 'MFC', quantity: 3 },
      { entryId: 'entry-vz', symbol: 'VZ', quantity: 2 },
    ]);
  });

  it('does nothing when the broker holds at least the ledger amount (manual buys ignored)', () => {
    expect(planExternalExits(lots, new Map([['MFC', 3], ['VZ', 5]]), NOW)).toEqual([]);
  });

  it('records a partial manual sell against the oldest lot first', () => {
    const two = openLots([
      order({ id: 'old', filledAt: '2026-08-01T14:00:00Z' }),
      order({ id: 'new', filledAt: '2026-09-01T14:00:00Z' }),
    ]);
    expect(planExternalExits(two, new Map([['MFC', 2]]), NOW)).toEqual([
      { entryId: 'old', symbol: 'MFC', quantity: 3 },
      { entryId: 'new', symbol: 'MFC', quantity: 1 },
    ]);
  });

  it('never touches a fill inside the grace window (positions may lag)', () => {
    const fresh = openLots([order({ filledAt: new Date(NOW - 60_000).toISOString() })]);
    expect(planExternalExits(fresh, new Map(), NOW)).toEqual([]);
  });
});

describe('manualExitFill', () => {
  const rows = [
    { id: 'manual-mfc', symbol: 'MFC', side: 'sell', state: 'filled', cumulative_quantity: '3.000000', average_price: '41.470000', last_transaction_at: '2026-10-08T13:30:01.583Z' },
    { id: 'agent-buy', symbol: 'MFC', side: 'buy', state: 'filled', cumulative_quantity: '3', average_price: '42.05', last_transaction_at: '2026-08-27T13:30:00Z' },
    { id: 'linked-stop', symbol: 'MFC', side: 'sell', state: 'filled', cumulative_quantity: '1', average_price: '40', last_transaction_at: '2026-10-01T13:30:00Z' },
  ];
  it('prices the exit from unlinked broker sells after the entry fill', () => {
    const fill = manualExitFill('MFC', rows, new Set(['linked-stop']), new Date('2026-08-27T13:30:00Z').getTime());
    expect(fill).toEqual({ avgPrice: 41.47, filledAt: '2026-10-08T13:30:01.583Z', orderIds: ['manual-mfc'] });
  });
  it('returns no price when nothing matches', () => {
    expect(manualExitFill('VZ', rows, new Set(), 0).avgPrice).toBeUndefined();
  });
});

describe('guards after an external exit', () => {
  const entry = order({});
  const ext = order({ id: 'x1', kind: 'external_exit', side: 'sell', protectsOrderId: 'entry-mfc', filledQuantity: 3 });
  it('take-profit stands down instead of selling shares that are gone', () => {
    expect(shouldPlaceTakeProfit(entry, [ext], 45.66, state)).toMatchObject({ place: false, code: 'position_closed' });
  });
  it('protective stop stands down', () => {
    expect(shouldPlaceProtectiveStop(entry, [ext], state)).toMatchObject({ place: false, code: 'position_closed' });
  });
  it('a partial manual sell shrinks the stop', () => {
    const partial = { ...ext, filledQuantity: 2 };
    expect(shouldPlaceProtectiveStop(entry, [partial], state)).toMatchObject({ place: true, quantity: 1 });
  });
});
