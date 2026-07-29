'use client';

/**
 * Mobile orders — lifecycle-filtered order cards (no tables on mobile).
 * Positions live on their own sub-tab now; this surface is orders only.
 * Renders in the normal page flow under the app's own navigation.
 */

import { useState } from 'react';
import type { ExecutionOrder, LivePosition } from '@/types/confluence';
import { ACTIVE_ORDER_STATUSES } from '@/types/confluence';
import { StatusPill } from './atoms';
import { groupOrders, maskAcct, money, type OrderGroup } from './format';

interface Props {
  /** Only used for the "N positions are protected" hint under an empty Working list. */
  positions: LivePosition[];
  orders: ExecutionOrder[];
  account?: string;
  busy: boolean;
  onCancelOrder: (id: string) => void;
}

function sideTag(order: ExecutionOrder) {
  const isStop = order.kind === 'protective_stop';
  const label = order.side === 'sell' ? (isStop ? 'SELL STOP' : 'SELL') : isStop ? 'BUY STOP' : 'BUY';
  const neg = order.side === 'sell';
  return (
    <span
      style={{
        padding: '3px 7px',
        borderRadius: 5,
        background: neg ? 'rgba(248,113,113,0.14)' : 'rgba(52,211,153,0.12)',
        color: neg ? 'var(--ct-neg)' : 'var(--ct-pos)',
        fontFamily: 'var(--ct-mono)',
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.07em',
      }}
    >
      {label}
    </span>
  );
}

function MobileOrderCard({ order, busy, onCancel }: { order: ExecutionOrder; busy: boolean; onCancel: (id: string) => void }) {
  const cancelable = ACTIVE_ORDER_STATUSES.includes(order.status);
  const isStop = order.kind === 'protective_stop';
  const price = isStop ? (order.stopPrice ?? order.limitPrice) : order.limitPrice;

  if (!cancelable) {
    // Filled / cancelled — one line, recessed.
    return (
      <div
        className="flex items-center justify-between"
        style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 14, fontWeight: 600, color: 'var(--ct-muted)' }}>{order.symbol}</span>
          {sideTag(order)}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="ct-num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ct-muted)' }}>
            {order.quantity} @ {money(order.avgFillPrice ?? price)}
          </span>
          <StatusPill status={order.status} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)', gap: 10 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 15, fontWeight: 600, color: 'var(--ct-text)' }}>{order.symbol}</span>
          {sideTag(order)}
        </div>
        <span className="ct-num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ct-text-body)' }}>{money(price)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="ct-num" style={{ fontSize: 11.5, color: 'var(--ct-label)' }}>
          {order.quantity} qty · {order.filledQuantity} filled · {order.timeInForce.toUpperCase()}
        </span>
        <div className="flex items-center" style={{ gap: 9 }}>
          <StatusPill status={order.status} />
          <button
            onClick={() => {
              // Native confirmation on mobile per the handoff spec.
              if (window.confirm(`Cancel ${order.symbol} ${order.side} order?`)) onCancel(order.id);
            }}
            disabled={busy}
            className="disabled:opacity-50"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(248,113,113,0.35)',
              color: 'var(--ct-neg-text)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MobileHome({ positions, orders, account, busy, onCancelOrder }: Props) {
  const [filter, setFilter] = useState<OrderGroup>('working');
  const groups = groupOrders(orders);

  const chip = (id: OrderGroup, label: string, count: number) => (
    <button
      key={id}
      className={`ct-chip ${filter === id ? 'active' : ''}`}
      style={{ padding: '8px 13px', fontSize: 12 }}
      onClick={() => setFilter(id)}
    >
      {label} {count}
    </button>
  );

  const protectiveOnly = groups.working.length > 0 && groups.working.every((o) => o.kind === 'protective_stop');
  const protectedCount = positions.filter((p) => p.stop).length;

  return (
    <div className="flex flex-col" style={{ gap: 9, paddingBottom: 20 }}>
      {/* Filter chips + masked account */}
      <div className="flex items-center overflow-x-auto" style={{ gap: 7, paddingBottom: 5, marginBottom: 4 }}>
        {chip('working', 'Working', groups.working.length)}
        {chip('filled', 'Filled', groups.filled.length)}
        {chip('cancelled', 'Cancelled', groups.cancelled.length)}
        <span className="ct-num ml-auto" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ct-dimmer)', paddingLeft: 8 }}>
          acct {maskAcct(account)}
        </span>
      </div>

      {filter === 'working' && (
        <>
          <div className="ct-eyebrow" style={{ padding: '2px 0 3px' }}>
            {protectiveOnly ? 'WORKING — PROTECTIVE STOPS' : 'WORKING'}
          </div>
          {groups.working.length === 0 ? (
            <p style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
              No working orders.{' '}
              {protectedCount > 0
                ? `${protectedCount} ${protectedCount === 1 ? 'position is' : 'positions are'} protected.`
                : ''}
            </p>
          ) : (
            groups.working.map((o) => <MobileOrderCard key={o.id} order={o} busy={busy} onCancel={onCancelOrder} />)
          )}
          {groups.filled.length > 0 && (
            <>
              <div className="ct-eyebrow" style={{ padding: '8px 0 3px' }}>FILLED</div>
              {groups.filled.map((o) => <MobileOrderCard key={o.id} order={o} busy={busy} onCancel={onCancelOrder} />)}
            </>
          )}
        </>
      )}
      {filter === 'filled' &&
        (groups.filled.length === 0 ? (
          <p style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
            No filled orders.
          </p>
        ) : (
          groups.filled.map((o) => <MobileOrderCard key={o.id} order={o} busy={busy} onCancel={onCancelOrder} />)
        ))}
      {filter === 'cancelled' &&
        (groups.cancelled.length === 0 ? (
          <p style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
            No cancelled orders.
          </p>
        ) : (
          groups.cancelled.map((o) => <MobileOrderCard key={o.id} order={o} busy={busy} onCancel={onCancelOrder} />)
        ))}
    </div>
  );
}
