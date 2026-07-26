'use client';

/**
 * Mobile (≤768px) chrome for the terminal: app bar (mark + LIVE pill),
 * scrollable content, and the 4-item bottom tab bar. Mobile is a companion
 * surface — approve proposals, watch stops, kill orders.
 */

import { LayoutGrid, Inbox, BookOpen, MoreHorizontal } from 'lucide-react';
import { Mark, ModePill } from './atoms';

export type MobileTab = 'home' | 'proposals' | 'journal' | 'more';

interface Props {
  active: MobileTab;
  pendingCount: number;
  paperMode: boolean;
  toast: string | null;
  onSelect: (tab: MobileTab) => void;
  onExit: () => void;
  children: React.ReactNode;
}

const TABS: { id: MobileTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'home', label: 'Positions', icon: LayoutGrid },
  { id: 'proposals', label: 'Proposals', icon: Inbox },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export default function MobileShell({ active, pendingCount, paperMode, toast, onSelect, onExit, children }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* App bar */}
      <div className="flex-none flex items-center justify-between" style={{ padding: '10px 20px 14px' }}>
        <button className="flex items-center gap-2.5" onClick={onExit} title="Back to Confluence dashboard">
          <Mark size={26} />
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ct-text)' }}>
            Confluence
          </span>
        </button>
        <ModePill paperMode={paperMode} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[70]"
          style={{
            bottom: 'calc(96px + env(safe-area-inset-bottom))',
            padding: '10px 16px',
            borderRadius: 10,
            background: 'var(--ct-surface-3)',
            border: '1px solid var(--ct-border-strong)',
            color: 'var(--ct-text)',
            fontFamily: 'var(--ct-sans)',
            fontSize: 12.5,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Tab bar */}
      <div
        className="flex-none grid grid-cols-4 items-start"
        style={{
          background: 'var(--ct-bg-elevated)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: 11,
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          minHeight: 84,
        }}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const Icon = tab.icon;
          const color = isActive ? 'var(--ct-accent)' : 'var(--ct-faint)';
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className="relative flex flex-col items-center justify-center gap-[5px]"
              style={{ minHeight: 44 }}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color }} />
              <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 10.5, fontWeight: isActive ? 600 : 500, color }}>
                {tab.label}
              </span>
              {tab.id === 'proposals' && pendingCount > 0 && (
                <span
                  className="ct-num absolute flex items-center justify-center"
                  style={{
                    top: -2,
                    right: 22,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 99,
                    background: 'var(--ct-accent)',
                    color: 'var(--ct-accent-fg)',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
