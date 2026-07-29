'use client';

/**
 * Desktop right rail (360px): the Next-proposals preview with the single
 * orange CTA. (Positions moved to their own sub-tab.)
 */

import type { Proposal } from '@/types/confluence';
import { money, proposalNotional, proposalTitle, rMultiple } from './format';

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
