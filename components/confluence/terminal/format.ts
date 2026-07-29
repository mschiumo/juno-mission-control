/**
 * Pure display helpers for the Agentic Trading terminal. Everything here is
 * derived, never stored (see the handoff spec's State section).
 */

import type { ExecutionOrder, LivePosition, OrderStatus, Proposal } from '@/types/confluence';
import { ACTIVE_ORDER_STATUSES } from '@/types/confluence';

export function money(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** "462746538" → "···6538". */
export function maskAcct(acct?: string): string {
  if (!acct) return 'paper';
  return `···${acct.slice(-4)}`;
}

/** Percent progress from avg cost toward the approved target, clamped 0–100. */
export function pctToTarget(p: LivePosition): number | null {
  if (p.avgCost == null || p.target == null || p.lastPrice == null) return null;
  if (p.target <= p.avgCost) return p.atTarget ? 100 : null;
  return Math.max(0, Math.min(100, Math.round(((p.lastPrice - p.avgCost) / (p.target - p.avgCost)) * 100)));
}

/** Progress color bucket per the spec: ≥60 green, ≥10 mid, else none. */
export function pctBucket(pct: number | null): 'pos' | 'mid' | 'none' {
  if (pct == null) return 'none';
  if (pct >= 60) return 'pos';
  if (pct >= 10) return 'mid';
  return 'none';
}

export function pctColors(pct: number | null): { text: string; fill: string } {
  const bucket = pctBucket(pct);
  if (bucket === 'pos') return { text: 'var(--ct-pos)', fill: 'var(--ct-pos)' };
  if (bucket === 'mid') return { text: 'var(--ct-muted)', fill: 'var(--ct-progress-mid)' };
  return { text: 'var(--ct-faint)', fill: 'var(--ct-progress-none)' };
}

/** Reward-to-risk multiple of a proposal's plan, e.g. 1.7 → "1.7R". */
export function rMultiple(p: Proposal): number | null {
  const limit = p.suggestedLimitPrice;
  const stop = p.suggestedStopPrice;
  const target = p.suggestedTargetPrice;
  if (limit == null || stop == null || target == null) return null;
  const risk = limit - stop;
  if (risk <= 0) return null;
  return Math.round(((target - limit) / risk) * 10) / 10;
}

export function proposalNotional(p: Proposal): number {
  return (p.suggestedLimitPrice ?? 0) * (p.suggestedQuantity ?? 0);
}

/** "Buy KDP ×2" (fractional quantities keep their decimals). */
export function proposalTitle(p: Proposal): string {
  const dir = p.direction === 'buy' ? 'Buy' : 'Sell';
  const qty = p.suggestedQuantity ?? 0;
  return `${dir} ${p.symbol} ×${qty}`;
}

export type OrderGroup = 'working' | 'filled' | 'cancelled';

/** Lifecycle grouping: Working (actionable) / Filled (dimmed) / Cancelled (collapsed). */
export function orderGroup(o: ExecutionOrder): OrderGroup {
  if (ACTIVE_ORDER_STATUSES.includes(o.status)) return 'working';
  if (o.status === 'filled') return 'filled';
  return 'cancelled'; // cancelled | rejected | failed
}

export function groupOrders(orders: ExecutionOrder[]): Record<OrderGroup, ExecutionOrder[]> {
  const groups: Record<OrderGroup, ExecutionOrder[]> = { working: [], filled: [], cancelled: [] };
  for (const o of orders) groups[orderGroup(o)].push(o);
  return groups;
}

/** Sentence-case pill vocabulary (identical on both breakpoints). */
export function statusPill(status: OrderStatus): { label: string; bg: string; color: string } {
  switch (status) {
    case 'filled':
      return { label: 'Filled', bg: 'var(--ct-pos-bg)', color: 'var(--ct-pos-text)' };
    case 'submitted':
      return { label: 'Submitted', bg: 'var(--ct-info-bg)', color: 'var(--ct-info)' };
    case 'partially_filled':
      return { label: 'Partial', bg: 'var(--ct-info-bg)', color: 'var(--ct-info)' };
    case 'staged':
      return { label: 'Staged', bg: 'rgba(245,166,35,0.13)', color: '#fcd34d' };
    case 'cancelled':
      return { label: 'Cancelled', bg: 'rgba(255,255,255,0.05)', color: 'var(--ct-faint)' };
    case 'rejected':
      return { label: 'Rejected', bg: 'var(--ct-neg-bg)', color: 'var(--ct-neg-text)' };
    case 'failed':
      return { label: 'Failed', bg: 'var(--ct-neg-bg)', color: 'var(--ct-neg-text)' };
  }
}

/** Signed percent, one decimal: 3.14 → "+3.1%". */
export function signedPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/** Signed dollars: -12.3 → "−$12.30". */
export function signedMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n < 0 ? '−' : '+'}${money(Math.abs(n), digits)}`;
}

/** Unrealized P&L vs the broker's average cost (null while the quote is missing). */
export function positionPnl(p: LivePosition): { usd: number; pct: number } | null {
  if (p.avgCost == null || p.lastPrice == null || p.avgCost === 0) return null;
  return {
    usd: (p.lastPrice - p.avgCost) * p.quantity,
    pct: ((p.lastPrice - p.avgCost) / p.avgCost) * 100,
  };
}

/** Today's move vs the prior close (null when the quote lacks a prev close). */
export function positionDayPnl(p: LivePosition): { usd: number; pct: number } | null {
  if (p.prevClose == null || p.lastPrice == null || p.prevClose === 0) return null;
  return {
    usd: (p.lastPrice - p.prevClose) * p.quantity,
    pct: ((p.lastPrice - p.prevClose) / p.prevClose) * 100,
  };
}

export function positionMarketValue(p: LivePosition): number | null {
  if (p.lastPrice == null) return null;
  return p.lastPrice * p.quantity;
}

/** The stop that governs this position: a live protective stop, else the approved plan's. */
export function effectiveStop(p: LivePosition): number | null {
  return p.stop?.stopPrice ?? p.planStop ?? null;
}

/** $ lost from here if the governing stop fires (per covered share). */
export function positionRisk(p: LivePosition): number | null {
  const stop = effectiveStop(p);
  if (stop == null || p.avgCost == null) return null;
  const coveredQty = p.stop ? Math.min(p.quantity, p.stop.quantity) : p.quantity;
  return Math.max(0, (p.avgCost - stop) * coveredQty);
}

/** Whole days the position has been open (0 = opened today; null = untracked). */
export function daysHeld(p: LivePosition): number | null {
  if (!p.entryFilledAt) return null;
  const opened = new Date(p.entryFilledAt).getTime();
  if (!Number.isFinite(opened)) return null;
  return Math.max(0, Math.floor((Date.now() - opened) / 86_400_000));
}

/** "Jul 22" (adds the year once it differs from today's). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Where stop / entry / last / target sit on a shared 0–100 ladder so the card
 * can draw one bar with all four levels. Null until both rails exist.
 */
export function priceLadder(p: LivePosition): { stop: number; entry: number; last: number | null; target: number } | null {
  const stop = effectiveStop(p);
  if (stop == null || p.target == null || p.avgCost == null || p.target <= stop) return null;
  const span = p.target - stop;
  const at = (price: number) => Math.max(0, Math.min(100, ((price - stop) / span) * 100));
  return {
    stop: 0,
    entry: at(p.avgCost),
    last: p.lastPrice != null ? at(p.lastPrice) : null,
    target: 100,
  };
}

