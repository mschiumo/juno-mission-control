/**
 * The account top-line must never present a simulation as a real balance.
 *
 * Regression: with LIVE mode on and the broker unreadable, the panel fell
 * through to the paper model and rendered $9,720.44 buying power beside a LIVE
 * MODE badge — for an account actually holding $120.44. That figure also fed
 * the proposal queue's "can this be funded?" check.
 */

import { describe, expect, it } from 'vitest';
import { resolveAccountTopLine } from '@/lib/confluence/performance';

// The real August 2026 state: four open positions at $267.19 cost basis.
const base = {
  investedCost: 267.19,
  realizedPnl: -12.37,
  markedValue: 275.17,
  quotesAvailable: true,
};

describe('resolveAccountTopLine', () => {
  it('reports the broker figures verbatim in live mode', () => {
    const r = resolveAccountTopLine({
      ...base,
      paperMode: false,
      live: { accountValue: 395.61, buyingPower: 120.44, cash: 120.44 },
    });
    expect(r.source).toBe('live');
    expect(r.buyingPower).toBe(120.44);
    expect(r.accountValue).toBe(395.61);
    expect(r.liveError).toBeUndefined();
  });

  it('returns unknown — never the paper model — when live mode cannot read the broker', () => {
    const r = resolveAccountTopLine({
      ...base,
      paperMode: false,
      live: null,
      fetchError: 'Robinhood token refresh failed (invalid_grant).',
    });
    expect(r.source).toBe('live_unavailable');
    expect(r.accountValue).toBeNull();
    expect(r.buyingPower).toBeNull();
    expect(r.cash).toBeNull();
    expect(r.liveError).toContain('invalid_grant');
  });

  it('never emits the exact figure that caused the bug', () => {
    const r = resolveAccountTopLine({ ...base, paperMode: false, live: null });
    // 10_000 - 267.19 + (-12.37) = 9_720.44 — what the panel used to show.
    expect(r.buyingPower).not.toBe(9_720.44);
    expect(r.buyingPower).toBeNull();
  });

  it('still carries a reason when the fetch error is unknown', () => {
    const r = resolveAccountTopLine({ ...base, paperMode: false, live: null });
    expect(r.liveError).toBeTruthy();
  });

  it('uses the paper model only in paper mode', () => {
    const r = resolveAccountTopLine({ ...base, paperMode: true, live: null });
    expect(r.source).toBe('paper');
    expect(r.cash).toBeCloseTo(9_720.44, 2);
    expect(r.accountValue).toBeCloseTo(9_720.44 + 275.17, 2);
  });

  it('marks paper positions at cost when quotes are unavailable', () => {
    const r = resolveAccountTopLine({ ...base, paperMode: true, live: null, quotesAvailable: false });
    expect(r.accountValue).toBeCloseTo(9_720.44 + 267.19, 2);
  });

  it('ignores a stale broker payload when paper mode is on', () => {
    const r = resolveAccountTopLine({
      ...base,
      paperMode: true,
      live: { accountValue: 395.61, buyingPower: 120.44, cash: 120.44 },
    });
    expect(r.source).toBe('paper');
    expect(r.buyingPower).not.toBe(120.44);
  });
});
