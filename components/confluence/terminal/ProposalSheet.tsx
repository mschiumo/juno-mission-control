'use client';

/**
 * Mobile proposal approval bottom sheet — the single most important mobile
 * action. One proposal at a time; horizontal swipe (or Skip) advances through
 * the queue. Approve sends the agent's suggested parameters unchanged; edits
 * remain a desktop affordance.
 */

import { useEffect, useRef, useState } from 'react';
import type { Proposal } from '@/types/confluence';
import { DangerBanner } from './atoms';
import { money, proposalNotional, proposalTitle, rMultiple } from './format';

interface Props {
  proposals: Proposal[];
  index: number;
  buyingPower: number | null;
  tradingEnabled: boolean;
  busy: boolean;
  onIndexChange: (i: number) => void;
  onApprove: (p: Proposal) => void;
  onClose: () => void;
}

export default function ProposalSheet({ proposals, index, buyingPower, tradingEnabled, busy, onIndexChange, onApprove, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [closing, setClosing] = useState(false);

  const proposal = proposals[Math.min(index, proposals.length - 1)];

  // Modal focus + Esc-to-close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  if (!proposal) return null;

  const notional = proposalNotional(proposal);
  const blocked = buyingPower != null && notional > buyingPower;
  const remaining = buyingPower != null ? buyingPower - notional : null;
  const r = rMultiple(proposal);
  const isBuy = proposal.direction === 'buy';

  const advance = (delta: number) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= proposals.length) {
      onClose();
      return;
    }
    onIndexChange(next);
  };

  const metric = (label: string, value: string, color: string) => (
    <div style={{ background: 'var(--ct-surface-2)', padding: '13px 14px' }}>
      <div className="ct-eyebrow" style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div className="ct-num" style={{ fontSize: 17, fontWeight: 600, color }}>{value}</div>
    </div>
  );

  const strategyLabel = proposal.strategyId ? proposal.strategyId.replace(/[-_]/g, ' ') : proposal.runId ? 'agent screen' : 'manual seed';

  return (
    <div className="absolute inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`Proposal: ${proposalTitle(proposal)}`}>
      {/* Scrim */}
      <div className="ct-scrim absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`${closing ? '' : 'ct-sheet'} relative flex flex-col outline-none`}
        style={{
          borderRadius: '28px 28px 0 0',
          background: 'var(--ct-surface)',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          padding: '12px 20px 26px',
          gap: 16,
          maxHeight: '88%',
          overflowY: 'auto',
          paddingBottom: 'max(26px, env(safe-area-inset-bottom))',
        }}
        onTouchStart={(e) => {
          touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          // Horizontal swipe advances the queue; a decisive downward drag dismisses.
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            advance(dx < 0 ? 1 : -1);
          } else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) {
            setClosing(true);
            onClose();
          }
        }}
      >
        {/* Grab handle */}
        <div className="self-center flex-none" style={{ width: 38, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.18)' }} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col" style={{ gap: 5 }}>
            <span className="ct-eyebrow" style={{ color: 'var(--ct-accent-text)' }}>
              PROPOSAL {index + 1} OF {proposals.length}
            </span>
            <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ct-text)' }}>
              {proposalTitle(proposal)}
            </span>
          </div>
          <span
            className="whitespace-nowrap"
            style={{
              padding: '6px 11px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ct-muted)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 11.5,
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {strategyLabel}
          </span>
        </div>

        {/* Metric grid */}
        <div
          className="grid grid-cols-2"
          style={{ gap: 1, background: 'var(--ct-border)', borderRadius: 13, overflow: 'hidden' }}
        >
          {metric('LIMIT', money(proposal.suggestedLimitPrice), 'var(--ct-text)')}
          {metric('NOTIONAL', money(notional), 'var(--ct-text)')}
          {metric('STOP', proposal.suggestedStopPrice != null ? money(proposal.suggestedStopPrice) : '—', 'var(--ct-neg)')}
          {metric(
            'TARGET · R',
            proposal.suggestedTargetPrice != null ? `${money(proposal.suggestedTargetPrice)}${r != null ? ` · ${r}R` : ''}` : '—',
            'var(--ct-pos)',
          )}
        </div>

        {/* Thesis */}
        {proposal.thesis && (
          <p style={{ fontFamily: 'var(--ct-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ct-muted)', margin: 0 }}>
            {proposal.thesis}
          </p>
        )}

        {/* Fundamentals chips */}
        {proposal.fundamentals.length > 0 && (
          <div className="flex flex-col" style={{ gap: 9 }}>
            <span className="ct-eyebrow">FUNDAMENTALS</span>
            <div className="flex flex-wrap" style={{ gap: 7 }}>
              {proposal.fundamentals.map((f, i) => (
                <span
                  key={i}
                  title={f.hint}
                  style={{
                    padding: '7px 11px',
                    borderRadius: 8,
                    background: 'rgba(52,211,153,0.10)',
                    border: '1px solid rgba(52,211,153,0.22)',
                    color: 'var(--ct-pos-text)',
                    fontFamily: 'var(--ct-sans)',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {f.label} <span className="ct-num" style={{ fontWeight: 600 }}>{f.value}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Risk note — always states post-trade buying power in words */}
        {!tradingEnabled ? (
          <DangerBanner radius={11} padding="11px 13px">
            Execution is disarmed (kill switch). Arm it in Settings before approving.
          </DangerBanner>
        ) : blocked ? (
          <DangerBanner radius={11} padding="11px 13px">
            Order notional <b className="ct-num" style={{ fontWeight: 600 }}>{money(notional)}</b> exceeds buying power{' '}
            <b className="ct-num" style={{ fontWeight: 600 }}>{money(buyingPower)}</b> — approval is blocked. Resize it on desktop.
          </DangerBanner>
        ) : buyingPower != null ? (
          <div
            className="flex items-center gap-2.5"
            style={{
              padding: '11px 13px',
              borderRadius: 11,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 12, lineHeight: 1.45, color: 'var(--ct-muted)' }}>
              Buying power <b className="ct-num" style={{ fontWeight: 600 }}>{money(buyingPower)}</b> — clears, leaves{' '}
              <b className="ct-num" style={{ fontWeight: 600 }}>{money(remaining)}</b> free.
            </span>
          </div>
        ) : null}

        {/* Actions — 2:1 ratio; approval is the expected path but never accidental */}
        <div className="flex" style={{ gap: 10, paddingTop: 2 }}>
          <button
            className="flex-1 flex items-center justify-center"
            style={{
              height: 50,
              borderRadius: 12,
              border: '1px solid var(--ct-border-strong)',
              color: 'var(--ct-muted)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 14,
              fontWeight: 600,
            }}
            onClick={() => advance(1)}
          >
            Skip
          </button>
          <button
            className="flex-[2] flex items-center justify-center"
            style={{
              height: 50,
              borderRadius: 12,
              background: 'var(--ct-accent)',
              color: 'var(--ct-accent-fg)',
              fontFamily: 'var(--ct-sans)',
              fontSize: 14.5,
              fontWeight: 700,
              opacity: blocked || !tradingEnabled || busy ? 0.4 : 1,
              pointerEvents: blocked || !tradingEnabled || busy ? 'none' : undefined,
            }}
            disabled={blocked || !tradingEnabled || busy}
            onClick={() => onApprove(proposal)}
          >
            {busy ? 'Sending…' : 'Approve & send'}
          </button>
        </div>

        {proposals.length > 1 && (
          <span className="self-center ct-num" style={{ fontSize: 11, color: 'var(--ct-ghost)' }}>
            Swipe for next proposal
          </span>
        )}
      </div>
    </div>
  );
}
