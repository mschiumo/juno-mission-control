'use client';

/**
 * Desktop sidebar (≥1280px full 212px; 769–1279px collapses to a 64px icon
 * rail). Agents is this screen; every other item navigates back to the
 * existing Trading sub-tabs, which keep their current shell.
 */

import {
  Sparkles,
  Settings,
  BookOpen,
  TrendingUp,
  BarChart3,
  Target,
  Calculator,
} from 'lucide-react';
import { Mark } from './atoms';
import { maskAcct, money } from './format';

export type TradingDestination =
  | 'trade-management'
  | 'overview'
  | 'market'
  | 'performance'
  | 'goals'
  | 'projection';

const TRADE_GROUP: { id: TradingDestination | 'agents'; label: string; icon: typeof Sparkles }[] = [
  { id: 'agents', label: 'Agents', icon: Sparkles },
  { id: 'trade-management', label: 'Trade management', icon: Settings },
  { id: 'overview', label: 'Journal', icon: BookOpen },
  { id: 'market', label: 'Market', icon: TrendingUp },
];

const REVIEW_GROUP: { id: TradingDestination; label: string; icon: typeof Sparkles }[] = [
  { id: 'performance', label: 'Performance', icon: BarChart3 },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'projection', label: 'Profit projection', icon: Calculator },
];

interface Props {
  pendingCount: number;
  buyingPower: number | null;
  buyingPowerConstrained: boolean;
  account?: string;
  paperMode: boolean;
  onNavigate: (dest: TradingDestination) => void;
  onExit: () => void;
}

export default function Sidebar({ pendingCount, buyingPower, buyingPowerConstrained, account, paperMode, onNavigate, onExit }: Props) {
  const renderItem = (item: { id: TradingDestination | 'agents'; label: string; icon: typeof Sparkles }) => {
    const active = item.id === 'agents';
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`ct-navitem justify-center xl:justify-start ${active ? 'active' : ''}`}
        onClick={() => !active && onNavigate(item.id as TradingDestination)}
        title={item.label}
      >
        <Icon className="w-3.5 h-3.5 flex-none" style={{ color: active ? 'var(--ct-accent-text)' : 'var(--ct-faint)' }} />
        <span className="hidden xl:block truncate">{item.label}</span>
        {item.id === 'agents' && pendingCount > 0 && (
          <span
            className="ct-num ml-auto hidden xl:flex items-center justify-center"
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
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
  };

  return (
    <aside
      className="flex-none w-16 xl:w-[212px] flex flex-col gap-[22px]"
      style={{ background: 'var(--ct-bg-elevated)', borderRight: '1px solid var(--ct-border)', padding: '18px 12px' }}
    >
      {/* Wordmark — clicking it exits the terminal back to the dashboard */}
      <button className="flex items-center gap-2.5 px-1.5 text-left" onClick={onExit} title="Back to Confluence dashboard">
        <Mark size={28} />
        <div className="hidden xl:flex flex-col min-w-0">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ct-text)' }}>
            Confluence
          </span>
          <span style={{ fontFamily: 'var(--ct-mono)', fontSize: 8.5, fontWeight: 500, letterSpacing: '0.13em', color: 'var(--ct-label)' }}>
            TRADING TERMINAL
          </span>
        </div>
      </button>

      <div className="flex flex-col gap-0.5">
        <div className="ct-eyebrow hidden xl:block" style={{ fontSize: 9.5, letterSpacing: '0.13em', color: 'var(--ct-ghost)', padding: '0 8px 8px' }}>
          TRADE
        </div>
        {TRADE_GROUP.map(renderItem)}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="ct-eyebrow hidden xl:block" style={{ fontSize: 9.5, letterSpacing: '0.13em', color: 'var(--ct-ghost)', padding: '0 8px 8px' }}>
          REVIEW
        </div>
        {REVIEW_GROUP.map(renderItem)}
      </div>

      {/* Buying-power card pinned to the bottom */}
      <div
        className="mt-auto hidden xl:flex flex-col gap-[7px]"
        style={{ padding: 12, borderRadius: 11, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
      >
        <span className="ct-eyebrow" style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.1em' }}>
          BUYING POWER
        </span>
        <span className="ct-num" style={{ fontSize: 18, fontWeight: 600, color: buyingPowerConstrained ? 'var(--ct-neg)' : 'var(--ct-text)' }}>
          {buyingPower != null ? money(buyingPower) : '—'}
        </span>
        <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 11, color: 'var(--ct-faint)' }}>
          acct {maskAcct(account)} · {paperMode ? 'paper' : 'Robinhood'}
        </span>
      </div>
    </aside>
  );
}
