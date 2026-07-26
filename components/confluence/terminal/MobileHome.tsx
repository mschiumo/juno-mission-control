'use client';

/**
 * Mobile home — the glance screen ("am I in danger, and is anything close to
 * target?"): KPI pair, risk banner when a proposal is blocked, and the
 * Positions / Orders sub-tabs. No tables on mobile — everything is a card.
 */

import { useState } from 'react';
import type { ExecutionOrder } from '@/types/confluence';
import { ACTIVE_ORDER_STATUSES } from '@/types/confluence';
import type { LivePosition } from '../OrdersMonitor';
import { DangerBanner, ProgressBar, StatusPill } from './atoms';
import { groupOrders, maskAcct, money, openRisk, pctColors, pctToTarget, type OrderGroup } from './format';

interface Props {
  positions: LivePosition[];
  positionsNote?: string;
  orders: ExecutionOrder[];
  account?: string;
  buyingPower: number | null;
  blockedCount: number;
  blockedNotional: number | null;
  busy: boolean;
  onReviewProposal: () => void;
  onCancelOrder: (id: string) => void;
}

function MobilePositionCard({ position }: { position: LivePosition }) {
  const pct = pctToTarget(position);
  const colors = pctColors(pct);
  return (
    <div
      className="flex flex-col"
      style={{ padding: 14, borderRadius: 14, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)', gap: 11 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ct-text)' }}>
            {position.symbol}
          </span>
          <span className="ct-num" style={{ fontSize: 11.5, color: 'var(--ct-label)' }}>
            {position.quantity} @ {position.avgCost != null ? money(position.avgCost) : '—'}
          </span>
        </div>
        <span className="ct-num" style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
          {pct != null ? `${pct}% to target` : 'no target'}
        </span>
      </div>
      <ProgressBar pct={pct} fill={colors.fill} />
      <div className="flex justify-between ct-num" style={{ fontSize: 11.5, fontWeight: 500 }}>
        {position.stop?.stopPrice != null ? (
          <span style={{ color: 'var(--ct-neg)' }}>stop {money(position.stop.stopPrice)}</span>
        ) : (
          <span style={{ color: 'var(--ct-neg)', fontWeight: 600 }}>NO STOP</span>
        )}
        <span style={{ color: 'var(--ct-dimmer)' }}>
          {position.target != null ? `target ${money(position.target)}` : '—'}
        </span>
      </div>
    </div>
  );
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

export default function MobileHome({
  positions,
  positionsNote,
  orders,
  account,
  buyingPower,
  blockedCount,
  blockedNotional,
  busy,
  onReviewProposal,
  onCancelOrder,
}: Props) {
  const [view, setView] = useState<'positions' | 'orders'>('positions');
  const [filter, setFilter] = useState<OrderGroup>('working');
  const groups = groupOrders(orders);
  const risk = openRisk(positions);
  const constrained = blockedCount > 0;

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

  return (
    <div className="flex flex-col" style={{ padding: '0 20px' }}>
      {view === 'positions' && (
        <div className="flex flex-col" style={{ gap: 14, paddingBottom: 14 }}>
          {/* KPI pair */}
          <div className="grid grid-cols-2" style={{ gap: 10 }}>
            <div style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}>
              <div className="ct-eyebrow" style={{ fontWeight: 500, letterSpacing: '0.09em', marginBottom: 7 }}>OPEN RISK</div>
              <div className="ct-num" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ct-text)' }}>
                {risk != null ? money(risk) : '—'}
              </div>
            </div>
            <div
              style={{
                padding: '13px 14px',
                borderRadius: 14,
                background: 'var(--ct-surface)',
                border: `1px solid ${constrained ? 'rgba(248,113,113,0.28)' : 'var(--ct-border)'}`,
              }}
            >
              <div className="ct-eyebrow" style={{ fontWeight: 500, letterSpacing: '0.09em', marginBottom: 7 }}>BUYING POWER</div>
              <div className="ct-num" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: constrained ? 'var(--ct-neg)' : 'var(--ct-text)' }}>
                {buyingPower != null ? money(buyingPower) : '—'}
              </div>
            </div>
          </div>

          {/* Risk banner — only when a proposal is blocked */}
          {constrained && blockedNotional != null && (
            <DangerBanner radius={13} padding="12px 13px" action="Review proposal" onAction={onReviewProposal}>
              Order notional <b className="ct-num" style={{ fontWeight: 600 }}>{money(blockedNotional)}</b> exceeds buying power.{' '}
              {blockedCount} {blockedCount === 1 ? 'proposal' : 'proposals'} blocked.
            </DangerBanner>
          )}
        </div>
      )}

      {view === 'orders' && (
        <div className="flex items-center justify-between" style={{ padding: '2px 0 12px' }}>
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ct-text)' }}>
            Orders
          </span>
          <span className="ct-num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ct-dimmer)' }}>acct {maskAcct(account)}</span>
        </div>
      )}

      {/* Positions / Orders sub-tabs */}
      <div className="flex" style={{ gap: 22, borderBottom: '1px solid var(--ct-border)', marginBottom: 14 }}>
        {(['positions', 'orders'] as const).map((v) => {
          const active = view === v;
          const count = v === 'positions' ? positions.length : orders.length;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                paddingBottom: 11,
                fontFamily: 'var(--ct-sans)',
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--ct-text)' : 'var(--ct-faint)',
                borderBottom: active ? '2px solid var(--ct-accent)' : '2px solid transparent',
              }}
            >
              {v === 'positions' ? 'Positions' : 'Orders'}{' '}
              <span className="ct-num" style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--ct-dimmer)' : undefined }}>{count}</span>
            </button>
          );
        })}
      </div>

      {view === 'positions' ? (
        <div className="flex flex-col" style={{ gap: 10, paddingBottom: 20 }}>
          {positions.length === 0 ? (
            <p style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
              {positionsNote ?? 'No open positions in the agentic account.'}
            </p>
          ) : (
            positions.map((p) => <MobilePositionCard key={p.symbol} position={p} />)
          )}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 9, paddingBottom: 20 }}>
          {/* Filter chips */}
          <div className="flex overflow-x-auto" style={{ gap: 7, paddingBottom: 5, marginBottom: 4 }}>
            {chip('working', 'Working', groups.working.length)}
            {chip('filled', 'Filled', groups.filled.length)}
            {chip('cancelled', 'Cancelled', groups.cancelled.length)}
          </div>

          {filter === 'working' && (
            <>
              <div className="ct-eyebrow" style={{ padding: '2px 0 3px' }}>
                {protectiveOnly ? 'WORKING — PROTECTIVE STOPS' : 'WORKING'}
              </div>
              {groups.working.length === 0 ? (
                <p style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
                  No working orders.{' '}
                  {positions.filter((p) => p.stop).length > 0
                    ? `${positions.filter((p) => p.stop).length} ${positions.filter((p) => p.stop).length === 1 ? 'position is' : 'positions are'} protected.`
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
      )}
    </div>
  );
}
