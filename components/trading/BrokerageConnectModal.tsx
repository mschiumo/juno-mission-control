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
 *
 * Visuals follow the legibility-redesign handoff: header / body / footer
 * regions, larger higher-contrast body copy, mono metadata, and Disconnect
 * pulled out of the body into a destructive footer action with an inline
 * confirm step.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Link2,
  Download,
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  X,
  Clock,
} from 'lucide-react';
import { isAccountActive, MAX_ACTIVE_ACCOUNTS } from '@/lib/account-classification';
import type { AccountSettingsMap } from '@/lib/db/account-settings';
import { brokerLogoPath } from '@/lib/broker-logos';

// Keep in sync with MAX_BROKER_CONNECTIONS on the server.
const MAX_CONNECTIONS = 1;

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

/** Accent-colored focus ring shared by every interactive element in the dialog. */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34d399]';

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
  const [syncResult, setSyncResult] = useState<'success' | 'error' | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        // Hit the connection limit — instruct the user to replace it.
        setError(json.error || 'You can connect one brokerage at a time.');
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
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/snaptrade/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSyncResult('success');
        // Let the Journal/Performance views pick up the new trades.
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setSyncResult('error');
        setSyncError(json.error || 'Sync failed. Please try again.');
      }
    } catch {
      setSyncResult('error');
      setSyncError('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      await fetch('/api/snaptrade/disconnect', { method: 'DELETE' });
      // Disconnecting resets the broker-synced trade history — reload so the
      // Journal/Performance/calendar views drop it (same pattern as sync).
      window.location.reload();
    } catch {
      setConnecting(false);
      setConfirmingDisconnect(false);
      await loadStatus();
    }
  };

  const isActive = useCallback(
    (accountId: string) => isAccountActive(accountSettings, accountId),
    [accountSettings],
  );

  /**
   * Persist one field of an account's settings, rolling back the optimistic
   * update if the server rejects it (e.g. the active-account cap).
   */
  const patchAccount = useCallback(
    async (accountId: string, patch: { enabled?: boolean }) => {
      const previous = accountSettings;
      setSavingAccount(accountId);
      setError(null);
      setAccountSettings(prev => ({
        ...prev,
        [accountId]: { ...(prev[accountId] ?? {}), ...patch },
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

  const accounts = status?.accounts ?? [];
  const isConnected = Boolean(status?.connected && accounts.length > 0);
  const activeCount = accounts.filter(a => isActive(a.id)).length;
  // Count distinct brokerage connections (one login can expose multiple accounts).
  const connectionCount =
    new Set(accounts.map(a => a.authorizationId).filter(Boolean)).size || accounts.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:px-6 sm:py-12"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-modal-rise-in flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-[#262c2e] bg-[#121617] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        {/* ── Header ── */}
        <div className="flex flex-shrink-0 items-center gap-3.5 border-b border-[#232a2b] px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] border border-[#34d399]/[0.28] bg-[#34d399]/[0.12]">
            <Link2 className="h-[18px] w-[18px] text-[#34d399]" strokeWidth={2} />
          </div>
          <h3 className="flex-1 text-[20px] font-semibold tracking-[-0.01em] text-[#f2f5f4] sm:text-[22px]">
            Connect Brokerage
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] border border-[#2b3234] text-[#aab3b2] transition-colors duration-150 hover:border-[#3a4244] hover:bg-[#1b2122] hover:text-[#f2f5f4] ${FOCUS_RING}`}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-5 py-5 sm:px-7 sm:pb-7 sm:pt-6">
          {loadingStatus && !status ? (
            /* First status fetch still in flight — don't guess at a state. The
               disconnected onboarding view flashing here for connected users
               reads as "your brokerage is gone" for a beat. */
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#34d399]/30 border-t-[#34d399]" />
            </div>
          ) : isConnected ? (
            <>
              {/* Status banner: success by default, error variant after a
                  failed sync (same geometry, danger palette, retry inline). */}
              {syncResult === 'error' ? (
                <div className="flex items-start gap-3 rounded-xl border border-[#f07178]/30 bg-[#f07178]/[0.09] px-[18px] py-4">
                  <AlertTriangle
                    className="mt-[1px] h-5 w-5 flex-shrink-0 text-[#f07178]"
                    strokeWidth={2.2}
                  />
                  <div className="flex flex-col gap-1">
                    <p className="text-base font-semibold leading-[1.3] text-[#f07178]">
                      Sync failed
                    </p>
                    <p className="text-[15px] leading-[1.5] text-[#c3cecb]">
                      {syncError}{' '}
                      <button
                        onClick={handleSync}
                        disabled={syncing}
                        className={`font-semibold text-[#f2f5f4] underline underline-offset-2 hover:text-white disabled:opacity-50 ${FOCUS_RING}`}
                      >
                        Try again
                      </button>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-[#34d399]/30 bg-[#34d399]/[0.09] px-[18px] py-4">
                  <CheckCircle
                    className="mt-[1px] h-5 w-5 flex-shrink-0 text-[#34d399]"
                    strokeWidth={2.2}
                  />
                  <div className="flex flex-col gap-1">
                    <p className="text-base font-semibold leading-[1.3] text-[#7fe9c1]">
                      Brokerage connected
                    </p>
                    <p className="text-[15px] leading-[1.5] text-[#c3cecb]">
                      {syncResult === 'success'
                        ? 'Synced just now — refreshing…'
                        : 'Your trades sync into the Journal automatically.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Linked-brokerage stat + primary sync action */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-[3px]">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b9694]">
                    Brokerages linked
                  </p>
                  <p className="text-[17px] font-semibold text-[#eef2f1]">
                    {connectionCount} of {MAX_CONNECTIONS}
                  </p>
                  {accounts.length > 1 && (
                    <p className="font-mono text-[12.5px] text-[#8b9694]">
                      {activeCount} of {MAX_ACTIVE_ACCOUNTS} account in use
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing || connecting}
                  className={`flex w-full items-center justify-center gap-[9px] rounded-[10px] border border-[#1cbb7f] bg-[#15a06b] px-5 py-3 text-[15px] font-semibold text-[#0a0d0c] transition-colors duration-150 hover:bg-[#1cbb7f] disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                    strokeWidth={2.4}
                  />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>

              <div className="h-px flex-shrink-0 bg-[#232a2b]" />

              {/* One brokerage login can expose several accounts, but only one
                  feeds the app — the user picks which. Hidden when the login
                  exposes a single account: there's nothing to choose. */}
              {accounts.length > 1 && (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[15px] leading-[1.5] text-[#8b9694]">
                    Your brokerage login exposes several accounts. Choose the one to use — it feeds
                    the Journal, P&amp;L, and Performance.
                  </p>
                  {accounts.map(a => {
                    const active = isActive(a.id);
                    const blocked = !active && activeCount >= MAX_ACTIVE_ACCOUNTS;
                    return (
                      <div
                        key={a.id}
                        className={`rounded-[10px] border bg-[#0e1213] p-3 transition-colors duration-150 ${
                          active ? 'border-[#34d399]/50' : 'border-[#2b3234]'
                        }`}
                      >
                        <label
                          className={`flex min-w-0 items-center gap-3 ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            disabled={blocked || savingAccount === a.id}
                            onChange={e => setAccountActive(a.id, e.target.checked)}
                            className="h-4 w-4 flex-shrink-0 accent-[#34d399]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium text-[#f2f5f4]">
                              {a.brokerage}
                            </span>
                            <span className="block truncate text-[13px] text-[#8b9694]">
                              {a.name}{a.number ? ` · ${a.number}` : ''}
                            </span>
                          </span>
                        </label>
                        {blocked && (
                          <p className="mt-2 pl-7 text-[12.5px] text-[#8b9694]">
                            Turn off the other account to use this one.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Data-freshness expectation: SnapTrade relays brokerage data on
                  a once-daily cycle, so "Sync now" can't surface same-day trades. */}
              <div className="flex flex-col gap-3.5">
                <p className="text-[15.5px] leading-[1.62] text-[#ccd6d3] [text-wrap:pretty]">
                  Brokerages share trade data{' '}
                  <strong className="font-semibold text-[#f2f5f4]">once a day</strong>, usually
                  overnight — today&apos;s trades typically appear by the next morning. The nightly
                  auto-sync picks them up;{' '}
                  <strong className="font-semibold text-[#f2f5f4]">Sync now</strong> pulls the
                  latest your brokerage has shared so far.
                </p>
                <p className="text-[15.5px] leading-[1.62] text-[#ccd6d3] [text-wrap:pretty]">
                  One brokerage can be linked at a time. To switch, disconnect this one first.
                </p>
                <p className="flex items-center gap-2 font-mono text-[12.5px] text-[#8b9694]">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
                  {status?.lastSyncedAt
                    ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString('en-US')}`
                    : 'Never synced'}
                </p>
              </div>

              {error && (
                <div className="rounded-[10px] border border-[#59292c] bg-[#f07178]/[0.08] px-4 py-3 text-[15px] leading-[1.5] text-[#f07178]">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-[15.5px] leading-[1.62] text-[#ccd6d3] [text-wrap:pretty]">
                Link your brokerage to import your trades automatically — they&apos;ll flow straight
                into your Journal calendar and Performance analytics. The connection is{' '}
                <strong className="font-semibold text-[#f2f5f4]">read-only</strong> and handled by
                SnapTrade&apos;s secure portal;{' '}
                <strong className="font-semibold text-[#f2f5f4]">
                  we never see your username or password
                </strong>
                , and no one can place trades on your behalf.
              </p>

              <ol className="flex flex-col gap-3">
                {[
                  'Click “Connect account” and choose your broker.',
                  'Log in on your broker’s own secure SnapTrade portal.',
                  'Your accounts link and trades begin syncing into your Journal.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-[1.5] text-[#ccd6d3]">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[#34d399]/[0.28] bg-[#34d399]/[0.12] text-xs font-bold text-[#34d399]">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>

              {/* Set the freshness expectation before they connect: brokerage
                  data arrives on a once-daily cycle, not live. */}
              <p className="text-[13.5px] leading-[1.6] text-[#8b9694] [text-wrap:pretty]">
                Note: brokerages share trade data once a day, usually overnight — so a day&apos;s
                trades and P&amp;L typically appear in your Journal by the next morning, not in
                real time.
              </p>

              <div className="flex flex-col gap-2.5">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b9694]">
                  Supported brokers
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_BROKERS.map(b => {
                    const logo = brokerLogoPath(b);
                    return (
                      <span
                        key={b}
                        className="flex items-center gap-1.5 rounded-md border border-[#2b3234] bg-[#0e1213] px-2 py-1 text-xs text-[#aab3b2]"
                      >
                        {logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logo}
                            alt=""
                            className="h-3.5 w-3.5 rounded-full object-cover"
                          />
                        )}
                        {b}
                      </span>
                    );
                  })}
                  <span className="px-2 py-1 text-xs text-[#8b9694]">+ more</span>
                </div>
              </div>

              {/* Destructive-action disclaimer. Linking makes the broker the only
                  source of the Journal, so the hand-imported history goes away. */}
              <div className="rounded-xl border border-[#d29922]/40 bg-[#d29922]/10 p-4">
                <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-[#d29922]">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  This replaces your existing trade history
                </p>
                <p className="mb-3 text-[15px] leading-[1.6] text-[#ccd6d3]">
                  Once a brokerage is linked it becomes the{' '}
                  <strong className="font-semibold text-[#f2f5f4]">only</strong> source of your
                  Journal. Every trade you added by hand or imported from a CSV / account statement
                  is <strong className="font-semibold text-[#f2f5f4]">removed</strong>, and manual
                  imports are turned off for as long as the brokerage stays connected. Your written
                  journal entries, notes and goals are not touched.
                </p>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={e => setAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#34d399]"
                  />
                  <span className="text-[15px] leading-[1.5] text-[#ccd6d3]">
                    I understand my imported trades will be replaced by my live brokerage data.
                  </span>
                </label>
              </div>

              {notConfigured && (
                <div className="rounded-[10px] border border-[#2b3234] bg-[#1b2122] px-4 py-3 text-[15px] leading-[1.5] text-[#ccd6d3]">
                  Brokerage connections aren&apos;t enabled yet — this is coming soon. In the
                  meantime you can import a statement below.
                </div>
              )}
              {error && (
                <div className="rounded-[10px] border border-[#59292c] bg-[#f07178]/[0.08] px-4 py-3 text-[15px] leading-[1.5] text-[#f07178]">
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={connecting || loadingStatus || !acknowledged}
                className={`flex w-full items-center justify-center gap-[9px] rounded-[10px] border border-[#1cbb7f] bg-[#15a06b] px-5 py-3 text-[15px] font-semibold text-[#0a0d0c] transition-colors duration-150 hover:bg-[#1cbb7f] disabled:opacity-50 ${FOCUS_RING}`}
              >
                {connecting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0a0d0c]/30 border-t-[#0a0d0c]" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" strokeWidth={2.4} />
                    Connect account
                  </>
                )}
              </button>

              {onOpenImport && (
                <div className="flex items-center justify-between gap-3 border-t border-[#232a2b] pt-4">
                  <span className="text-[15px] text-[#8b9694]">Prefer to import a statement?</span>
                  <button
                    onClick={onOpenImport}
                    className={`flex flex-shrink-0 items-center gap-2 text-[15px] font-medium text-[#34d399] hover:underline ${FOCUS_RING}`}
                  >
                    <Download className="h-4 w-4" />
                    Import CSV / Excel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer (connected only): destructive action, out of the body ── */}
        {!loadingStatus && isConnected && (
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[#232a2b] bg-[#0e1213] px-5 py-4 sm:px-7 sm:py-[18px]">
            {confirmingDisconnect ? (
              <>
                <span className="mr-auto max-w-[420px] text-[15px] leading-[1.5] text-[#ccd6d3]">
                  Disconnect this brokerage? Your synced trade history will be
                  removed, and any pre-broker imports restored.
                </span>
                <button
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={connecting}
                  className={`rounded-[10px] border border-[#2b3234] px-[18px] py-[11px] text-[15px] font-semibold text-[#aab3b2] transition-colors duration-150 hover:border-[#3a4244] hover:bg-[#1b2122] hover:text-[#f2f5f4] disabled:opacity-50 ${FOCUS_RING}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={connecting}
                  className={`rounded-[10px] border border-[#7a3339] bg-[#f07178]/10 px-[18px] py-[11px] text-[15px] font-semibold text-[#f07178] transition-colors duration-150 hover:bg-[#f07178]/20 disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {connecting ? 'Disconnecting…' : 'Yes, disconnect'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingDisconnect(true)}
                disabled={connecting}
                className={`rounded-[10px] border border-[#59292c] px-[18px] py-[11px] text-[15px] font-semibold text-[#f07178] transition-colors duration-150 hover:border-[#7a3339] hover:bg-[#f07178]/10 disabled:opacity-50 ${FOCUS_RING}`}
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
