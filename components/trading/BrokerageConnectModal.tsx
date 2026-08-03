'use client';

/**
 * BrokerageConnectModal
 *
 * Instructs the user how to link a brokerage (via SnapTrade) and drives the
 * connect flow: POST /api/snaptrade/connect -> redirect to the secure
 * Connection Portal. Shows current connection status (GET /api/snaptrade/
 * accounts) and lets the user disconnect.
 *
 * Linking a brokerage is destructive: it makes the broker the sole source of
 * the Journal and clears the trades the user imported by hand (see
 * /api/snaptrade/connect/complete). The first connect is therefore gated behind
 * an explicit acknowledgement of that. Manual CSV/statement import stays
 * available via the `onOpenImport` hand-off *until* a brokerage is linked.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link2, Download, CheckCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  isAccountActive,
  accountType,
  MAX_ACTIVE_ACCOUNTS,
} from '@/lib/account-classification';
import type { AccountSettingsMap, AccountType } from '@/lib/db/account-settings';

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
  /** Switch the user over to the manual CSV/Excel import flow. Omit to hide the option. */
  onOpenImport?: () => void;
}

export default function BrokerageConnectModal({ onClose, onOpenImport }: BrokerageConnectModalProps) {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [accountSettings, setAccountSettings] = useState<AccountSettingsMap>({});
  const [savingAccount, setSavingAccount] = useState<string | null>(null);
  // Gates the first connect: the user must acknowledge that linking replaces
  // their imported trade history before we hand off to the portal.
  const [acknowledged, setAcknowledged] = useState(false);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const [res, settingsRes] = await Promise.all([
        fetch(`/api/snaptrade/accounts?_t=${Date.now()}`),
        fetch('/api/user/account-settings'),
      ]);
      const json = await res.json();
      if (json.success) setStatus(json.data);
      const settingsJson = await settingsRes.json().catch(() => ({}));
      if (settingsJson?.settings) setAccountSettings(settingsJson.settings);
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

  const isActive = useCallback(
    (accountId: string) => isAccountActive(accountSettings, accountId),
    [accountSettings],
  );
  const typeOf = useCallback(
    (accountId: string) => accountType(accountSettings, accountId),
    [accountSettings],
  );

  /**
   * Persist one field of an account's settings, rolling back the optimistic
   * update if the server rejects it (e.g. the active-account cap).
   */
  const patchAccount = useCallback(
    async (accountId: string, patch: { enabled?: boolean; type?: AccountType }) => {
      const previous = accountSettings;
      setSavingAccount(accountId);
      setError(null);
      setAccountSettings(prev => ({
        ...prev,
        [accountId]: { ...(prev[accountId] ?? { type: 'day-trading' as AccountType }), ...patch },
      }));
      try {
        const res = await fetch('/api/user/account-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, ...patch }),
        });
        const json = await res.json();
        if (json.success && json.settings) {
          setAccountSettings(json.settings);
        } else {
          setAccountSettings(previous);
          setError(json.error || 'Could not update that account.');
        }
      } catch {
        setAccountSettings(previous);
        setError('Could not update that account.');
      } finally {
        setSavingAccount(null);
      }
    },
    [accountSettings],
  );

  const setAccountActive = useCallback(
    (accountId: string, enabled: boolean) => patchAccount(accountId, { enabled }),
    [patchAccount],
  );
  const setAccountType = useCallback(
    (accountId: string, type: AccountType) => patchAccount(accountId, { type }),
    [patchAccount],
  );

  const accounts = status?.accounts ?? [];
  const isConnected = Boolean(status?.connected && accounts.length > 0);
  const activeCount = accounts.filter(a => isActive(a.id)).length;
  // Count distinct brokerage connections (one login can expose multiple accounts).
  const connectionCount =
    new Set(accounts.map(a => a.authorizationId).filter(Boolean)).size || accounts.length;
  const atLimit = connectionCount >= MAX_ACCOUNTS;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto">
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
                {connectionCount} of {MAX_ACCOUNTS} brokerages linked
                {accounts.length > 0 && ` · ${activeCount} of ${MAX_ACTIVE_ACCOUNTS} accounts in use`}
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

            {/* Data-freshness expectation: SnapTrade relays brokerage data on a
                once-daily cycle, so "Sync now" can't surface same-day trades. */}
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Brokerages share trade data <span className="text-[#c9d1d9]">once a day</span>, usually
              overnight — today&apos;s trades typically appear by the next morning. The nightly
              auto-sync picks them up; &ldquo;Sync now&rdquo; pulls the latest your brokerage has
              shared so far.
            </p>

            {syncMsg && (
              <div className="p-3 rounded-lg bg-[#1f6feb]/15 text-[#58a6ff] text-sm">{syncMsg}</div>
            )}

            {/* One brokerage login can expose several accounts, so the user
                picks which ones feed the app and what each one is for. */}
            <div className="space-y-2">
              <p className="text-xs text-[#8b949e]">
                Choose up to {MAX_ACTIVE_ACCOUNTS} accounts to use, and what each one is for. Trading
                accounts feed the Journal and P&amp;L; long-term accounts get their own portfolio view.
              </p>
              {accounts.map(a => {
                const active = isActive(a.id);
                const type = typeOf(a.id);
                const blocked = !active && activeCount >= MAX_ACTIVE_ACCOUNTS;
                return (
                  <div
                    key={a.id}
                    className={`p-3 rounded-lg border bg-[#0d1117] transition-colors ${
                      active ? 'border-[#F97316]/50' : 'border-[#30363d]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label className={`flex items-center gap-3 min-w-0 ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={blocked || savingAccount === a.id}
                          onChange={e => setAccountActive(a.id, e.target.checked)}
                          className="w-4 h-4 accent-[#F97316] flex-shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block text-white text-sm font-medium truncate">{a.brokerage}</span>
                          <span className="block text-[#8b949e] text-xs truncate">
                            {a.name}{a.number ? ` · ${a.number}` : ''}
                          </span>
                        </span>
                      </label>

                      {active && (
                        <div className="flex items-center gap-0.5 rounded-lg p-0.5 bg-[#161b22] border border-[#30363d] flex-shrink-0">
                          {(['day-trading', 'long-term'] as AccountType[]).map(t => (
                            <button
                              key={t}
                              onClick={() => setAccountType(a.id, t)}
                              disabled={savingAccount === a.id}
                              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                              style={{
                                background: type === t ? '#F97316' : 'transparent',
                                color: type === t ? 'white' : '#8b949e',
                              }}
                            >
                              {t === 'day-trading' ? 'Trading' : 'Long-term'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {blocked && (
                      <p className="text-[11px] text-[#8b949e] mt-2 pl-7">
                        Turn off another account to use this one.
                      </p>
                    )}
                  </div>
                );
              })}
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

            {/* Set the freshness expectation before they connect: brokerage
                data arrives on a once-daily cycle, not live. */}
            <p className="text-xs text-[#8b949e] leading-relaxed mb-5">
              Note: brokerages share trade data once a day, usually overnight — so a day&apos;s
              trades and P&amp;L typically appear in your Journal by the next morning, not in
              real time.
            </p>

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

            {/* Destructive-action disclaimer. Linking makes the broker the only
                source of the Journal, so the hand-imported history goes away. */}
            <div className="mb-5 p-4 rounded-lg border border-[#d29922]/40 bg-[#d29922]/10">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#d29922] mb-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                This replaces your existing trade history
              </p>
              <p className="text-sm text-[#c9d1d9] leading-relaxed mb-3">
                Once a brokerage is linked it becomes the{' '}
                <span className="text-white font-medium">only</span> source of your Journal. Every
                trade you added by hand or imported from a CSV / account statement is{' '}
                <span className="text-white font-medium">removed</span>, and manual imports are
                turned off for as long as the brokerage stays connected. Your written journal
                entries, notes and goals are not touched.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#F97316] flex-shrink-0"
                />
                <span className="text-sm text-[#c9d1d9]">
                  I understand my imported trades will be replaced by my live brokerage data.
                </span>
              </label>
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
              disabled={connecting || loadingStatus || !acknowledged}
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

            {onOpenImport && (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
