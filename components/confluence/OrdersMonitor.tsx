'use client';

/**
 * Monitoring panel: staged/working/filled orders with P&L-relevant fill data.
 * Read-mostly — the only mutation is cancelling a still-working order, and a
 * manual refresh that polls the broker adapter for status/fills.
 */

import { RefreshCw, XCircle } from 'lucide-react';
import type { ExecutionOrder, OrderStatus } from '@/types/confluence';

interface Props {
  orders: ExecutionOrder[];
  busy: boolean;
  onRefresh: () => void;
  onCancel: (id: string) => void;
}

function statusStyle(status: OrderStatus): { bg: string; color: string } {
  switch (status) {
    case 'filled':
      return { bg: 'var(--positive-dim)', color: 'var(--positive)' };
    case 'working':
    case 'submitted':
    case 'partially_filled':
      return { bg: 'var(--info-dim)', color: 'var(--info)' };
    case 'staged':
      return { bg: 'var(--warning-dim)', color: 'var(--warning)' };
    default:
      return { bg: 'var(--negative-dim)', color: 'var(--negative)' };
  }
}

const CANCELABLE: OrderStatus[] = ['staged', 'submitted', 'working', 'partially_filled'];

export default function OrdersMonitor({ orders, busy, onRefresh, onCancel }: Props) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Orders &amp; Positions
        </h3>
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
                <th className="py-2 pr-3 font-medium">Ticker</th>
                <th className="py-2 pr-3 font-medium">Side</th>
                <th className="py-2 pr-3 font-medium">Limit</th>
                <th className="py-2 pr-3 font-medium">Shares</th>
                <th className="py-2 pr-3 font-medium">Filled</th>
                <th className="py-2 pr-3 font-medium">Avg fill</th>
                <th className="py-2 pr-3 font-medium">Mode</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const s = statusStyle(o.status);
                return (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{o.ticker}</td>
                    <td className="py-2.5 pr-3 uppercase" style={{ color: o.side === 'buy' ? 'var(--positive)' : 'var(--negative)' }}>{o.side}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>${o.limitPrice}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{o.shares}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{o.filledShares}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{o.avgFillPrice != null ? `$${o.avgFillPrice}` : '—'}</td>
                    <td className="py-2.5 pr-3">
                      <span className="badge" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>{o.mode}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge" style={{ background: s.bg, color: s.color }}>{o.status}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      {CANCELABLE.includes(o.status) && (
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
  );
}
