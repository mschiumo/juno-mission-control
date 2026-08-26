'use client';

/**
 * Guardrail & safety controls (system_state). This panel is where the hard rules
 * live in the UI: the kill switch (trading_enabled), the paper/live mode gate,
 * the pinned agentic account, and the per-position / total exposure caps. All of
 * these are enforced server-side in the execution service — this panel just
 * edits them.
 */

import { useState } from 'react';
import { ShieldAlert, Power, FlaskConical, Save, PlugZap } from 'lucide-react';
import type { SystemState } from '@/types/confluence';

interface Props {
  state: SystemState;
  busy: boolean;
  onSave: (updates: Partial<SystemState>) => void;
}

const field = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
} as const;

export default function SettingsPanel({ state, busy, onSave }: Props) {
  const [perPosition, setPerPosition] = useState(String(state.perPositionCapUsd));
  const [totalCap, setTotalCap] = useState(String(state.totalExposureCapUsd));
  const [maxAgeDays, setMaxAgeDays] = useState(String(state.entryOrderMaxAgeDays));
  const [account, setAccount] = useState(state.agenticAccount ?? '');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const capsDirty =
    Number(perPosition) !== state.perPositionCapUsd ||
    Number(totalCap) !== state.totalExposureCapUsd ||
    Number(maxAgeDays) !== state.entryOrderMaxAgeDays;
  const accountDirty = account.trim() !== (state.agenticAccount ?? '');

  return (
    <div className="flex flex-col gap-4">
      {/* Kill switch / arm execution */}
      <div className="card" style={{ borderColor: state.tradingEnabled ? 'var(--border-default)' : 'var(--negative)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--negative-dim)' }}>
              <ShieldAlert className="w-4.5 h-4.5" style={{ color: 'var(--negative)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Execution {state.tradingEnabled ? 'armed' : 'disarmed (kill switch)'}
              </div>
              <p className="text-[12px] mt-0.5 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                When disarmed, the execution service refuses to place any order regardless of approvals. Ships disarmed.
              </p>
            </div>
          </div>
          <button
            className="px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0 disabled:opacity-50"
            style={{
              background: state.tradingEnabled ? 'var(--negative)' : 'var(--positive-dim)',
              color: state.tradingEnabled ? '#fff' : 'var(--positive)',
            }}
            disabled={busy}
            onClick={() => onSave({ tradingEnabled: !state.tradingEnabled })}
          >
            {state.tradingEnabled ? 'Engage kill switch' : 'Arm execution'}
          </button>
        </div>
      </div>

      {/* Mode + agentic account */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--warning-dim)' }}>
              <FlaskConical className="w-4.5 h-4.5" style={{ color: 'var(--warning)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Execution mode</div>
              <p className="text-[12px] mt-0.5 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                <b>Paper</b> simulates fills with no money at risk. <b>Live</b> places REAL orders in the pinned agentic account — requires the server flag <code className="break-all">CONFLUENCE_ALLOW_LIVE</code> and a pinned account.
              </p>
            </div>
          </div>
          <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-default)' }}>
            <button
              className="px-3.5 py-2 text-sm font-medium"
              style={{ background: state.paperMode ? 'var(--accent)' : 'transparent', color: state.paperMode ? '#fff' : 'var(--text-secondary)' }}
              disabled={busy}
              onClick={() => onSave({ paperMode: true })}
            >
              Paper
            </button>
            <button
              className="px-3.5 py-2 text-sm font-medium disabled:opacity-40"
              style={{ background: !state.paperMode ? 'var(--negative)' : 'transparent', color: !state.paperMode ? '#fff' : 'var(--text-secondary)' }}
              disabled={busy}
              title="Switch to LIVE — real orders in the pinned agentic account"
              onClick={() => {
                if (
                  state.paperMode &&
                  window.confirm(
                    'Switch to LIVE mode?\n\nApproved proposals will place REAL orders with REAL money in the pinned agentic account. ' +
                      'The server must have CONFLUENCE_ALLOW_LIVE=true and an account pinned, or this will be rejected.',
                  )
                ) {
                  onSave({ paperMode: false });
                }
              }}
            >
              Live
            </button>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <label className="text-[12px] flex-1" style={{ color: 'var(--text-secondary)' }}>
            Pinned agentic account number
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
              style={field}
              placeholder="e.g. RH-AGENTIC-1234"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </label>
          <button
            className="btn-ghost flex items-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
            disabled={busy || !accountDirty}
            onClick={() => onSave({ agenticAccount: account.trim() })}
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>
          Live orders may target only this account. Required before leaving paper mode.
        </p>
      </div>

      {/* Auto take-profit (synthetic OCO) */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Auto take-profit</div>
            <p className="text-[12px] mt-0.5 max-w-md" style={{ color: 'var(--text-secondary)' }}>
              When a position trades at/through the target you approved at entry, the market-hours poll cancels the
              protective stop and places a GTC limit sell at the target (fills at target or better). If price retreats
              ≥0.5% below the target before it fills, the sell is pulled and the stop re-armed. Off = notification only.
            </p>
          </div>
          <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-default)' }}>
            <button
              className="px-3.5 py-2 text-sm font-medium"
              style={{ background: state.autoTakeProfit ? 'var(--positive-dim)' : 'transparent', color: state.autoTakeProfit ? 'var(--positive)' : 'var(--text-secondary)' }}
              disabled={busy}
              onClick={() => onSave({ autoTakeProfit: true })}
            >
              On
            </button>
            <button
              className="px-3.5 py-2 text-sm font-medium"
              style={{ background: !state.autoTakeProfit ? 'var(--surface-3)' : 'transparent', color: !state.autoTakeProfit ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              disabled={busy}
              onClick={() => onSave({ autoTakeProfit: false })}
            >
              Off
            </button>
          </div>
        </div>
      </div>

      {/* Exposure caps */}
      <div className="card">
        <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Exposure caps</div>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
          Enforced in the execution service before any order is placed — never relies on the model.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Per-position cap ($)
            <input type="number" min="0" step="100" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={field}
              value={perPosition} onChange={(e) => setPerPosition(e.target.value)} />
          </label>
          <label className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Total exposure cap ($)
            <input type="number" min="0" step="100" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={field}
              value={totalCap} onChange={(e) => setTotalCap(e.target.value)} />
          </label>
          <label className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Entry order max age (days)
            <input type="number" min="1" step="1" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={field}
              value={maxAgeDays} onChange={(e) => setMaxAgeDays(e.target.value)} />
            <span className="block mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Unfilled entries older than this are auto-cancelled by the market-hours poll. Protective stops are never auto-cancelled.
            </span>
          </label>
        </div>
        <button
          className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
          disabled={busy || !capsDirty}
          onClick={() =>
            onSave({
              perPositionCapUsd: Number(perPosition),
              totalExposureCapUsd: Number(totalCap),
              entryOrderMaxAgeDays: Number(maxAgeDays),
            })
          }
        >
          <Save className="w-4 h-4" /> Save caps
        </button>
      </div>

      {/* Reconnect Robinhood — the full in-app OAuth flow, plus the cache-clear escape hatch. */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
              <PlugZap className="w-4.5 h-4.5" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Reconnect Robinhood</h3>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                Sign in to Robinhood and approve access — about a minute. The app registers itself and
                stores the new credentials, so use this whenever the connection dies (Robinhood drops
                dynamically-registered clients from time to time). No env edits needed. Places no orders
                and moves no money.
              </p>
              {resetMsg && (
                <p className="text-[12px] mt-2" style={{ color: resetMsg.ok ? 'var(--positive)' : 'var(--negative)' }}>
                  {resetMsg.text}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 flex-shrink-0">
            <a
              className="btn-primary flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm"
              href="/api/confluence/robinhood/oauth/start"
            >
              <PlugZap className="w-4 h-4" /> Reconnect via Robinhood login
            </a>
            <button
              className="btn-ghost flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
              title="Escape hatch for the manual script runbook: drops the Redis-cached client id + tokens so the ROBINHOOD_OAUTH_* env vars re-seed."
              disabled={busy || resetting}
              onClick={async () => {
              setResetting(true);
              setResetMsg(null);
              try {
                const res = await fetch('/api/confluence/robinhood/reset-auth', { method: 'POST' });
                const data = await res.json();
                setResetMsg(
                  res.ok && data.success
                    ? { ok: true, text: `${data.message} (cleared — refresh: ${data.cleared?.refreshToken ? 'yes' : 'none'}, access: ${data.cleared?.accessToken ? 'yes' : 'none'})` }
                    : { ok: false, text: data.error || 'Could not clear the cached credentials.' },
                );
              } catch {
                setResetMsg({ ok: false, text: 'Request failed.' });
              } finally {
                setResetting(false);
              }
            }}
            >
              <PlugZap className="w-4 h-4" /> {resetting ? 'Clearing…' : 'Clear cached credentials'}
            </button>
          </div>
        </div>
      </div>

      {/* Kill switch icon reference kept for a11y parity */}
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <Power className="w-3.5 h-3.5" /> Last updated {new Date(state.updatedAt).toLocaleString()}
        {state.updatedBy ? ` by ${state.updatedBy}` : ''}
      </div>
    </div>
  );
}
