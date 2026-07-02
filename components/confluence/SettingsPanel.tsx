'use client';

/**
 * Guardrail & safety controls. This panel is where the hard rules live in the
 * UI: the kill switch, the paper/live mode gate, and the per-position / total
 * exposure caps. The caps and switches are enforced server-side in the
 * execution service — this panel just edits them.
 */

import { useState } from 'react';
import { ShieldAlert, Power, FlaskConical, Save } from 'lucide-react';
import type { ConfluenceSettings } from '@/types/confluence';

interface Props {
  settings: ConfluenceSettings;
  busy: boolean;
  onSave: (updates: Partial<ConfluenceSettings>) => void;
}

const field = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-default)',
} as const;

export default function SettingsPanel({ settings, busy, onSave }: Props) {
  const [perPosition, setPerPosition] = useState(String(settings.perPositionCapUsd));
  const [totalCap, setTotalCap] = useState(String(settings.totalExposureCapUsd));

  const capsDirty =
    Number(perPosition) !== settings.perPositionCapUsd ||
    Number(totalCap) !== settings.totalExposureCapUsd;

  return (
    <div className="flex flex-col gap-4">
      {/* Kill switch */}
      <div className="card" style={{ borderColor: settings.killSwitch ? 'var(--negative)' : 'var(--border-default)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--negative-dim)' }}>
              <ShieldAlert className="w-4.5 h-4.5" style={{ color: 'var(--negative)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Kill switch</div>
              <p className="text-[12px] mt-0.5 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                When engaged, the execution service refuses to place any order regardless of approvals.
              </p>
            </div>
          </div>
          <button
            className="px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0 disabled:opacity-50"
            style={{
              background: settings.killSwitch ? 'var(--negative)' : 'var(--surface-3)',
              color: settings.killSwitch ? '#fff' : 'var(--text-secondary)',
            }}
            disabled={busy}
            onClick={() => onSave({ killSwitch: !settings.killSwitch })}
          >
            {settings.killSwitch ? 'ENGAGED — release' : 'Engage'}
          </button>
        </div>
      </div>

      {/* Mode + enabled */}
      <div className="card">
        <div className="flex items-center justify-between gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--warning-dim)' }}>
              <FlaskConical className="w-4.5 h-4.5" style={{ color: 'var(--warning)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Execution mode</div>
              <p className="text-[12px] mt-0.5 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                <b>Paper</b> simulates fills with no money at risk. <b>Live</b> places real orders — unavailable until the Robinhood adapter ships (Milestone 3).
              </p>
            </div>
          </div>
          <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-default)' }}>
            <button
              className="px-3.5 py-2 text-sm font-medium"
              style={{ background: settings.mode === 'paper' ? 'var(--accent)' : 'transparent', color: settings.mode === 'paper' ? '#fff' : 'var(--text-secondary)' }}
              disabled={busy}
              onClick={() => onSave({ mode: 'paper' })}
            >
              Paper
            </button>
            <button
              className="px-3.5 py-2 text-sm font-medium disabled:opacity-40"
              style={{ background: settings.mode === 'live' ? 'var(--negative)' : 'transparent', color: settings.mode === 'live' ? '#fff' : 'var(--text-tertiary)' }}
              disabled
              title="Live execution ships in Milestone 3"
            >
              Live
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-3)' }}>
              <Power className="w-4.5 h-4.5" style={{ color: settings.enabled ? 'var(--positive)' : 'var(--text-tertiary)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Feature enabled</div>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Master switch for proposal execution.
              </p>
            </div>
          </div>
          <button
            className="px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0"
            style={{ background: settings.enabled ? 'var(--positive-dim)' : 'var(--surface-3)', color: settings.enabled ? 'var(--positive)' : 'var(--text-secondary)' }}
            disabled={busy}
            onClick={() => onSave({ enabled: !settings.enabled })}
          >
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Exposure caps */}
      <div className="card">
        <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Exposure caps</div>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
          Enforced in the execution service before any order is placed — never relies on the model.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            Per-position cap ($)
            <input type="number" min="0" step="100" className="w-full mt-1 px-3 py-2 rounded-lg text-sm" style={field}
              value={perPosition} onChange={(e) => setPerPosition(e.target.value)} />
          </label>
          <label className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
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
    </div>
  );
}
