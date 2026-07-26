'use client';

/**
 * Mobile "More" tab — a plain list. Deep analysis stays on desktop; the
 * secondary Agents sections open in place, and app-level destinations exit the
 * terminal back to the standard shell.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AuditEvent, SystemState } from '@/types/confluence';
import AuditLog from '../AuditLog';
import PerformancePanel from '../PerformancePanel';
import ReviewPanel from '../ReviewPanel';
import StrategyPanel from '../StrategyPanel';
import SettingsPanel from '../SettingsPanel';
import type { TradingDestination } from './Sidebar';

type Section = 'performance' | 'review' | 'audit' | 'strategy' | 'settings';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'performance', label: 'Performance' },
  { id: 'review', label: 'Review' },
  { id: 'audit', label: 'Audit' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'settings', label: 'Settings' },
];

const APP_LINKS: { id: TradingDestination; label: string }[] = [
  { id: 'trade-management', label: 'Trade management' },
  { id: 'market', label: 'Market' },
  { id: 'performance', label: 'Trading performance' },
  { id: 'goals', label: 'Trading goals' },
  { id: 'projection', label: 'Profit projection' },
];

interface Props {
  state: SystemState | null;
  audit: AuditEvent[];
  busy: boolean;
  onSaveState: (updates: Partial<SystemState>) => void;
  onNavigate: (dest: TradingDestination) => void;
  onExit: () => void;
}

export default function MobileMore({ state, audit, busy, onSaveState, onNavigate, onExit }: Props) {
  const [section, setSection] = useState<Section | null>(null);

  if (section) {
    return (
      <div className="flex flex-col" style={{ padding: '0 20px 20px', gap: 14 }}>
        <button className="flex items-center gap-1 self-start" style={{ color: 'var(--ct-dim)', fontFamily: 'var(--ct-sans)', fontSize: 13, fontWeight: 600, minHeight: 44 }} onClick={() => setSection(null)}>
          <ChevronLeft className="w-4 h-4" /> More
        </button>
        {/* Existing desktop panels rendered as-is — "best viewed on desktop". */}
        {section === 'performance' && <PerformancePanel />}
        {section === 'review' && <ReviewPanel />}
        {section === 'audit' && <AuditLog events={audit} />}
        {section === 'strategy' && <StrategyPanel />}
        {section === 'settings' && state && <SettingsPanel state={state} busy={busy} onSave={onSaveState} />}
      </div>
    );
  }

  const row = (label: string, onClick: () => void, key: string) => (
    <button
      key={key}
      onClick={onClick}
      className="flex items-center justify-between w-full"
      style={{
        minHeight: 48,
        padding: '0 14px',
        borderRadius: 12,
        background: 'var(--ct-surface)',
        border: '1px solid var(--ct-border)',
        fontFamily: 'var(--ct-sans)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--ct-text-body)',
      }}
    >
      {label}
      <ChevronRight className="w-4 h-4" style={{ color: 'var(--ct-ghost)' }} />
    </button>
  );

  return (
    <div className="flex flex-col" style={{ padding: '0 20px 20px', gap: 9 }}>
      <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ct-text)', paddingBottom: 8 }}>
        More
      </span>
      <span className="ct-eyebrow" style={{ padding: '2px 0 3px' }}>AGENTS</span>
      {SECTIONS.map((s) => row(s.label, () => setSection(s.id), s.id))}
      <span className="ct-eyebrow" style={{ padding: '10px 0 3px' }}>APP</span>
      {APP_LINKS.map((l) => row(l.label, () => onNavigate(l.id), l.id))}
      {row('Dashboard', onExit, 'dashboard')}
    </div>
  );
}
