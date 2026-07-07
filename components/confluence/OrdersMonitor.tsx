'use client';

/**
 * Monitoring panel: staged/submitted/filled orders with fill data. Read-mostly —
 * the only mutations are cancelling an active order and a manual refresh that
 * polls the broker adapter for status/fills.
 */

import { RefreshCw, XCircle } from 'lucide-react';
import type { ExecutionOrder, OrderStatus } from '@/types/confluence';
import { ACTIVE_ORDER_STATUSES } from '@/types/confluence';

export interface LivePosition {
  symbol: string;
  quantity: number;
  avgCost?: number;
  /** Active protective-stop coverage from the app's ledger (null = uncovered). */
  stop: { stopPrice?: number; quantity: number } | null;
}

interface Props {
  orders: ExecutionOrder[];
  /** Live from Robinhood on every load — not a cached copy. */
  positions: LivePosition[];
  /** Why positions are empty (paper mode, no account, not configured). */
  positionsNote?: string;
  busy: boolean;
  onRefresh: () => void;
  onCancel: (id: string) => void;
}

function statusStyle(status: OrderStatus): { bg: string; color: string } {
  switch (status) {
    case 'filled':
      return { bg: 'var(--positive-dim)', color: 'var(--positive)' };
    case 'submitted':
    case 'partially_filled':
      return { bg: 'var(--info-dim)', color: 'var(--info)' };
    case 'staged':
      return { bg: 'var(--warning-dim)', color: 'var(--warning)' };
    default:
      return { bg: 'var(--negative-dim)', color: 'var(--negative)' };
  }
}

export default function OrdersMonitor({ orders, positions, positionsNote, busy, onRefresh, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Live positions straight from the broker for the pinned account. */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Positions <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>(live from Robinhood)</span>
        </h3>
        {positions.length === 0 ? (
          <p className="text-[13px] py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
            {positionsNote ?? 'No open positions in the agentic account.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }} className="text-left">
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Avg cost</th>
                  <th className="py-2 pr-3 font-medium">Protective stop</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{p.symbol}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>{p.quantity}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>
                      {p.avgCost != null ? `$${p.avgCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {p.stop ? (
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{ background: 'var(--positive-dim)', color: 'var(--positive)' }}
                        >
                          stop ${p.stop.stopPrice?.toFixed(2) ?? '?'} × {p.stop.quantity}
                        </span>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-semibold"
                          style={{ background: 'var(--negative-dim)', color: 'var(--negative)' }}
                        >
                          NO STOP
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Orders &amp; Positions</h3>
        <button
          className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50"
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No orders yet. Approve a proposal to stage one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-tertiary)' }} className="text-left">
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 font-medium">Side</th>
                <th className="py-2 pr-3 font-medium">Limit</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 pr-3 font-medium">Filled</th>
                <th className="py-2 pr-3 font-medium">Avg fill</th>
                <th className="py-2 pr-3 font-medium">TIF</th>
                <th className="py-2 pr-3 font-medium">Acct</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const s = statusStyle(o.status);
                const cancelable = ACTIVE_ORDER_STATUSES.includes(o.status);
                return (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {o.symbol}
                      {o.kind === 'protective_stop' ? (
                        <span
                          className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle"
                          style={{ background: 'var(--info-dim)', color: 'var(--info)' }}
                          title="Protective stop — placed automatically at the approved stop price after the entry filled"
                        >
                          STOP
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 uppercase" style={{ color: o.side === 'buy' ? 'var(--positive)' : 'var(--negative)' }}>{o.side}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {o.kind === 'protective_stop' ? `stop $${o.stopPrice ?? o.limitPrice}` : `$${o.limitPrice}`}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{o.quantity}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{o.filledQuantity}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{o.avgFillPrice != null ? `$${o.avgFillPrice}` : '—'}</td>
                    <td className="py-2.5 pr-3 uppercase" style={{ color: 'var(--text-tertiary)' }}>{o.timeInForce}</td>
                    <td className="py-2.5 pr-3">
                      <span className="badge" style={{ background: 'var(--surface-3)', color: o.isPaper ? 'var(--warning)' : 'var(--text-secondary)' }}>
                        {o.isPaper ? 'PAPER' : o.accountNumber}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge" style={{ background: s.bg, color: s.color }}>{o.status}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      {cancelable && (
                        <button
                          className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] disabled:opacity-50"
                          style={{ color: 'var(--negative)' }}
                          onClick={() => onCancel(o.id)}
                          disabled={busy}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
