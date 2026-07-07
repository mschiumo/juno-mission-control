// Pure helpers for the Weekly Scoreboard's debt thermometer — kept
// dependency-free so they're trivially unit-testable.

export interface BalanceEntry {
  weekStart: string; // Monday YYYY-MM-DD
  balance: number; // dollars
}

// From MJ's 3/6/12-month plan: principal down 15–20% by end of September
// 2026 — we pace against the midpoint.
export const DEBT_TARGET = { date: '2026-09-30', pct: 17.5 };

export function pctPaid(startBalance: number, current: number): number {
  if (startBalance <= 0) return 0;
  return Math.max(0, Math.min(100, ((startBalance - current) / startBalance) * 100));
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

/**
 * Projected debt-free date from the recent paydown trend (last up-to-5
 * weekly balance entries). Returns null when there aren't at least two
 * entries or the balance isn't trending down.
 */
export function projectDebtFreeDate(entries: BalanceEntry[]): string | null {
  if (entries.length < 2) return null;
  const recent = entries.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = daysBetween(first.weekStart, last.weekStart);
  if (days <= 0) return null;
  const perDay = (first.balance - last.balance) / days;
  if (perDay <= 0 || last.balance <= 0) return null;
  const daysLeft = Math.ceil(last.balance / perDay);
  const freeDate = new Date(last.weekStart + 'T12:00:00');
  freeDate.setDate(freeDate.getDate() + daysLeft);
  const y = freeDate.getFullYear();
  const m = String(freeDate.getMonth() + 1).padStart(2, '0');
  const d = String(freeDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface PaceStatus {
  expectedPct: number; // where the plan says you should be today
  actualPct: number;
  onPace: boolean;
  targetPct: number;
  targetDate: string;
}

/**
 * Pace vs. the plan's checkpoint: linear ramp from startDate to the target
 * date/percentage. A 1-point grace band avoids flapping at the boundary.
 */
export function paceStatus(
  startBalance: number,
  startDate: string,
  current: number,
  today: string,
  target: { date: string; pct: number } = DEBT_TARGET
): PaceStatus {
  const total = daysBetween(startDate, target.date);
  const elapsed = daysBetween(startDate, today);
  const progress = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 1;
  const expectedPct = target.pct * progress;
  const actualPct = pctPaid(startBalance, current);
  return {
    expectedPct: Math.round(expectedPct * 10) / 10,
    actualPct: Math.round(actualPct * 10) / 10,
    onPace: actualPct >= expectedPct - 1,
    targetPct: target.pct,
    targetDate: target.date,
  };
}
