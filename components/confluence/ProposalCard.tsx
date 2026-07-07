'use client';

/**
 * A single pending proposal in the review queue. Shows the agent's thesis and
 * the fundamentals behind it, and gives the owner the three — and only three —
 * actions that exist: Approve, Edit-then-approve, Reject.
 *
 * Approving is the ONLY thing that can lead to an order. The proposal itself is
 * immutable; edits here become the ORDER's parameters and the diff is recorded
 * in the audit log by the backend.
 */

import { useState } from 'react';
import { Check, X, Pencil, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { Proposal, TimeInForce } from '@/types/confluence';

export interface EditState {
  limitPrice: number;
  quantity: number;
  stopPrice?: number;
  targetPrice?: number;
  timeInForce: TimeInForce;
}

interface Props {
  proposal: Proposal;
  perPositionCapUsd: number;
  tradingEnabled: boolean;
  busy: boolean;
  /** Live last trade — the agent priced off the prior close, so show the drift. */
  liveQuote?: { last: number; asOf?: string };
  onApprove: (id: string, edits: EditState) => void;
  onReject: (id: string) => void;
}

const field = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-default)',
} as const;

function numOrUndef(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function ProposalCard({ proposal, perPositionCapUsd, tradingEnabled, busy, onApprove, onReject, liveQuote }: Props) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>({
    limitPrice: proposal.suggestedLimitPrice ?? 0,
    quantity: proposal.suggestedQuantity ?? 0,
    stopPrice: proposal.suggestedStopPrice,
    targetPrice: proposal.suggestedTargetPrice,
    timeInForce: 'gfd',
  });

  const isBuy = proposal.direction === 'buy';
  const DirIcon = isBuy ? TrendingUp : TrendingDown;
  const dirColor = isBuy ? 'var(--positive)' : 'var(--negative)';

  const activeLimit = editing ? edit.limitPrice : proposal.suggestedLimitPrice ?? 0;
  const activeQty = editing ? edit.quantity : proposal.suggestedQuantity ?? 0;
  const notional = (activeLimit || 0) * (activeQty || 0);
  const overCap = notional > perPositionCapUsd;

  // The finalized params sent on approval (agent suggestion unless edited).
  const approvalEdits: EditState = editing
    ? edit
    : {
        limitPrice: proposal.suggestedLimitPrice ?? 0,
        quantity: proposal.suggestedQuantity ?? 0,
        stopPrice: proposal.suggestedStopPrice,
        targetPrice: proposal.suggestedTargetPrice,
        timeInForce: 'gfd',
      };

  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
      {/* Header: symbol + direction + notional */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: isBuy ? 'var(--positive-dim)' : 'var(--negative-dim)' }}
          >
            <DirIcon className="w-4.5 h-4.5" style={{ color: dirColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {proposal.symbol}
              </span>
              <span className="badge" style={{ background: isBuy ? 'var(--positive-dim)' : 'var(--negative-dim)', color: dirColor }}>
                {proposal.direction.toUpperCase()}
              </span>
              {proposal.runId && <span className="badge badge-info">AGENT</span>}
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {new Date(proposal.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums" style={{ color: overCap ? 'var(--negative)' : 'var(--text-primary)' }}>
            ${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>notional</div>
        </div>
      </div>

      {/* Thesis */}
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{proposal.thesis}</p>

      {/* Fundamentals */}
      {proposal.fundamentals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {proposal.fundamentals.map((f, i) => (
            <div key={i} className="rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--text-tertiary)' }} title={f.label}>{f.label}</div>
              <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{f.value}</div>
              {f.hint && <div className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }} title={f.hint}>{f.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Order params — read-only or editable */}
      {!editing ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
          <span>Limit <b style={{ color: 'var(--text-primary)' }}>${proposal.suggestedLimitPrice}</b></span>
          {liveQuote && proposal.suggestedLimitPrice ? (
            <span>
              Last{' '}
              <b style={{ color: 'var(--text-primary)' }}>${liveQuote.last.toFixed(2)}</b>{' '}
              <span
                style={{
                  color:
                    liveQuote.last <= proposal.suggestedLimitPrice ? 'var(--positive)' : 'var(--text-secondary)',
                }}
              >
                ({liveQuote.last <= proposal.suggestedLimitPrice ? 'at/below limit — fills now' : `+${(((liveQuote.last - proposal.suggestedLimitPrice) / proposal.suggestedLimitPrice) * 100).toFixed(1)}% above limit`})
              </span>
            </span>
          ) : null}
          <span>Qty <b style={{ color: 'var(--text-primary)' }}>{proposal.suggestedQuantity}</b></span>
          {proposal.suggestedStopPrice != null && <span>Stop <b style={{ color: 'var(--negative)' }}>${proposal.suggestedStopPrice}</b></span>}
          {proposal.suggestedTargetPrice != null && <span>Target <b style={{ color: 'var(--positive)' }}>${proposal.suggestedTargetPrice}</b></span>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Limit $
            <input type="number" step="0.01" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.limitPrice} onChange={(e) => setEdit({ ...edit, limitPrice: Number(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Qty
            <input type="number" step="1" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Stop $
            <input type="number" step="0.01" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.stopPrice ?? ''} onChange={(e) => setEdit({ ...edit, stopPrice: numOrUndef(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Target $
            <input type="number" step="0.01" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.targetPrice ?? ''} onChange={(e) => setEdit({ ...edit, targetPrice: numOrUndef(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            TIF
            <select className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.timeInForce} onChange={(e) => setEdit({ ...edit, timeInForce: e.target.value as TimeInForce })}>
              <option value="gfd">GFD</option>
              <option value="gtc">GTC</option>
            </select>
          </label>
        </div>
      )}

      {overCap && (
        <div className="flex items-center gap-1.5 text-[11px] mb-3" style={{ color: 'var(--warning)' }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          Exceeds per-position cap of ${perPositionCapUsd.toLocaleString()} — approval will be blocked.
        </div>
      )}
      {!tradingEnabled && (
        <div className="flex items-center gap-1.5 text-[11px] mb-3" style={{ color: 'var(--negative)' }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          Execution is disarmed (kill switch). Arm it in Settings before approving.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
          disabled={busy || overCap || !tradingEnabled}
          onClick={() => onApprove(proposal.id, approvalEdits)}
        >
          <Check className="w-4 h-4" /> Approve{editing ? ' edited' : ''}
        </button>
        <button className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm" disabled={busy} onClick={() => setEditing((v) => !v)}>
          <Pencil className="w-3.5 h-3.5" /> {editing ? 'Cancel edit' : 'Edit'}
        </button>
        <button
          className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm ml-auto disabled:opacity-50"
          style={{ color: 'var(--negative)' }}
          disabled={busy}
          onClick={() => onReject(proposal.id)}
        >
          <X className="w-4 h-4" /> Reject
        </button>
      </div>
    </div>
  );
}
