'use client';

/**
 * A single pending proposal in the review queue. Shows the agent's thesis and
 * the fundamentals behind it, and gives the owner the three — and only three —
 * actions that exist: Approve, Edit-then-approve, Reject.
 *
 * Approving is the ONLY thing that can lead to an order. Editing changes the
 * numbers sent on approval; the backend records the diff in the audit trail.
 */

import { useState } from 'react';
import { Check, X, Pencil, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { Proposal } from '@/types/confluence';

interface Props {
  proposal: Proposal;
  perPositionCapUsd: number;
  busy: boolean;
  onApprove: (id: string, edits: EditState | null, note?: string) => void;
  onReject: (id: string, note?: string) => void;
}

export interface EditState {
  suggestedLimitPrice: number;
  suggestedShares: number;
  stopPrice?: number;
  targetPrice?: number;
  timeInForce: 'day' | 'gtc';
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

export default function ProposalCard({ proposal, perPositionCapUsd, busy, onApprove, onReject }: Props) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>({
    suggestedLimitPrice: proposal.suggestedLimitPrice,
    suggestedShares: proposal.suggestedShares,
    stopPrice: proposal.stopPrice,
    targetPrice: proposal.targetPrice,
    timeInForce: proposal.timeInForce,
  });

  const isBuy = proposal.direction === 'buy';
  const DirIcon = isBuy ? TrendingUp : TrendingDown;
  const dirColor = isBuy ? 'var(--positive)' : 'var(--negative)';

  const activeLimit = editing ? edit.suggestedLimitPrice : proposal.suggestedLimitPrice;
  const activeShares = editing ? edit.suggestedShares : proposal.suggestedShares;
  const notional = (activeLimit || 0) * (activeShares || 0);
  const overCap = notional > perPositionCapUsd;

  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
      {/* Header: ticker + direction + notional */}
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
                {proposal.ticker}
              </span>
              <span
                className="badge"
                style={{ background: isBuy ? 'var(--positive-dim)' : 'var(--negative-dim)', color: dirColor }}
              >
                {proposal.direction.toUpperCase()}
              </span>
              {proposal.source === 'agent' && (
                <span className="badge badge-info">AGENT</span>
              )}
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
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            notional
          </div>
        </div>
      </div>

      {/* Thesis */}
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        {proposal.thesis}
      </p>

      {/* Fundamentals */}
      {proposal.fundamentals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {proposal.fundamentals.map((f, i) => (
            <div key={i} className="rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--text-tertiary)' }} title={f.label}>
                {f.label}
              </div>
              <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {f.value}
              </div>
              {f.hint && (
                <div className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }} title={f.hint}>
                  {f.hint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Order params — read-only or editable */}
      {!editing ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
          <span>Limit <b style={{ color: 'var(--text-primary)' }}>${proposal.suggestedLimitPrice}</b></span>
          <span>Size <b style={{ color: 'var(--text-primary)' }}>{proposal.suggestedShares}</b> sh</span>
          {proposal.stopPrice != null && <span>Stop <b style={{ color: 'var(--negative)' }}>${proposal.stopPrice}</b></span>}
          {proposal.targetPrice != null && <span>Target <b style={{ color: 'var(--positive)' }}>${proposal.targetPrice}</b></span>}
          <span>TIF <b style={{ color: 'var(--text-primary)' }}>{proposal.timeInForce.toUpperCase()}</b></span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Limit $
            <input type="number" step="0.01" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.suggestedLimitPrice}
              onChange={(e) => setEdit({ ...edit, suggestedLimitPrice: Number(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Shares
            <input type="number" step="1" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.suggestedShares}
              onChange={(e) => setEdit({ ...edit, suggestedShares: Number(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Stop $
            <input type="number" step="0.01" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.stopPrice ?? ''}
              onChange={(e) => setEdit({ ...edit, stopPrice: numOrUndef(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Target $
            <input type="number" step="0.01" className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.targetPrice ?? ''}
              onChange={(e) => setEdit({ ...edit, targetPrice: numOrUndef(e.target.value) })} />
          </label>
          <label className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            TIF
            <select className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm" style={field}
              value={edit.timeInForce}
              onChange={(e) => setEdit({ ...edit, timeInForce: e.target.value as 'day' | 'gtc' })}>
              <option value="day">DAY</option>
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

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
          disabled={busy || overCap}
          onClick={() => onApprove(proposal.id, editing ? edit : null)}
        >
          <Check className="w-4 h-4" /> Approve{editing ? ' edited' : ''}
        </button>
        <button
          className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm"
          disabled={busy}
          onClick={() => setEditing((v) => !v)}
        >
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
