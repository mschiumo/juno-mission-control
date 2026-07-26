/**
 * Pure display helpers for the Agentic Trading terminal. Everything here is
 * derived, never stored (see the handoff spec's State section).
 */

import type { ExecutionOrder, OrderStatus, Proposal } from '@/types/confluence';
import { ACTIVE_ORDER_STATUSES } from '@/types/confluence';
import type { LivePosition } from '../OrdersMonitor';

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

/** Total $ at risk if every protective stop fires (entry − stop, per share). */
export function openRisk(positions: LivePosition[]): number | null {
  let risk = 0;
  let any = false;
  for (const p of positions) {
    if (p.avgCost != null && p.stop?.stopPrice != null) {
      risk += Math.max(0, p.avgCost - p.stop.stopPrice) * Math.min(p.quantity, p.stop.quantity);
      any = true;
    }
  }
  return any || positions.length === 0 ? Math.round(risk * 100) / 100 : null;
}
