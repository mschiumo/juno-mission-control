'use client';

/**
 * Live-connection buttons for the Finances tab.
 *
 * TellerConnectButton — opens the Teller Connect widget (script loaded on
 * demand from cdn.teller.io) and posts the resulting enrollment accessToken
 * to /api/finance/teller, which encrypts it at rest and syncs balances.
 * States: env not configured (disabled + hint) → connect → connected
 * (sync / disconnect). Covers Chase, Capital One, and most major US banks.
 *
 * BrokerageSyncButton — one-click sync of the live Robinhood account value
 * through the existing ConfluenceTrading connection (/api/finance/
 * investing-sync). Hidden entirely when live mode isn't available so the
 * Investing section stays clean for manual/sheet use.
 */

import { useState, useEffect, useCallback } from 'react';
import { Landmark, RefreshCw, Unlink, TrendingUp } from 'lucide-react';

declare global {
  interface Window {
    TellerConnect?: {
      setup: (opts: {
        applicationId: string;
        environment: string;
        onSuccess: (enrollment: {
          accessToken: string;
          enrollment?: { institution?: { name?: string } };
        }) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

interface TellerStatus {
  configured: boolean;
  environment: string | null;
  applicationId: string | null;
  enrollment: {
    institutionNames: string[];
    enrolledAt: string;
    lastSyncedAt: string | null;
    lastResult: string | null;
  } | null;
}

function loadTellerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.TellerConnect) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.teller.io/connect/connect.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Teller Connect'));
    document.head.appendChild(script);
  });
}

export function TellerConnectButton({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<TellerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/teller');
      const json = await res.json();
      if (json.success) setStatus(json);
    } catch (e) {
      console.error('Teller status error:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const openConnect = async () => {
    if (!status?.applicationId) return;
    setBusy(true);
    setMessage(null);
    try {
      await loadTellerScript();
      const connect = window.TellerConnect!.setup({
        applicationId: status.applicationId,
        environment: status.environment ?? 'sandbox',
        onSuccess: async (enrollment) => {
          try {
            const res = await fetch('/api/finance/teller', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accessToken: enrollment.accessToken,
                institutionNames: [enrollment.enrollment?.institution?.name].filter(Boolean),
              }),
            });
            const json = await res.json();
            setMessage(json.success ? `Connected — synced ${json.synced} accounts` : `Error: ${json.error}`);
            await fetchStatus();
            if (json.success) onChanged();
          } catch {
            setMessage('Error: enrollment save failed');
          } finally {
            setBusy(false);
          }
        },
        onExit: () => setBusy(false),
      });
      connect.open();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Teller Connect failed to load');
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/finance/teller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json();
      setMessage(json.success ? `Synced ${json.synced} accounts` : `Error: ${json.error}`);
      await fetchStatus();
      if (json.success) onChanged();
    } catch {
      setMessage('Error: sync failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect the bank? Accounts keep their last balances and become manually editable.')) return;
    try {
      await fetch('/api/finance/teller', { method: 'DELETE' });
      setMessage(null);
      await fetchStatus();
      onChanged();
    } catch (e) {
      console.error('Teller disconnect error:', e);
    }
  };

  if (!status) return null;

  if (!status.configured) {
    return (
      <button
        disabled
        title="Set TELLER_APP_ID / TELLER_ENVIRONMENT / TELLER_CERT_B64 / TELLER_KEY_B64 / FINANCE_TOKEN_SECRET to enable (free at teller.io — see lib/finance/teller.ts)"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium opacity-40 cursor-not-allowed"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
      >
        <Landmark className="w-3.5 h-3.5" />
        Connect bank
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status.enrollment ? (
        <>
          <span
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ border: '1px solid var(--positive)', color: 'var(--positive)' }}
            title={status.enrollment.lastResult ?? undefined}
          >
            <Landmark className="w-3.5 h-3.5" />
            {status.enrollment.institutionNames[0] ?? 'Bank'} connected
          </span>
          <button
            onClick={syncNow}
            disabled={busy}
            title="Sync balances now"
            className="p-1.5 rounded-lg transition-all disabled:opacity-50"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={disconnect}
            title="Disconnect bank"
            className="p-1.5 rounded-lg transition-all"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button
          onClick={openConnect}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <Landmark className="w-3.5 h-3.5" />
          {busy ? 'Opening…' : 'Connect bank'}
        </button>
      )}
      {message && (
        <span className="text-[11px]" style={{ color: message.startsWith('Error') ? 'var(--negative)' : 'var(--positive)' }}>
          {message}
        </span>
      )}
    </div>
  );
}

export function BrokerageSyncButton({ onChanged }: { onChanged: () => void }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/finance/investing-sync')
      .then((r) => r.json())
      .then((j) => setAvailable(!!j.available))
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const sync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/finance/investing-sync', { method: 'POST' });
      const json = await res.json();
      setMessage(json.success ? 'Synced' : `Error: ${json.error}`);
      if (json.success) onChanged();
    } catch {
      setMessage('Error: sync failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={sync}
        disabled={busy}
        title="Pull the live Robinhood account value via the existing ConfluenceTrading connection"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
      >
        <TrendingUp className="w-3.5 h-3.5" />
        {busy ? 'Syncing…' : 'Sync Robinhood'}
      </button>
      {message && (
        <span className="text-[11px]" style={{ color: message.startsWith('Error') ? 'var(--negative)' : 'var(--positive)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
