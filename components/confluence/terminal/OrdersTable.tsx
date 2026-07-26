'use client';

/**
 * Desktop orders surface: a CSS-grid table grouped by lifecycle —
 * Working (bright, actionable) → Filled (dimmed) → Cancelled (collapsed
 * behind "Show all"). Cancel requires an inline in-row confirmation.
 */

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ExecutionOrder } from '@/types/confluence';
import { ACTIVE_ORDER_STATUSES } from '@/types/confluence';
import { StatusPill } from './atoms';
import { groupOrders, maskAcct, money, type OrderGroup } from './format';

interface Props {
  orders: ExecutionOrder[];
  account?: string;
  busy: boolean;
  onRefresh: () => void;
  onCancel: (id: string) => void;
}

const numCell = (color: string): React.CSSProperties => ({
  textAlign: 'right',
  fontFamily: 'var(--ct-mono)',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 13,
  fontWeight: 500,
  color,
});

function OrderRow({
  order,
  dimmed,
  busy,
  cancelling,
  confirming,
  onAskCancel,
  onConfirmCancel,
  onKeep,
}: {
  order: ExecutionOrder;
  dimmed: boolean;
  busy: boolean;
  cancelling: boolean;
  confirming: boolean;
  onAskCancel: () => void;
  onConfirmCancel: () => void;
  onKeep: () => void;
}) {
  const cancelable = ACTIVE_ORDER_STATUSES.includes(order.status);
  const isStop = order.kind === 'protective_stop';
  const price = isStop ? (order.stopPrice ?? order.limitPrice) : order.limitPrice;
  return (
    <div
      className="ct-ordergrid hover:bg-white/[0.025]"
      style={{ borderBottom: '1px solid var(--ct-border-row)', background: dimmed ? 'rgba(255,255,255,0.015)' : undefined }}
    >
      <span className="flex items-center gap-1.5" style={{ fontFamily: 'var(--ct-sans)', fontSize: 13.5, fontWeight: 600, color: dimmed ? 'var(--ct-muted)' : 'var(--ct-text)' }}>
        {order.symbol}
        {isStop && (
          <span
            style={{
              padding: '2px 5px',
              borderRadius: 4,
              background: 'var(--ct-info-bg)',
              color: 'var(--ct-info)',
              fontFamily: 'var(--ct-mono)',
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
            }}
            title="Protective stop — placed automatically at the approved stop price after the entry filled"
          >
            STOP
          </span>
        )}
      </span>
      <span
        style={{
          fontFamily: 'var(--ct-mono)',
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: order.side === 'buy' ? 'var(--ct-pos)' : 'var(--ct-neg)',
        }}
      >
        {order.side.toUpperCase()}
      </span>
      <span style={numCell(dimmed ? 'var(--ct-muted)' : 'var(--ct-text-body)')}>{money(price)}</span>
      <span style={numCell('var(--ct-muted)')}>{order.quantity}</span>
      <span style={numCell(order.filledQuantity > 0 ? 'var(--ct-pos-text)' : 'var(--ct-faint)')}>{order.filledQuantity}</span>
      <span style={numCell(order.avgFillPrice != null ? 'var(--ct-muted)' : 'var(--ct-ghost)')}>
        {order.avgFillPrice != null ? money(order.avgFillPrice) : '—'}
      </span>
      <span className="ct-num" style={{ textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--ct-dimmer)' }}>
        {order.timeInForce.toUpperCase()}
      </span>
      <span className="flex justify-center">
        <StatusPill status={order.status} />
      </span>
      <span className="flex justify-end">
        {cancelable && !confirming && (
          <button
            onClick={onAskCancel}
            disabled={busy}
            className="disabled:opacity-50"
            style={{
              padding: '5px 10px',
              borderRadius: 7,
              border: '1px solid rgba(248,113,113,0.33)',
              color: 'var(--ct-neg-text)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {cancelling ? '…' : 'Cancel'}
          </button>
        )}
        {cancelable && confirming && (
          <span className="flex items-center gap-1.5 whitespace-nowrap" style={{ fontFamily: 'var(--ct-sans)', fontSize: 11 }}>
            <button onClick={onConfirmCancel} disabled={busy} style={{ color: 'var(--ct-neg-text)', fontWeight: 600 }}>
              Confirm
            </button>
            <span style={{ color: 'var(--ct-ghost)' }}>·</span>
            <button onClick={onKeep} style={{ color: 'var(--ct-dim)', fontWeight: 600 }}>
              Keep
            </button>
          </span>
        )}
      </span>
    </div>
  );
}

export default function OrdersTable({ orders, account, busy, onRefresh, onCancel }: Props) {
  const [filter, setFilter] = useState<OrderGroup>('working');
  const [showCancelled, setShowCancelled] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const groups = groupOrders(orders);

  const handleConfirmCancel = (id: string) => {
    setConfirmingId(null);
    setCancellingId(id);
    onCancel(id);
  };

  const chip = (id: OrderGroup, label: string, count: number) => (
    <button
      key={id}
      className={`ct-chip ${filter === id ? 'active' : ''}`}
      style={{ padding: '6px 11px', borderRadius: 7, fontSize: 11.5 }}
      onClick={() => {
        setFilter(id);
        setShowCancelled(id === 'cancelled');
      }}
    >
      {label} <span className="ct-num" style={{ fontSize: 11, fontWeight: 600 }}>{count}</span>
    </button>
  );

  const headerCols = (
    <div
      className="ct-ordergrid"
      style={{
        padding: '9px 18px',
        borderBottom: '1px solid var(--ct-border-row)',
        fontFamily: 'var(--ct-mono)',
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'var(--ct-label)',
      }}
    >
      <span>SYMBOL</span>
      <span>SIDE</span>
      <span style={{ textAlign: 'right' }}>PRICE</span>
      <span style={{ textAlign: 'right' }}>QTY</span>
      <span style={{ textAlign: 'right' }}>FILL</span>
      <span style={{ textAlign: 'right' }}>AVG FILL</span>
      <span style={{ textAlign: 'center' }}>TIF</span>
      <span style={{ textAlign: 'center' }}>STATUS</span>
      <span />
    </div>
  );

  const rowFor = (o: ExecutionOrder, dimmed: boolean) => (
    <OrderRow
      key={o.id}
      order={o}
      dimmed={dimmed}
      busy={busy}
      cancelling={cancellingId === o.id && busy}
      confirming={confirmingId === o.id}
      onAskCancel={() => setConfirmingId(o.id)}
      onConfirmCancel={() => handleConfirmCancel(o.id)}
      onKeep={() => setConfirmingId(null)}
    />
  );

  const showWorking = filter === 'working';
  const showFilled = filter === 'working' || filter === 'filled';
  const cancelledVisible = filter === 'cancelled' || showCancelled;

  return (
    <div className="min-w-0" style={{ borderRadius: 12, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)', overflow: 'hidden' }}>
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: '15px 18px', borderBottom: '1px solid var(--ct-border-row)' }}>
        <div className="flex items-baseline gap-2.5">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 14, fontWeight: 600, color: 'var(--ct-text)' }}>Orders</span>
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 12, color: 'var(--ct-faint)' }}>
            {orders.length} total · acct {maskAcct(account)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {chip('working', 'Working', groups.working.length)}
          {chip('filled', 'Filled', groups.filled.length)}
          {chip('cancelled', 'Cancelled', groups.cancelled.length)}
          <button
            className="flex items-center gap-1.5 disabled:opacity-50"
            style={{
              marginLeft: 6,
              padding: '6px 11px',
              borderRadius: 7,
              border: '1px solid var(--ct-border-strong)',
              color: 'var(--ct-muted)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 11.5,
              fontWeight: 500,
            }}
            onClick={onRefresh}
            disabled={busy}
          >
            <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <p style={{ padding: '40px 18px', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
          No orders yet. Approve a proposal to stage one.
        </p>
      ) : (
        <>
          {headerCols}

          {showWorking && groups.working.length === 0 && (
            <p style={{ padding: '40px 18px', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
              No working orders.
            </p>
          )}
          {showWorking && groups.working.map((o) => rowFor(o, false))}

          {showFilled && groups.filled.length > 0 && (
            <>
              {filter === 'working' && (
                <div className="ct-eyebrow" style={{ fontSize: 9.5, padding: '12px 18px 8px', background: 'rgba(255,255,255,0.015)' }}>
                  FILLED · {groups.filled.length}
                </div>
              )}
              {groups.filled.map((o) => rowFor(o, true))}
            </>
          )}

          {cancelledVisible && groups.cancelled.length > 0 && (
            <>
              {filter !== 'cancelled' && (
                <div className="ct-eyebrow" style={{ fontSize: 9.5, padding: '12px 18px 8px', background: 'rgba(255,255,255,0.015)' }}>
                  CANCELLED · {groups.cancelled.length}
                </div>
              )}
              {groups.cancelled.map((o) => rowFor(o, true))}
            </>
          )}

          {filter === 'working' && groups.cancelled.length > 0 && (
            <div className="flex items-center justify-between" style={{ padding: '13px 18px' }}>
              <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 12, color: 'var(--ct-faint)' }}>
                {showCancelled
                  ? `${groups.cancelled.length} cancelled ${groups.cancelled.length === 1 ? 'order' : 'orders'} shown`
                  : `${groups.cancelled.length} cancelled ${groups.cancelled.length === 1 ? 'order' : 'orders'} hidden`}
              </span>
              <button
                onClick={() => setShowCancelled((v) => !v)}
                style={{
                  fontFamily: 'var(--ct-sans)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--ct-dim)',
                  borderBottom: '1px solid rgba(169,176,185,0.3)',
                }}
              >
                {showCancelled ? 'Hide' : 'Show all'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
