'use client';

/**
 * BrokerageSyncBar
 *
 * Persistent status strip for the linked brokerage, shown atop both the Journal
 * and Performance tabs. Displays connected accounts + last-synced time, a
 * Refresh button that re-pulls live data, and a Manage button (connect /
 * disconnect via BrokerageConnectModal).
 *
 * Both tabs read the same trades-v2 source, so a refresh here updates the
 * current view via `onSynced` and the other view refetches when it next mounts
 * — keeping Performance and Journal in sync. When no brokerage is linked it
 * shows a slim connect prompt.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Link2, RefreshCw, Plug } from 'lucide-react';
import { isOwnerEmail } from '@/lib/owner';
import BrokerageConnectModal from './BrokerageConnectModal';

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
}

interface BrokerageSyncBarProps {
  /** Called after a successful sync so the embedding view refetches its trades. */
  onSynced?: () => void;
  /** Passed through to the modal to offer manual CSV/Excel import (Journal only). */
  onOpenImport?: () => void;
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

export default function BrokerageSyncBar({ onSynced, onOpenImport }: BrokerageSyncBarProps) {
  // Brokerage connections are owner-only (billing protection) — non-owner
  // accounts only see the existing manual CSV import. The server enforces this
  // on every /api/snaptrade/* route; this just hides the UI.
  const { data: session } = useSession();
  const isOwner = isOwnerEmail(session?.user?.email);

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
    if (isOwner) loadStatus();
    else setLoading(false);
  }, [isOwner, loadStatus]);

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

  // Owner-only feature; render nothing for every other account (they keep the
  // manual CSV import). Also hides during the brief session-loading window.
  if (!isOwner || loading) return null;

  const accounts = status?.accounts ?? [];
  const connected = Boolean(status?.connected && accounts.length > 0);

  return (
    <>
      {connected ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[#30363d] bg-[#161b22]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[#3fb950]">
              <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
              Brokerage synced
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {accounts.map(a => (
                <span
                  key={a.id}
                  className="px-2 py-0.5 text-xs rounded-md bg-[#0d1117] border border-[#30363d] text-[#c9d1d9]"
                >
                  {a.brokerage}
                  {a.number ? ` ··${a.number.slice(-4)}` : ''}
                </span>
              ))}
            </div>
            {status?.lastSyncedAt && (
              <span
                className="text-xs text-[#8b949e]"
                title={new Date(status.lastSyncedAt).toLocaleString()}
              >
                Updated {relativeTime(status.lastSyncedAt)}
              </span>
            )}
            {msg && <span className="text-xs text-[#58a6ff]">{msg}</span>}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm transition-colors disabled:opacity-50"
              title="Pull the latest trades from your brokerage"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Refreshing…' : 'Refresh data'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 border border-[#30363d] hover:border-[#F97316]/50 text-[#c9d1d9] hover:text-white rounded-lg text-sm transition-colors"
            >
              Manage
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-dashed border-[#30363d] bg-[#161b22]/50">
          <span className="flex items-center gap-2 text-sm text-[#8b949e]">
            <Plug className="w-4 h-4 text-[#F97316] flex-shrink-0" />
            Connect your brokerage to auto-sync trades into Performance &amp; Journal.
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#F97316] hover:bg-[#ea6c0a] text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <Link2 className="w-4 h-4" />
            Connect Broker
          </button>
        </div>
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
