'use client';

/**
 * Small shared pieces of the Agentic Trading terminal: wordmark, LIVE/PAPER
 * pill, status pill, danger banner, progress bar, ticking clock.
 */

import { useEffect, useState } from 'react';
import type { OrderStatus } from '@/types/confluence';
import { statusPill } from './format';

/** The app's chevron mark in the terminal's orange rounded square. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center flex-none"
      style={{ width: size, height: size, borderRadius: 8, background: 'var(--ct-accent)' }}
    >
      <svg viewBox="0 0 48 48" fill="none" style={{ width: size * 0.55, height: size * 0.55 }}>
        <line x1="7" y1="13" x2="24" y2="24" stroke="#0b0b0b" strokeWidth="5" strokeLinecap="round" />
        <line x1="7" y1="35" x2="24" y2="24" stroke="#0b0b0b" strokeWidth="5" strokeLinecap="round" />
        <line x1="24" y1="24" x2="41" y2="24" stroke="#0b0b0b" strokeWidth="5" strokeLinecap="round" />
        <circle cx="24" cy="24" r="3" fill="#0b0b0b" />
      </svg>
    </div>
  );
}

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

/** "11:51:40 · Sun Jul 26 EST" — ticks every second, isolated so only it re-renders. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const time = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return (
    <span className="ct-num" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ct-dimmer)' }}>
      {time} · {date} EST
    </span>
  );
}
