'use client';

/**
 * Desktop right rail (360px): live Positions (same component family as the
 * mobile position card, desktop density) and the Next-proposals preview with
 * the single orange CTA.
 */

import type { Proposal } from '@/types/confluence';
import type { LivePosition } from '../OrdersMonitor';
import { ProgressBar } from './atoms';
import { money, pctColors, pctToTarget, proposalNotional, proposalTitle, rMultiple } from './format';

export function PositionRow({ position, dense }: { position: LivePosition; dense?: boolean }) {
  const pct = pctToTarget(position);
  const colors = pctColors(pct);
  return (
    <div className="flex flex-col" style={{ gap: 9 }}>
      <div className="flex items-baseline justify-between">
        <span className="flex items-baseline gap-2">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: dense ? 14.5 : 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ct-text)' }}>
            {position.symbol}
          </span>
          <span className="ct-num" style={{ fontSize: dense ? 11 : 11.5, color: 'var(--ct-label)' }}>
            {position.quantity} @ {position.avgCost != null ? money(position.avgCost) : '—'}
          </span>
        </span>
        <span
          className="ct-num"
          style={{ fontSize: dense ? 12.5 : 13, fontWeight: 600, color: colors.text }}
          aria-label={`${position.symbol}, ${pct ?? 0} percent to target`}
        >
          {pct != null ? `${pct}%${dense ? '' : ' to target'}` : '—'}
        </span>
      </div>
      <ProgressBar pct={pct} fill={colors.fill} height={dense ? 4 : 5} />
      <div className="flex justify-between ct-num" style={{ fontSize: dense ? 11 : 11.5, fontWeight: 500 }}>
        {position.stop?.stopPrice != null ? (
          <span style={{ color: 'var(--ct-neg)' }}>stop {money(position.stop.stopPrice)}</span>
        ) : (
          <span style={{ color: 'var(--ct-neg)', fontWeight: 600 }}>NO STOP</span>
        )}
        <span style={{ color: 'var(--ct-dimmer)' }}>
          {position.target != null ? `${dense ? 'tgt' : 'target'} ${money(position.target)}` : '—'}
        </span>
      </div>
    </div>
  );
}

export function PositionsPanel({ positions, note, connected }: { positions: LivePosition[]; note?: string; connected: boolean }) {
  return (
    <div style={{ borderRadius: 12, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)', overflow: 'hidden' }}>
      <div className="flex items-baseline gap-2" style={{ padding: '15px 16px', borderBottom: '1px solid var(--ct-border-row)' }}>
        <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 14, fontWeight: 600, color: 'var(--ct-text)' }}>Positions</span>
        <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 11.5, color: connected ? 'var(--ct-faint)' : 'var(--ct-neg-text)' }}>
          {connected ? 'live · Robinhood' : 'reconnecting…'}
        </span>
      </div>
      {positions.length === 0 ? (
        <p style={{ padding: '28px 16px', textAlign: 'center', fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
          {note ?? 'No open positions in the agentic account.'}
        </p>
      ) : (
        positions.map((p, i) => (
          <div key={p.symbol} style={{ padding: '14px 16px', borderBottom: i < positions.length - 1 ? '1px solid var(--ct-border-row)' : undefined }}>
            <PositionRow position={p} dense />
          </div>
        ))
      )}
    </div>
  );
}

export function NextProposalsPanel({
  proposals,
  buyingPower,
  onReview,
}: {
  proposals: Proposal[];
  buyingPower: number | null;
  onReview: () => void;
}) {
  const preview = proposals.slice(0, 2);
  return (
    <div className="flex flex-col gap-3" style={{ borderRadius: 12, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)', padding: '15px 16px' }}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 14, fontWeight: 600, color: 'var(--ct-text)' }}>Next proposals</span>
        {proposals.length > 0 && (
          <span
            className="ct-num flex items-center justify-center"
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 99,
              background: 'var(--ct-accent)',
              color: 'var(--ct-accent-fg)',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {proposals.length}
          </span>
        )}
      </div>
      {proposals.length === 0 ? (
        <p style={{ fontFamily: 'var(--ct-sans)', fontSize: 12.5, color: 'var(--ct-faint)' }}>
          The agent has nothing to propose.
        </p>
      ) : (
        <>
          {preview.map((p) => {
            const notional = proposalNotional(p);
            const blocked = buyingPower != null && notional > buyingPower;
            const r = rMultiple(p);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between"
                style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.035)' }}
              >
                <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, fontWeight: 600, color: 'var(--ct-text-body)' }}>
                  {proposalTitle(p)}
                </span>
                <span className="ct-num" style={{ fontSize: 12, fontWeight: 500, color: blocked ? 'var(--ct-neg)' : 'var(--ct-dimmer)' }}>
                  {blocked ? `blocked · ${money(notional)}` : `${money(notional)}${r != null ? ` · ${r}R` : ''}`}
                </span>
              </div>
            );
          })}
          <button
            onClick={onReview}
            className="flex items-center justify-center"
            style={{
              height: 42,
              borderRadius: 10,
              background: 'var(--ct-accent)',
              color: 'var(--ct-accent-fg)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Review {proposals.length} {proposals.length === 1 ? 'proposal' : 'proposals'}
          </button>
        </>
      )}
    </div>
  );
}
