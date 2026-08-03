'use client';

/**
 * BrokerageConnectedBanner
 *
 * On-screen confirmation shown after returning from the SnapTrade Connection
 * Portal (see app/brokerage/connected/page.tsx, which redirects here with the
 * sync result in the query string). It reports how many trades the first pull
 * actually wrote, so "connected" is never confused with "data arrived" — a
 * successful link with an empty first sync is the normal case when SnapTrade is
 * still backfilling brokerage history.
 *
 * The query params are stripped once read so a refresh doesn't replay it.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Clock, X } from 'lucide-react';

type Kind = 'connected' | 'error' | 'partial';

export default function BrokerageConnectedBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read the one-shot result during the first render rather than in an effect —
  // the params are stripped immediately afterwards, so this must not depend on
  // a second render to latch.
  const [state, setState] = useState<{
    kind: Kind;
    synced: number;
    cleared: number;
    name: string;
    reason: string;
  } | null>(() => {
    const brokerage = searchParams.get('brokerage');
    if (brokerage !== 'connected' && brokerage !== 'error' && brokerage !== 'partial') return null;
    return {
      kind: brokerage,
      synced: Number(searchParams.get('synced') ?? 0),
      cleared: Number(searchParams.get('cleared') ?? 0),
      name: searchParams.get('name') ?? '',
      reason: searchParams.get('reason') ?? '',
    };
  });

  const strippedParams = useRef(false);

  useEffect(() => {
    if (!state || strippedParams.current) return;
    strippedParams.current = true;
    // Drop the one-shot params but keep the tab/subtab the user landed on, so
    // a refresh doesn't replay the banner.
    const next = new URLSearchParams(searchParams.toString());
    for (const k of ['brokerage', 'synced', 'cleared', 'name', 'reason']) next.delete(k);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [state, searchParams, router, pathname]);

  if (!state) return null;

  const broker = state.name || 'Your brokerage';

  const tone =
    state.kind === 'connected'
      ? { border: '#3fb950', bg: 'rgba(63,185,80,0.08)', color: '#3fb950', Icon: CheckCircle2 }
      : state.kind === 'partial'
      ? { border: '#d29922', bg: 'rgba(210,153,34,0.08)', color: '#d29922', Icon: Clock }
      : { border: '#f85149', bg: 'rgba(248,81,73,0.08)', color: '#f85149', Icon: AlertTriangle };

  const { Icon } = tone;

  const headline =
    state.kind === 'connected'
      ? state.synced > 0
        ? `${broker} connected — ${state.synced} trade${state.synced === 1 ? '' : 's'} synced`
        : `${broker} connected`
      : state.kind === 'partial'
      ? `${broker} connected — first sync didn’t finish`
      : 'Brokerage connection failed';

  // The link makes the broker the sole source of the Journal, so the pre-broker
  // imports are gone — say so plainly rather than letting the count vanish.
  const clearedNote =
    state.cleared > 0
      ? ` ${state.cleared} previously imported trade${state.cleared === 1 ? '' : 's'} ${
          state.cleared === 1 ? 'was' : 'were'
        } removed — your brokerage is now the only source for the Journal.`
      : '';

  const detail =
    state.kind === 'connected'
      ? state.synced > 0
        ? `Your trades are on the calendar below and in Performance.${clearedNote}`
        : `No trades came back yet — brokerages backfill history for a while after linking. Hit “Refresh data” in a few minutes, or it will pull automatically overnight.${clearedNote}`
      : state.kind === 'partial'
      ? 'The account is linked; only the initial pull failed. Use “Refresh data” to retry.'
      : state.reason || 'Please try connecting again.';

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl border"
      style={{ borderColor: tone.border, background: tone.bg }}
      role="status"
      aria-live="polite"
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: tone.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: tone.color }}>
          {headline}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #8b949e)' }}>
          {detail}
        </p>
      </div>
      <button
        onClick={() => setState(null)}
        className="flex-shrink-0 p-1 rounded hover:bg-white/5 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" style={{ color: 'var(--text-tertiary, #6e7681)' }} />
      </button>
    </div>
  );
}
