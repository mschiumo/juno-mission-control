'use client';

/**
 * BrokerageSyncBar
 *
 * Compact status pill for the linked brokerage, shown once in the Journal
 * header (deliberately not on every tab). Connected: the broker's round logo
 * (green status dot riding its corner; plain dot when no logo is bundled),
 * the broker name(s) and last-synced age, plus an inline refresh icon; clicking the pill
 * opens BrokerageConnectModal for everything else (accounts, sync, connect /
 * disconnect). Disconnected: a slim "Connect broker" pill.
 *
 * Journal and Performance read the same trades-v2 source, so a refresh here
 * updates the current view via `onSynced` and the other view refetches when it
 * next mounts.
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plug } from 'lucide-react';
import BrokerageConnectModal from './BrokerageConnectModal';
import { brokerLogoPath } from '@/lib/broker-logos';

interface BrokerAccount {
  id: string;
  brokerage: string;
  name: string;
  number?: string;
  authorizationId?: string;
}

interface AccountsStatus {
  connected: boolean;
  accounts: BrokerAccount[];
  lastSyncedAt: string | null;
  /** Trade provenance split — see /api/snaptrade/accounts. */
  counts?: { broker: number; imported: number };
}

interface BrokerageSyncBarProps {
  /** Called after a successful sync so the embedding view refetches its trades. */
  onSynced?: () => void;
  /** Passed through to the modal to offer manual CSV/Excel import (Journal only). */
  onOpenImport?: () => void;
  /**
   * Reports whether a live brokerage is linked. The Journal uses it to hide the
   * manual import entry points — a linked broker is the sole source of trades.
   * Pass a stable reference (e.g. a useState setter).
   */
  onConnectedChange?: (connected: boolean) => void;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export default function BrokerageSyncBar({
  onSynced,
  onOpenImport,
  onConnectedChange,
}: BrokerageSyncBarProps) {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/snaptrade/accounts?_t=${Date.now()}`);
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const accounts = status?.accounts ?? [];
  const connected = Boolean(status?.connected && accounts.length > 0);

  // Declared above the loading early return so the embedding view is told
  // "not connected" during the fetch too, and keeps its manual import.
  useEffect(() => {
    onConnectedChange?.(connected);
  }, [connected, onConnectedChange]);

  const handleRefresh = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch('/api/snaptrade/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        const n = json.data?.tradesWritten ?? 0;
        setMsg(`Updated · ${n} trade${n === 1 ? '' : 's'}`);
        await loadStatus();
        onSynced?.();
      } else {
        setMsg(json.error || 'Sync failed');
      }
    } catch {
      setMsg('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Hide during the brief status-loading window so the pill doesn't flicker.
  if (loading) return null;

  // "Charles Schwab" / "Robinhood · Schwab" — one name per distinct brokerage.
  const brokerNames = [...new Set(accounts.map(a => a.brokerage))].join(' · ');
  // Round brokerage logo shown at the head of the pill; the green status dot
  // rides its corner as a badge. Falls back to the plain dot for brokerages
  // without a bundled logo tile.
  const brokerLogo = brokerLogoPath(accounts[0]?.brokerage);
  const tooltip = [
    accounts.map(a => `${a.brokerage}${a.number ? ` ··${a.number.slice(-4)}` : ''}`).join(', '),
    status?.lastSyncedAt
      ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
      : 'Linked, but no sync has run yet',
    status?.counts
      ? `${status.counts.broker} trades from broker · ${status.counts.imported} imported`
      : '',
    'Click to manage',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      {connected ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-[#30363d] bg-[#161b22] hover:border-[#3fb950]/40 transition-colors">
            <button
              onClick={() => setShowModal(true)}
              title={tooltip}
              className={`flex items-center gap-1.5 py-1.5 pr-1 ${brokerLogo ? 'pl-1.5' : 'pl-2.5'}`}
            >
              {brokerLogo ? (
                <span className="relative h-[18px] w-[18px] flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brokerLogo}
                    alt=""
                    className="h-[18px] w-[18px] rounded-full object-cover"
                  />
                  <span className="absolute -bottom-px -right-px h-[7px] w-[7px] rounded-full bg-[#3fb950] ring-2 ring-[#161b22]" />
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] flex-shrink-0" />
              )}
              <span className="text-xs text-[#c9d1d9] whitespace-nowrap">{brokerNames}</span>
              {status?.lastSyncedAt ? (
                <span className="text-[11px] text-[#8b949e] whitespace-nowrap hidden sm:inline">
                  {relativeTime(status.lastSyncedAt)}
                </span>
              ) : (
                <span className="text-[11px] text-[#d29922] whitespace-nowrap hidden sm:inline">
                  never synced
                </span>
              )}
            </button>
            <button
              onClick={handleRefresh}
              disabled={syncing}
              aria-label="Pull the latest data your brokerage has shared"
              title={
                'Pull the latest data your brokerage has shared.\n' +
                'Brokerages send trades once a day (usually overnight), so ' +
                'today’s trades typically appear by tomorrow morning.'
              }
              className="p-1.5 pr-2 text-[#8b949e] hover:text-[#3fb950] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {msg && <span className="text-[11px] text-[#58a6ff] whitespace-nowrap">{msg}</span>}
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          title="Auto-sync your trades into Performance & Journal"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-dashed border-[#30363d] text-xs text-[#8b949e] hover:text-[#F97316] hover:border-[#F97316]/50 transition-colors whitespace-nowrap"
        >
          <Plug className="w-3.5 h-3.5 flex-shrink-0" />
          Connect broker
        </button>
      )}

      {showModal && (
        <BrokerageConnectModal
          onClose={() => {
            setShowModal(false);
            // Reflect any connect/disconnect the user just made, and refresh views.
            loadStatus();
            onSynced?.();
          }}
          onOpenImport={onOpenImport}
        />
      )}
    </>
  );
}
