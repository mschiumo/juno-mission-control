import { describe, expect, it } from 'vitest';
import { planOcoActions, TP_RETREAT_FRACTION, type OcoSnapshot } from '@/lib/confluence/take-profit';
import { shouldPlaceProtectiveStop } from '@/lib/confluence/protective-stop';
import type { ExecutionOrder, SystemState } from '@/types/confluence';

function order(over: Partial<ExecutionOrder>): ExecutionOrder {
  return {
    id: 'e1',
    proposalId: 'p1',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    symbol: 'KMI',
    accountNumber: '462746538',
    side: 'buy',
    type: 'limit',
    kind: 'entry',
    limitPrice: 31.53,
    quantity: 2,
    timeInForce: 'gtc',
    stopPrice: 30.29,
    targetPrice: 34.01,
    refId: 'r1',
    status: 'filled',
    filledQuantity: 2,
    isPaper: false,
    history: [],
    ...over,
  };
}

const entry = order({});
const stop = order({ id: 's1', kind: 'protective_stop', protectsOrderId: 'e1', status: 'submitted', side: 'sell', quantity: 2, filledQuantity: 0 });

function snap(over: Partial<OcoSnapshot>): OcoSnapshot {
  return {
    entries: [entry],
    activeStops: new Map([['e1', stop]]),
    takeProfits: new Map(),
    lastPrices: new Map([['KMI', 33.0]]),
    ...over,
  };
}

describe('planOcoActions — phase A (switch to take-profit)', () => {
  it('switches when last ≥ target and a stop is working', () => {
    const actions = planOcoActions(snap({ lastPrices: new Map([['KMI', 34.05]]) }));
    expect(actions).toEqual([
      {
        kind: 'switch_to_take_profit',
        entryOrderId: 'e1',
        symbol: 'KMI',
        stopOrderId: 's1',
        quantity: 2,
        targetPrice: 34.01,
      },
    ]);
  });

  it('does nothing below target', () => {
    expect(planOcoActions(snap({ lastPrices: new Map([['KMI', 33.99]]) }))).toEqual([]);
  });

  it('never switches a NO-STOP position (unaccounted shares)', () => {
    const actions = planOcoActions(snap({ activeStops: new Map(), lastPrices: new Map([['KMI', 35]]) }));
    expect(actions).toEqual([]);
  });

  it('ignores symbols with no quote', () => {
    expect(planOcoActions(snap({ lastPrices: new Map() }))).toEqual([]);
  });
});

describe('planOcoActions — phase B (restore on retreat)', () => {
  const tp = order({ id: 't1', kind: 'take_profit', protectsOrderId: 'e1', status: 'submitted', side: 'sell', quantity: 2, filledQuantity: 0, limitPrice: 34.01 });

  it('restores the stop when price retreats below the hysteresis line', () => {
    const retreat = 34.01 * TP_RETREAT_FRACTION - 0.01;
    const actions = planOcoActions(
      snap({ activeStops: new Map(), takeProfits: new Map([['e1', [tp]]]), lastPrices: new Map([['KMI', retreat]]) }),
    );
    expect(actions).toEqual([
      { kind: 'restore_stop', entryOrderId: 'e1', symbol: 'KMI', takeProfitOrderId: 't1', quantity: 2, targetPrice: 34.01 },
    ]);
  });

  it('holds inside the hysteresis band (no flapping)', () => {
    const inBand = 34.01 * TP_RETREAT_FRACTION + 0.01;
    const actions = planOcoActions(
      snap({ activeStops: new Map(), takeProfits: new Map([['e1', [tp]]]), lastPrices: new Map([['KMI', inBand]]) }),
    );
    expect(actions).toEqual([]);
  });

  it('restores only the UNFILLED remainder after a partial take-profit fill', () => {
    const partial = { ...tp, filledQuantity: 1 };
    const retreat = 33.0;
    const actions = planOcoActions(
      snap({ activeStops: new Map(), takeProfits: new Map([['e1', [partial]]]), lastPrices: new Map([['KMI', retreat]]) }),
    );
    expect(actions[0]).toMatchObject({ kind: 'restore_stop', quantity: 1 });
  });

  it('does nothing while the take-profit is filled (position closed)', () => {
    const filled = { ...tp, status: 'filled' as const, filledQuantity: 2 };
    const actions = planOcoActions(
      snap({ activeStops: new Map(), takeProfits: new Map([['e1', [filled]]]), lastPrices: new Map([['KMI', 30]]) }),
    );
    expect(actions).toEqual([]);
  });
});

describe('OCO restore vs the protective-stop guard', () => {
  const state: SystemState = {
    tradingEnabled: true,
    paperMode: false,
    perPositionCapUsd: 100,
    totalExposureCapUsd: 400,
    entryOrderMaxAgeDays: 5,
    autoTakeProfit: true,
    updatedAt: new Date(0).toISOString(),
  };
  const cancelledByOco = order({ id: 's1', kind: 'protective_stop', protectsOrderId: 'e1', status: 'cancelled', side: 'sell' });

  it('a cancelled child blocks normal placement (owner intent respected)…', () => {
    const d = shouldPlaceProtectiveStop(entry, [cancelledByOco], state);
    expect(d).toMatchObject({ place: false, code: 'already_protected' });
  });

  it('…but not the OCO restore path (the engine cancelled it itself)', () => {
    const d = shouldPlaceProtectiveStop(entry, [cancelledByOco], state, { afterOcoRestore: true });
    expect(d.place).toBe(true);
  });
});
