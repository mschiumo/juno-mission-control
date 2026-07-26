/**
 * Take-profit decision guard: a limit exit at the APPROVED target may be
 * staged only for a settled long fill trading at/through that target, sized
 * to the shares its other exits haven't already closed, with the resting
 * protective stops named for cancellation — and never while disarmed.
 * Plus the protective-stop guard's new rules: a working/filled take-profit
 * blocks a stop, and the fail-safe flag lets a system-cancelled stop back.
 */

import { describe, expect, it } from 'vitest';
import { shouldPlaceTakeProfit, targetReached } from '@/lib/confluence/take-profit';
import { shouldPlaceProtectiveStop } from '@/lib/confluence/protective-stop';
import type { ExecutionOrder, SystemState } from '@/types/confluence';

const armedState: SystemState = {
  tradingEnabled: true,
  paperMode: true,
  perPositionCapUsd: 2000,
  totalExposureCapUsd: 10000,
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
    quantity: 10,
    timeInForce: 'gfd',
    stopPrice: 52,
    targetPrice: 61.5,
    refId: 'r1',
    status: 'filled',
    filledQuantity: 10,
    isPaper: true,
    history: [],
    ...over,
  };
}

function stopChild(over: Partial<ExecutionOrder> = {}): ExecutionOrder {
  return order({
    id: 's1',
    kind: 'protective_stop',
    protectsOrderId: 'e1',
    side: 'sell',
    type: 'stop_market',
    status: 'submitted',
    filledQuantity: 0,
    timeInForce: 'gtc',
    ...over,
  });
}

function tpChild(over: Partial<ExecutionOrder> = {}): ExecutionOrder {
  return order({
    id: 't1',
    kind: 'take_profit',
    protectsOrderId: 'e1',
    side: 'sell',
    status: 'submitted',
    filledQuantity: 0,
    timeInForce: 'gtc',
    ...over,
  });
}

describe('targetReached', () => {
  it('long entries take profit when price rises to the target', () => {
    expect(targetReached('buy', 61.5, 61.5)).toBe(true);
    expect(targetReached('buy', 61.49, 61.5)).toBe(false);
  });
  it('short entries take profit when price falls to the target', () => {
    expect(targetReached('sell', 61.5, 61.5)).toBe(true);
    expect(targetReached('sell', 61.51, 61.5)).toBe(false);
  });
});

describe('shouldPlaceTakeProfit', () => {
  it('places at target: full remaining quantity, resting stop named for cancel', () => {
    const d = shouldPlaceTakeProfit(order({}), [stopChild()], 61.5, armedState);
    expect(d.place).toBe(true);
    expect(d.quantity).toBe(10);
    expect(d.cancelStopIds).toEqual(['s1']);
  });

  it('never fires below target', () => {
    const d = shouldPlaceTakeProfit(order({}), [stopChild()], 61.49, armedState);
    expect(d).toMatchObject({ place: false, code: 'target_not_reached' });
  });

  it('only entries chain a take-profit', () => {
    const d = shouldPlaceTakeProfit(stopChild(), [], 61.5, armedState);
    expect(d).toMatchObject({ place: false, code: 'not_entry' });
  });

  it('waits for a settled fill', () => {
    const d = shouldPlaceTakeProfit(
      order({ status: 'partially_filled', filledQuantity: 4 }),
      [],
      61.5,
      armedState,
    );
    expect(d).toMatchObject({ place: false, code: 'not_filled' });
  });

  it('sizes to shares the stop has not already sold, and still cancels the active remainder', () => {
    // Stop partially filled 4 of 10 then still resting for the rest.
    const d = shouldPlaceTakeProfit(
      order({}),
      [stopChild({ status: 'partially_filled', filledQuantity: 4 })],
      61.5,
      armedState,
    );
    expect(d.place).toBe(true);
    expect(d.quantity).toBe(6);
    expect(d.cancelStopIds).toEqual(['s1']);
  });

  it('stands down when the exits already closed the position', () => {
    const d = shouldPlaceTakeProfit(
      order({}),
      [stopChild({ status: 'filled', filledQuantity: 10 })],
      61.5,
      armedState,
    );
    expect(d).toMatchObject({ place: false, code: 'position_closed' });
  });

  it('a working take-profit blocks a duplicate', () => {
    const d = shouldPlaceTakeProfit(order({}), [tpChild()], 61.5, armedState);
    expect(d).toMatchObject({ place: false, code: 'already_placed' });
  });

  it('an owner-cancelled take-profit blocks re-placement (deliberate removal)', () => {
    const d = shouldPlaceTakeProfit(order({}), [tpChild({ status: 'cancelled' })], 61.5, armedState);
    expect(d).toMatchObject({ place: false, code: 'already_placed' });
  });

  it('a FAILED take-profit is retried', () => {
    const d = shouldPlaceTakeProfit(order({}), [tpChild({ status: 'failed' })], 61.5, armedState);
    expect(d.place).toBe(true);
  });

  it('no approved target → nothing to place', () => {
    const d = shouldPlaceTakeProfit(order({ targetPrice: undefined }), [], 61.5, armedState);
    expect(d).toMatchObject({ place: false, code: 'no_target_price' });
  });

  it('kill switch is absolute and evaluated last', () => {
    const d = shouldPlaceTakeProfit(order({}), [stopChild()], 61.5, {
      ...armedState,
      tradingEnabled: false,
    });
    expect(d).toMatchObject({ place: false, code: 'kill_switch' });
  });

  it('ignores children of other entries', () => {
    const d = shouldPlaceTakeProfit(
      order({}),
      [tpChild({ protectsOrderId: 'other-entry' }), stopChild({ protectsOrderId: 'other-entry' })],
      61.5,
      armedState,
    );
    expect(d.place).toBe(true);
    expect(d.quantity).toBe(10);
    expect(d.cancelStopIds).toEqual([]);
  });
});

describe('shouldPlaceProtectiveStop × take-profit interplay', () => {
  it('a working take-profit blocks a stop (shares reserved at the broker)', () => {
    const d = shouldPlaceProtectiveStop(order({}), [tpChild()], armedState);
    expect(d).toMatchObject({ place: false, code: 'take_profit_active' });
  });

  it('a filled take-profit blocks a stop (shares are gone)', () => {
    const d = shouldPlaceProtectiveStop(
      order({}),
      [tpChild({ status: 'filled', filledQuantity: 10 })],
      armedState,
    );
    expect(d).toMatchObject({ place: false, code: 'take_profit_active' });
  });

  it('a failed take-profit does NOT block the stop', () => {
    const d = shouldPlaceProtectiveStop(order({}), [tpChild({ status: 'failed' })], armedState);
    expect(d.place).toBe(true);
  });

  it('cancelled stop blocks by default, but the fail-safe flag lets it back', () => {
    const children = [stopChild({ status: 'cancelled' }), tpChild({ status: 'failed' })];
    expect(shouldPlaceProtectiveStop(order({}), children, armedState).place).toBe(false);
    expect(
      shouldPlaceProtectiveStop(order({}), children, armedState, { ignoreCancelledStops: true }).place,
    ).toBe(true);
  });
});
