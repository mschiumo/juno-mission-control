'use client';

import { BookOpen, BarChart3, TrendingUp, Newspaper, Settings, Target, Calculator, Sparkles, GraduationCap, Star, Upload, Check, Pencil, Trash2, ArrowRight } from 'lucide-react';

/**
 * Illustrative mockups for the Docs sub-tab. These are hand-built miniatures of
 * real screens, rendered with the app's design tokens so they always match the
 * product theme. They contain sample data only — never live user data — and are
 * wrapped in <Figure>, which marks them decorative.
 */

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function SubTabBarFigure() {
  const tabs = [
    { label: 'Journal', icon: BookOpen, active: true },
    { label: 'Market', icon: TrendingUp },
    { label: 'Market News', icon: Newspaper },
    { label: 'Trade Management', icon: Settings },
    { label: 'Goals', icon: Target },
    { label: 'Performance', icon: BarChart3 },
    { label: 'Profit Projection', icon: Calculator },
    { label: 'Agents', icon: Sparkles },
    { label: 'Docs', icon: GraduationCap },
  ];
  return (
    <div className="flex gap-1 min-w-[720px]" style={{ borderBottom: '1px solid var(--border-default)' }}>
      {tabs.map(({ label, icon: Icon, active }) => (
        <div
          key={label}
          className="flex items-center gap-1.5 px-3 pb-2 text-xs font-medium whitespace-nowrap"
          style={{
            color: active ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          <Icon className="w-3 h-3" />
          {label}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journal calendar
// ---------------------------------------------------------------------------

function CalendarCell({
  day,
  pnl,
  trades,
  journaled,
  today,
}: {
  day: number;
  pnl?: number;
  trades?: number;
  journaled?: boolean;
  today?: boolean;
}) {
  const pos = (pnl ?? 0) > 0;
  return (
    <div
      className="relative rounded-lg p-1.5 h-[76px] flex flex-col"
      style={{
        background: 'var(--surface-1)',
        border: today ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
        boxShadow: today ? '0 0 0 1px var(--accent-glow) inset' : undefined,
      }}
    >
      <div className="flex items-start justify-between text-[10px]">
        <span style={{ color: 'var(--text-tertiary)' }}>{day}</span>
        {pnl !== undefined && (
          <span className="num font-semibold" style={{ color: pos ? 'var(--positive)' : 'var(--negative)' }}>
            {pos ? '+' : '−'}${Math.abs(pnl)}
          </span>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center gap-1.5">
        {trades !== undefined && (
          <span
            className="relative w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: pos ? 'var(--positive-dim)' : 'var(--negative-dim)', border: `1px solid ${pos ? 'var(--positive)' : 'var(--negative)'}` }}
          >
            <BarChart3 className="w-3 h-3" style={{ color: pos ? 'var(--positive)' : 'var(--negative)' }} />
            {trades > 1 && (
              <span
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
                style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
              >
                {trades}
              </span>
            )}
          </span>
        )}
        <span
          className="relative w-6 h-6 rounded-full flex items-center justify-center"
          style={
            journaled
              ? { background: 'var(--info-dim)', border: '1px solid var(--info)' }
              : { border: '1px dashed var(--border-strong)' }
          }
        >
          <BookOpen className="w-3 h-3" style={{ color: journaled ? 'var(--info)' : 'var(--text-tertiary)' }} />
          {journaled && (
            <span
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--info)' }}
            >
              <Check className="w-2 h-2" style={{ color: '#04121f' }} />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function CalendarWeekFigure() {
  return (
    <div className="min-w-[540px] space-y-2">
      <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <CalendarCell day={13} pnl={412} trades={3} journaled />
        <CalendarCell day={14} pnl={-185} trades={1} journaled />
        <CalendarCell day={15} journaled />
        <CalendarCell day={16} pnl={96} trades={2} />
        <CalendarCell day={17} today />
      </div>
      <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--positive)' }} /> Profitable day
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--negative)' }} /> Losing day
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--info)' }} /> Journal saved
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ border: '1px dashed var(--border-strong)' }} /> No entry yet
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ border: '1px solid var(--accent)' }} /> Today
        </span>
      </div>
    </div>
  );
}

export function JournalModalFigure() {
  const prompts = [
    { q: 'What went well today?', a: 'Waited for the pullback instead of chasing the open.' },
    { q: 'What could you improve?', a: 'Sized the second NVDA entry too large for the setup.' },
    { q: 'Did you follow your trading plan?', a: 'Yes — both entries were on the plan. Skipped one impulse trade.' },
    { q: 'Other (optional)', a: '' },
  ];
  return (
    <div className="max-w-md mx-auto rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Journal — Thursday, Jul 16
      </div>
      {prompts.map(({ q, a }) => (
        <div key={q} className="space-y-1">
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {q}
          </div>
          <div
            className="rounded-lg px-2.5 py-2 text-xs min-h-[34px]"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: a ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            {a || 'Anything else worth remembering…'}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <span className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
          Cancel
        </span>
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: '#1a0d02' }}>
          Save Entry
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trades table
// ---------------------------------------------------------------------------

export function TradesTableFigure() {
  const rows = [
    { date: 'Jul 16, 9:42 AM', sym: 'NVDA', pnl: 148.2, status: 'CLOSED' },
    { date: 'Jul 16, 10:15 AM', sym: 'TSLA', pnl: -52.1, status: 'CLOSED' },
    { date: 'Jul 16, 2:03 PM', sym: 'AAPL', pnl: 0, status: 'OPEN' },
  ];
  return (
    <div className="min-w-[480px] rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
      <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_auto] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
        <span>Date/Time ↓</span>
        <span>Symbol</span>
        <span>PnL</span>
        <span>Status</span>
        <span className="w-12" />
      </div>
      {rows.map((r) => (
        <div
          key={r.date}
          className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_auto] gap-2 items-center px-3 py-2 text-xs"
          style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border-subtle)' }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>{r.date}</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {r.sym}
          </span>
          <span className="num font-semibold" style={{ color: r.pnl > 0 ? 'var(--positive)' : r.pnl < 0 ? 'var(--negative)' : 'var(--text-tertiary)' }}>
            {r.pnl > 0 ? '+' : r.pnl < 0 ? '−' : ''}${Math.abs(r.pnl).toFixed(2)}
          </span>
          <span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={
                r.status === 'CLOSED'
                  ? { background: 'var(--positive-dim)', color: 'var(--positive)' }
                  : { background: 'var(--warning-dim)', color: 'var(--warning)' }
              }
            >
              {r.status}
            </span>
          </span>
          <span className="flex items-center gap-1.5 w-12 justify-end" style={{ color: 'var(--text-tertiary)' }}>
            <Pencil className="w-3 h-3" />
            <Trash2 className="w-3 h-3" />
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function ImportDropzoneFigure() {
  return (
    <div className="max-w-md mx-auto rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Import Trades
      </div>
      <div
        className="rounded-xl px-4 py-8 text-center space-y-2"
        style={{ border: '2px dashed var(--border-strong)', background: 'var(--surface-1)' }}
      >
        <Upload className="w-6 h-6 mx-auto" style={{ color: 'var(--accent)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Drop your CSV file here
        </div>
        <div className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          In thinkorswim: Monitor → Account Statement → export to CSV.
          <br />
          Generic trade CSVs work too.
        </div>
        <span
          className="inline-block px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent-light)', border: '1px solid var(--border-default)' }}
        >
          Select File
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Need a template? <span style={{ color: 'var(--info)' }}>Download CSV</span>
        </span>
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--positive)', color: '#03150f' }}>
          Import Trades
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade management
// ---------------------------------------------------------------------------

export function PositionCalculatorFigure() {
  const outputs = [
    { label: 'Stop Size', value: '$0.50' },
    { label: 'Shares', value: '100' },
    { label: 'R:R', value: '2.0' },
    { label: 'Profit', value: '$100' },
    { label: 'Position', value: '$2,450' },
  ];
  return (
    <div className="min-w-[460px] max-w-lg mx-auto space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Ticker', value: 'NVDA' },
          { label: 'Risk ($)', value: '50' },
          { label: 'Min R:R', value: '2:1' },
          { label: 'Entry', value: '24.50' },
          { label: 'Stop', value: '24.00' },
          { label: 'Target', value: '25.50' },
        ].map(({ label, value }) => (
          <div key={label} className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {label}
            </div>
            <div
              className="rounded-lg px-2.5 py-1.5 text-xs num font-medium"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {outputs.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg px-2 py-2.5 text-center"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
          >
            <div className="text-sm font-bold num" style={{ color: 'var(--accent)' }}>
              {value}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatchlistFlowFigure() {
  const stage = (title: string, sub: string, color: string) => (
    <div className="rounded-xl px-3 py-2.5 text-center min-w-[118px]" style={{ background: 'var(--surface-2)', border: `1px solid ${color}` }}>
      <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </div>
      <div className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-tertiary)' }}>
        {sub}
      </div>
    </div>
  );
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap min-w-[560px]">
      {stage('Potential Trades', 'planned entry, stop, target', 'var(--info)')}
      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      {stage('Active Trades', 'live position, notes', 'var(--warning)')}
      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      {stage('Closed Positions', 'exit recorded', 'var(--positive)')}
      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
      {stage('Journal Calendar', 'transferred to a date', 'var(--accent)')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export function GapScannerFigure() {
  const rows = [
    { sym: 'ABCD', gap: '+18.4%', vol: '12.6M', price: '$4.21', starred: true },
    { sym: 'WXYZ', gap: '+11.2%', vol: '8.1M', price: '$7.88', starred: false },
    { sym: 'QRST', gap: '+7.9%', vol: '5.4M', price: '$12.30', starred: false },
  ];
  return (
    <div className="min-w-[440px] rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--surface-2)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Gap Scanner
        </span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}>
          Pre-Market
        </span>
      </div>
      {rows.map((r) => (
        <div
          key={r.sym}
          className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 items-center px-3 py-2 text-xs"
          style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border-subtle)' }}
        >
          <Star className="w-3.5 h-3.5" style={{ color: r.starred ? 'var(--warning)' : 'var(--text-tertiary)', fill: r.starred ? 'var(--warning)' : 'none' }} />
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {r.sym}
          </span>
          <span className="num font-semibold" style={{ color: 'var(--positive)' }}>
            {r.gap}
          </span>
          <span className="num" style={{ color: 'var(--text-secondary)' }}>
            {r.vol}
          </span>
          <span className="num" style={{ color: 'var(--text-secondary)' }}>
            {r.price}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export function EquityCurveFigure() {
  // Hand-drawn sample curve — sample data, upward drift with a drawdown.
  const path = 'M0,72 L20,68 L40,70 L60,60 L80,63 L100,52 L120,56 L140,44 L160,48 L180,34 L200,38 L220,26 L240,30 L260,18 L280,12';
  return (
    <div className="min-w-[420px] max-w-xl mx-auto rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        Net Liquidating Value — All Time
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold num" style={{ color: 'var(--text-primary)' }}>
          $27,412
        </span>
        <span className="text-xs num font-semibold" style={{ color: 'var(--positive)' }}>
          +$2,412 (+9.6%)
        </span>
      </div>
      <svg viewBox="0 0 280 84" className="w-full h-24" preserveAspectRatio="none">
        <defs>
          <linearGradient id="docs-eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00C896" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00C896" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L280,84 L0,84 Z`} fill="url(#docs-eq-fill)" />
        <path d={path} fill="none" stroke="#00C896" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="grid grid-cols-4 gap-2 pt-1 text-center">
        {[
          { label: 'Total Trades', value: '64' },
          { label: 'Win Rate', value: '58%' },
          { label: 'Avg Win', value: '$96' },
          { label: 'Avg Loss', value: '−$51' },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-sm font-bold num" style={{ color: 'var(--text-primary)' }}>
              {value}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricCardsFigure() {
  const cards = [
    { label: 'Net Profit', value: '+$2,412', color: 'var(--positive)' },
    { label: 'Profit Factor', value: '1.84', color: 'var(--text-primary)' },
    { label: 'Max Drawdown', value: '−$618', color: 'var(--negative)' },
    { label: 'Best Streak', value: '6W', color: 'var(--text-primary)' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-[420px]">
      {cards.map(({ label, value, color }) => (
        <div key={label} className="rounded-xl px-3 py-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
          <div className="text-lg font-bold num" style={{ color }}>
            {value}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function GoalCardFigure() {
  return (
    <div className="max-w-md mx-auto rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            Earn $1,050 by July 31
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Net profit · Jul 1 – Jul 31
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: 'var(--positive-dim)', color: 'var(--positive)' }}>
          On track
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs num">
          <span style={{ color: 'var(--text-primary)' }}>$642</span>
          <span style={{ color: 'var(--text-tertiary)' }}>$1,050</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
          <div className="h-full rounded-full" style={{ width: '61%', background: 'var(--positive)' }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Pace needed', value: '$45/day', hot: true },
          { label: 'Your pace', value: '$58/day' },
          { label: 'Projected', value: '$1,220' },
        ].map(({ label, value, hot }) => (
          <div
            key={label}
            className="rounded-lg px-2 py-2"
            style={{ background: hot ? 'var(--accent-dim)' : 'var(--surface-2)', border: '1px solid var(--border-default)' }}
          >
            <div className="text-xs font-bold num" style={{ color: hot ? 'var(--accent)' : 'var(--text-primary)' }}>
              {value}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: 'var(--text-tertiary)' }}>9 trading days left · on pace</span>
        <span className="flex items-center gap-1" style={{ color: 'var(--warning)' }}>
          🛡 Max daily loss ≤ $300 · ok ($120)
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profit projection
// ---------------------------------------------------------------------------

export function ProjectionFigure() {
  const tiles = [
    { label: 'Per Day', value: '$45' },
    { label: 'Per Week', value: '$225' },
    { label: 'Per Month', value: '$945' },
    { label: 'Per Year', value: '$11,340', hot: true },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-[420px]">
      {tiles.map(({ label, value, hot }) => (
        <div
          key={label}
          className="rounded-xl px-3 py-3 text-center"
          style={{
            background: hot ? 'var(--accent-dim)' : 'var(--surface-1)',
            border: hot ? '1px solid var(--accent)' : '1px solid var(--border-default)',
          }}
        >
          <div className="text-lg font-bold num" style={{ color: hot ? 'var(--accent)' : 'var(--text-primary)' }}>
            {value}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function ProposalCardFigure() {
  return (
    <div className="max-w-md mx-auto rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          JNJ · BUY
        </span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}>
          Pending
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Pullback to the 50-day in an uptrend; value gate passed (P/E below sector median, positive FCF). Entry at prior support.
      </p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Limit', value: '$151.20' },
          { label: 'Qty', value: '3' },
          { label: 'Stop', value: '$147.50' },
          { label: 'Target', value: '$159.00' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg px-1.5 py-1.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
            <div className="text-[11px] font-bold num" style={{ color: 'var(--text-primary)' }}>
              {value}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <span className="flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--positive)', color: '#03150f' }}>
          Approve
        </span>
        <span className="flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
          Edit
        </span>
        <span className="flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: '1px solid var(--negative)', color: 'var(--negative)' }}>
          Reject
        </span>
      </div>
    </div>
  );
}

export function ScorecardFigure() {
  const kpis = [
    { label: 'Win rate', value: '62%', sub: '8W / 5L of 13' },
    { label: 'Payoff ratio', value: '1.9', sub: 'avg win / avg loss' },
    { label: 'Expectancy', value: '+$31', sub: 'per round trip' },
    { label: 'Net P/L', value: '+$402', sub: 'gross − fees' },
  ];
  const bars = [
    { r: '≤−2R', h: 10, neg: true },
    { r: '−1R', h: 26, neg: true },
    { r: '0R', h: 16, neg: true },
    { r: '+1R', h: 34, neg: false },
    { r: '+2R', h: 22, neg: false },
    { r: '≥+3R', h: 12, neg: false },
  ];
  return (
    <div className="min-w-[460px] max-w-xl mx-auto space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {kpis.map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl px-2.5 py-2.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
            <div className="text-base font-bold num" style={{ color: 'var(--text-primary)' }}>
              {value}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {label}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {sub}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>
          R-multiple distribution
        </div>
        <div className="flex items-end justify-around h-16 gap-2">
          {bars.map(({ r, h, neg }) => (
            <div key={r} className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full rounded-t" style={{ height: h, background: neg ? 'var(--negative)' : 'var(--positive)', opacity: 0.85 }} />
              <span className="text-[8px] num" style={{ color: 'var(--text-tertiary)' }}>
                {r}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
