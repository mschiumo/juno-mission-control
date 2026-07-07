import { describe, expect, it } from 'vitest';
import { oppositeSide, shouldPlaceProtectiveStop } from '@/lib/confluence/protective-stop';
import { activeExposure } from '@/lib/confluence/guardrails';
import type { ExecutionOrder, SystemState } from '@/types/confluence';

const baseState: SystemState = {
  tradingEnabled: true,
  paperMode: true,
  perPositionCapUsd: 100,
  totalExposureCapUsd: 400,
  entryOrderMaxAgeDays: 5,
  updatedAt: new Date(0).toISOString(),
};

function order(over: Partial<ExecutionOrder>): ExecutionOrder {
  return {
    id: 'e1',
    proposalId: 'p1',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    symbol: 'BMY',
    accountNumber: 'PAPER',
    side: 'buy',
    type: 'limit',
    kind: 'entry',
    limitPrice: 56.42,
    quantity: 1,
    timeInForce: 'gtc',
    stopPrice: 54.5,
    refId: 'r1',
    status: 'filled',
    filledQuantity: 1,
    isPaper: true,
    history: [],
    ...over,
  };
}

describe('shouldPlaceProtectiveStop', () => {
  it('places for a filled entry with a stop and no children', () => {
    expect(shouldPlaceProtectiveStop(order({}), [], baseState)).toEqual({ place: true });
  });

  it('places for a cancelled entry holding a partial fill', () => {
    const d = shouldPlaceProtectiveStop(order({ status: 'cancelled', filledQuantity: 2, quantity: 5 }), [], baseState);
    expect(d.place).toBe(true);
  });

  it('waits while a partially-filled entry is still working', () => {
    const d = shouldPlaceProtectiveStop(order({ status: 'partially_filled', filledQuantity: 1, quantity: 3 }), [], baseState);
    expect(d).toMatchObject({ place: false, code: 'not_filled' });
  });

  it('never chains off a protective stop', () => {
    const d = shouldPlaceProtectiveStop(order({ kind: 'protective_stop' }), [], baseState);
    expect(d).toMatchObject({ place: false, code: 'not_entry' });
  });

  it('requires an approved stop price', () => {
    const d = shouldPlaceProtectiveStop(order({ stopPrice: undefined }), [], baseState);
    expect(d).toMatchObject({ place: false, code: 'no_stop_price' });
  });

  it('blocks when an active child already protects the entry', () => {
    const child = order({ id: 's1', kind: 'protective_stop', protectsOrderId: 'e1', status: 'submitted' });
    const d = shouldPlaceProtectiveStop(order({}), [child], baseState);
    expect(d).toMatchObject({ place: false, code: 'already_protected' });
  });

  it('re-attempts after a FAILED child (failed placements must not block)', () => {
    const child = order({ id: 's1', kind: 'protective_stop', protectsOrderId: 'e1', status: 'failed' });
    expect(shouldPlaceProtectiveStop(order({}), [child], baseState).place).toBe(true);
  });

  it('respects the kill switch — and reports it as the reason', () => {
    const d = shouldPlaceProtectiveStop(order({}), [], { ...baseState, tradingEnabled: false });
    expect(d).toMatchObject({ place: false, code: 'kill_switch' });
  });
});

describe('oppositeSide', () => {
  it('sells protect buys and vice versa', () => {
    expect(oppositeSide('buy')).toBe('sell');
    expect(oppositeSide('sell')).toBe('buy');
  });
});

describe('activeExposure with protective stops', () => {
  it('excludes protective stops from the exposure sum', () => {
    const entry = order({ status: 'submitted' });
    const stop = order({ id: 's1', kind: 'protective_stop', protectsOrderId: 'e1', status: 'submitted', limitPrice: 54.5 });
    expect(activeExposure([entry, stop])).toBeCloseTo(56.42);
  });

  it('treats legacy orders without kind as entries', () => {
    const legacy = order({ kind: undefined });
    expect(activeExposure([legacy])).toBeCloseTo(56.42);
  });
});
