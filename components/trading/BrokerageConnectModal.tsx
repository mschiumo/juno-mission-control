'use client';

/**
 * BrokerageConnectModal
 *
 * Instructs the user how to link a brokerage (via SnapTrade) and drives the
 * connect flow: POST /api/snaptrade/connect -> redirect to the secure
 * Connection Portal. Shows current connection status (GET /api/snaptrade/
 * accounts) and lets the user disconnect. Manual CSV/statement import remains
 * available via the `onOpenImport` hand-off.
 */

import { useState, useEffect } from 'react';
import { Link2, Download, CheckCircle, RefreshCw } from 'lucide-react';

// Keep in sync with MAX_BROKER_CONNECTIONS on the server.
const MAX_ACCOUNTS = 2;

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
  stale?: boolean;
}

const SUPPORTED_BROKERS = [
  'Robinhood', 'Charles Schwab', 'thinkorswim', 'Webull', 'Fidelity',
  'E*TRADE', 'Interactive Brokers', 'Tastytrade', 'Coinbase', 'Vanguard',
];

interface BrokerageConnectModalProps {
  onClose: () => void;
  /** Switch the user over to the manual CSV/Excel import flow. */
  onOpenImport: () => void;
}

export default function BrokerageConnectModal({ onClose, onOpenImport }: BrokerageConnectModalProps) {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/snaptrade/accounts?_t=${Date.now()}`);
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      // Non-fatal: the user can still attempt to connect.
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch('/api/snaptrade/connect', { method: 'POST' });
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      const json = await res.json();
      if (res.status === 409) {
        // Hit the account limit — instruct the user to replace one.
        setError(json.error || `You can connect up to ${MAX_ACCOUNTS} brokerage accounts.`);
        return;
      }
      if (json.success && json.url) {
        // Hand off to SnapTrade's secure Connection Portal.
        window.location.href = json.url;
        return;
      }
      setError(json.error || 'Could not start the connection. Please try again.');
    } catch {
      setError('Could not start the connection. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/snaptrade/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        const n = json.data?.tradesWritten ?? 0;
        setSyncMsg(`Synced ${n} trade${n === 1 ? '' : 's'}. Refreshing…`);
        // Let the Journal/Performance views pick up the new trades.
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setSyncMsg(json.error || 'Sync failed. Please try again.');
      }
    } catch {
      setSyncMsg('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      await fetch('/api/snaptrade/disconnect', { method: 'DELETE' });
      await loadStatus();
    } finally {
      setConnecting(false);
    }
  };

  const accounts = status?.accounts ?? [];
  const isConnected = Boolean(status?.connected && accounts.length > 0);
  // Count distinct brokerage connections (one login can expose multiple accounts).
  const connectionCount =
    new Set(accounts.map(a => a.authorizationId).filter(Boolean)).size || accounts.length;
  const atLimit = connectionCount >= MAX_ACCOUNTS;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[#F97316]" />
            Connect Brokerage
          </h3>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white">✕</button>
        </div>

        {isConnected ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-[#238636]/15 text-[#3fb950] text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Brokerage connected. Your trades sync into the Journal automatically.
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide">
                {connectionCount} of {MAX_ACCOUNTS} brokerage accounts connected
              </p>
              <button
                onClick={handleSync}
                disabled={syncing || connecting}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>

            {syncMsg && (
              <div className="p-3 rounded-lg bg-[#1f6feb]/15 text-[#58a6ff] text-sm">{syncMsg}</div>
            )}

            <div className="space-y-2">
              {accounts.map(a => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-[#30363d] bg-[#0d1117]"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{a.brokerage}</p>
                    <p className="text-[#8b949e] text-xs">
                      {a.name}{a.number ? ` · ${a.number}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {status?.lastSyncedAt && (
              <p className="text-xs text-[#8b949e]">
                Last synced {new Date(status.lastSyncedAt).toLocaleString()}
              </p>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-[#da3633]/20 text-[#f85149] text-sm">{error}</div>
            )}

            {atLimit && (
              <p className="text-xs text-[#8b949e]">
                You&apos;ve reached the {MAX_ACCOUNTS}-account limit. To connect a different brokerage,
                disconnect one below first.
              </p>
            )}

            <div className="flex justify-between items-center pt-2">
              {atLimit ? (
                <span className="text-sm text-[#8b949e]">Limit reached</span>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="text-sm text-[#F97316] hover:underline disabled:opacity-50"
                >
                  + Connect another account
                </button>
              )}
              <button
                onClick={handleDisconnect}
                disabled={connecting}
                className="text-sm text-[#f85149] hover:underline disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#8b949e] leading-relaxed mb-5">
              Link your brokerage to import your trades automatically — they&apos;ll flow straight into
              your Journal calendar and Performance analytics. The connection is{' '}
              <span className="text-white font-medium">read-only</span> and handled by SnapTrade&apos;s
              secure portal; <span className="text-white font-medium">we never see your username or
              password</span>, and no one can place trades on your behalf.
            </p>

            <ol className="space-y-3 mb-5">
              {[
                'Click “Connect account” and choose your broker.',
                'Log in on your broker’s own secure SnapTrade portal.',
                'Your accounts link and trades begin syncing into your Journal.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-[#c9d1d9]">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F97316]/10 text-[#F97316] text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mb-5">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-2">Supported brokers</p>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_BROKERS.map(b => (
                  <span
                    key={b}
                    className="px-2 py-0.5 text-xs rounded-md bg-[#0d1117] border border-[#30363d] text-[#8b949e]"
                  >
                    {b}
                  </span>
                ))}
                <span className="px-2 py-0.5 text-xs rounded-md text-[#8b949e]">+ more</span>
              </div>
            </div>

            {notConfigured && (
              <div className="p-3 rounded-lg mb-4 bg-[#1f6feb]/15 text-[#58a6ff] text-sm">
                Brokerage connections aren&apos;t enabled yet — this is coming soon. In the meantime you
                can import a statement below.
              </div>
            )}
            {error && (
              <div className="p-3 rounded-lg mb-4 bg-[#da3633]/20 text-[#f85149] text-sm">{error}</div>
            )}

            <button
              onClick={handleConnect}
              disabled={connecting || loadingStatus}
              className="w-full px-4 py-3 bg-[#F97316] hover:bg-[#ea6c0a] text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Connect account
                </>
              )}
            </button>

            <div className="mt-4 pt-4 border-t border-[#30363d] flex items-center justify-between gap-3">
              <span className="text-sm text-[#8b949e]">Prefer to import a statement?</span>
              <button
                onClick={onOpenImport}
                className="flex items-center gap-2 text-sm text-[#F97316] hover:underline flex-shrink-0"
              >
                <Download className="w-4 h-4" />
                Import CSV / Excel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
