'use client';

/**
 * Guardrail & safety controls (system_state). This panel is where the hard rules
 * live in the UI: the kill switch (trading_enabled), the paper/live mode gate,
 * the pinned agentic account, and the per-position / total exposure caps. All of
 * these are enforced server-side in the execution service — this panel just
 * edits them.
 */

import { useState } from 'react';
import { ShieldAlert, Power, FlaskConical, Save } from 'lucide-react';
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
  const [account, setAccount] = useState(state.agenticAccount ?? '');

  const capsDirty =
    Number(perPosition) !== state.perPositionCapUsd || Number(totalCap) !== state.totalExposureCapUsd;
  const accountDirty = account.trim() !== (state.agenticAccount ?? '');

  return (
    <div className="flex flex-col gap-4">
      {/* Kill switch / arm execution */}
      <div className="card" style={{ borderColor: state.tradingEnabled ? 'var(--border-default)' : 'var(--negative)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
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
        <div className="flex items-center justify-between gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--warning-dim)' }}>
              <FlaskConical className="w-4.5 h-4.5" style={{ color: 'var(--warning)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Execution mode</div>
              <p className="text-[12px] mt-0.5 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                <b>Paper</b> simulates fills with no money at risk. <b>Live</b> places REAL orders in the pinned agentic account — requires the server flag <code>CONFLUENCE_ALLOW_LIVE</code> and a pinned account.
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
        </div>
        <button
          className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-50"
          disabled={busy || !capsDirty}
          onClick={() => onSave({ perPositionCapUsd: Number(perPosition), totalExposureCapUsd: Number(totalCap) })}
        >
          <Save className="w-4 h-4" /> Save caps
        </button>
      </div>

      {/* Kill switch icon reference kept for a11y parity */}
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <Power className="w-3.5 h-3.5" /> Last updated {new Date(state.updatedAt).toLocaleString()}
        {state.updatedBy ? ` by ${state.updatedBy}` : ''}
      </div>
    </div>
  );
}
