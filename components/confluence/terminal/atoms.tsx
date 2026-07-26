'use client';

/**
 * Small shared pieces of the Agentic Trading page: LIVE/PAPER pill, status
 * pill, danger banner, progress bar.
 */

import type { OrderStatus } from '@/types/confluence';
import { statusPill } from './format';

/** LIVE pill (orange, dotted) vs PAPER pill (dimmed, no dot). */
export function ModePill({ paperMode, label }: { paperMode: boolean; label?: string }) {
  if (paperMode) {
    return (
      <span
        className="inline-flex items-center"
        style={{
          padding: '5px 10px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.06)',
          fontFamily: 'var(--ct-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: 'var(--ct-dimmer)',
        }}
      >
        {label ?? 'PAPER'}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        padding: '5px 10px',
        borderRadius: 999,
        background: 'var(--ct-accent-bg)',
        border: '1px solid var(--ct-accent-border)',
        fontFamily: 'var(--ct-mono)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'var(--ct-accent-text)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ct-accent)', display: 'block' }} />
      {label ?? 'LIVE'}
    </span>
  );
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const s = statusPill(status);
  return (
    <span className="ct-pill" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

/** The danger-banner recipe: round "!" badge + body; optional action link. */
export function DangerBanner({
  children,
  action,
  onAction,
  radius = 10,
  padding = '12px 16px',
}: {
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
  radius?: number;
  padding?: string;
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{ padding, borderRadius: radius, background: 'var(--ct-neg-bg)', border: '1px solid var(--ct-neg-border)' }}
    >
      <span
        className="flex-none flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: 99,
          background: 'var(--ct-neg)',
          color: '#1a0505',
          fontFamily: 'var(--ct-sans)',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        !
      </span>
      <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-neg-text)', lineHeight: 1.5 }}>{children}</span>
      {action && (
        <button
          onClick={onAction}
          className="ml-auto flex-none"
          style={{
            fontFamily: 'var(--ct-sans)',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--ct-neg-text-strong)',
            borderBottom: '1px solid rgba(254,202,202,0.4)',
          }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

/** Progress track + fill. Renders a 2% sliver at 0 so the bar never looks broken. */
export function ProgressBar({ pct, fill, height = 5 }: { pct: number | null; fill: string; height?: number }) {
  const width = pct == null ? 0 : Math.max(2, pct);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ height, borderRadius: 999, background: 'var(--ct-track)', overflow: 'hidden' }}
    >
      <div className="ct-progress-fill" style={{ width: `${width}%`, background: fill }} />
    </div>
  );
}

