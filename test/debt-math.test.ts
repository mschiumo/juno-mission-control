import { describe, it, expect } from 'vitest';
import { pctPaid, projectDebtFreeDate, paceStatus } from '../lib/debt-math';

describe('pctPaid', () => {
  it('computes and clamps', () => {
    expect(pctPaid(15800, 15800)).toBe(0);
    expect(pctPaid(15800, 7900)).toBeCloseTo(50);
    expect(pctPaid(15800, 0)).toBe(100);
    expect(pctPaid(15800, 20000)).toBe(0); // balance went up — clamp at 0
    expect(pctPaid(0, 100)).toBe(0);
  });
});

describe('projectDebtFreeDate', () => {
  it('needs at least two entries', () => {
    expect(projectDebtFreeDate([{ weekStart: '2026-07-06', balance: 15800 }])).toBeNull();
  });
  it('projects linearly from the recent trend', () => {
    const date = projectDebtFreeDate([
      { weekStart: '2026-07-06', balance: 15800 },
      { weekStart: '2026-07-13', balance: 15100 }, // $700/wk → ~21.6 weeks left
    ]);
    expect(date).toBe('2026-12-11'); // 15100 / ($700/wk = $100/day) = 151 days from Jul 13
  });
  it('returns null when balance is not trending down', () => {
    expect(projectDebtFreeDate([
      { weekStart: '2026-07-06', balance: 15000 },
      { weekStart: '2026-07-13', balance: 15200 },
    ])).toBeNull();
  });
  it('uses only the recent window', () => {
    // Old fast paydown followed by recent stall — projection reflects recent 5
    const date = projectDebtFreeDate([
      { weekStart: '2026-05-04', balance: 20000 },
      { weekStart: '2026-06-01', balance: 16000 },
      { weekStart: '2026-06-08', balance: 15900 },
      { weekStart: '2026-06-15', balance: 15800 },
      { weekStart: '2026-06-22', balance: 15700 },
      { weekStart: '2026-06-29', balance: 15600 },
      { weekStart: '2026-07-06', balance: 15500 },
    ]);
    // last 5: 15800 → 15500 over 21 days ≈ 14.29/day → ~1085 days out
    expect(date).not.toBeNull();
    expect(date! > '2028-01-01').toBe(true);
  });
});

describe('paceStatus', () => {
  it('ramps the expected pct linearly to the target date', () => {
    // Start Jul 6, target 17.5% by Sep 30 (86 days). Halfway (~Aug 18) expects ~8.75%.
    const midway = paceStatus(15800, '2026-07-06', 15800 - 15800 * 0.10, '2026-08-18');
    expect(midway.expectedPct).toBeCloseTo(8.7, 0);
    expect(midway.actualPct).toBeCloseTo(10, 0);
    expect(midway.onPace).toBe(true);
  });
  it('flags behind pace beyond the grace band', () => {
    const late = paceStatus(15800, '2026-07-06', 15700, '2026-09-15');
    expect(late.onPace).toBe(false);
  });
  it('clamps expected pct at the target after the target date', () => {
    const after = paceStatus(15800, '2026-07-06', 12000, '2026-12-01');
    expect(after.expectedPct).toBe(17.5);
  });
});
