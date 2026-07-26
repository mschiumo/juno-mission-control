'use client';

/**
 * Desktop top bar: page title + one-line contract, clock, LIVE/PAPER pill,
 * avatar. 60px tall per the handoff spec.
 */

import Link from 'next/link';
import { Clock, ModePill } from './atoms';

interface Props {
  paperMode: boolean;
  tradingEnabled: boolean;
  userInitial: string;
}

export default function TopBar({ paperMode, tradingEnabled, userInitial }: Props) {
  return (
    <div
      className="flex-none flex items-center justify-between"
      style={{ height: 60, borderBottom: '1px solid var(--ct-border)', padding: '0 26px' }}
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ct-text)' }}>
          Agentic Trading
        </span>
        <span className="hidden lg:block truncate" style={{ fontFamily: 'var(--ct-sans)', fontSize: 12.5, color: 'var(--ct-faint)' }}>
          Agent proposes · you approve · service executes
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden lg:block">
          <Clock />
        </span>
        {!tradingEnabled && (
          <span
            className="ct-pill"
            style={{ background: 'var(--ct-neg-bg)', color: 'var(--ct-neg-text)', border: '1px solid var(--ct-neg-border)' }}
            title="Kill switch — execution is disarmed; approvals will not place orders"
          >
            Disarmed
          </span>
        )}
        <ModePill paperMode={paperMode} label={paperMode ? 'PAPER MODE' : 'LIVE MODE'} />
        <Link
          href="/profile"
          className="flex items-center justify-center"
          title="Profile & Settings"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#2a2f36',
            fontFamily: 'var(--ct-sans)',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--ct-text-body)',
          }}
        >
          {userInitial}
        </Link>
      </div>
    </div>
  );
}
