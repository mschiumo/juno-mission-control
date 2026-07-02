import { Info } from 'lucide-react';

/* ----------- Shared types ----------- */

export type Period = 'week' | 'month' | 'year' | 'all';

export interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  shares: number;
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  netPnL?: number;
  status: 'OPEN' | 'CLOSED' | 'PARTIAL';
  strategy?: string;
  brokerAccountId?: string;
  brokerage?: string;
}

export interface EquityCurvePoint {
  date: string;
  label: string;
  cumPnL: number;
  nlv: number;
}

export interface DailyBalance {
  date: string;
  balance: number;
}

export interface ComputedMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  averageTrade: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  currentWinStreak: number;
  maxWinStreak: number;
  currentLossStreak: number;
  maxLossStreak: number;
}

/* ----------- Constants ----------- */

export const PERIOD_LABELS: Record<Period, string> = {
  week: 'Past Week',
  month: 'Past Month',
  year: 'Past Year',
  all: 'All Time',
};

// Plain-English explanations shown on hover next to each metric label.
export const METRIC_TOOLTIPS: Record<string, string> = {
  'Net Profit': 'Total realized P&L across all closed trades in this period (winners minus losers, after fees).',
  'Profit Factor': 'Gross Profit ÷ Gross Loss. Above 1.0 means winners outweigh losers; 1.5+ is solid, 2.0+ is excellent.',
  'Max Drawdown': 'Largest peak-to-trough drop in your equity curve — the worst dollar decline from a high-water mark.',
  'Best Streak': 'Longest consecutive run of winning trades in this period.',
  'Total Trades': 'Number of closed trades counted in this period.',
  'Win Rate': 'Percentage of closed trades that ended with positive P&L (winners ÷ total).',
  'Avg Win': 'Average net profit on winning trades only.',
  'Avg Loss': 'Average net loss on losing trades only.',
  'Winning Trades': 'Count of closed trades with positive net P&L.',
  'Losing Trades': 'Count of closed trades with negative net P&L.',
  'Breakeven': 'Closed trades that finished at exactly $0 net P&L.',
  'Gross Profit': 'Sum of P&L from winning trades only (no losses subtracted).',
  'Gross Loss': 'Sum of P&L from losing trades only (shown as a negative number).',
  'Largest Win': 'Single biggest winning trade by net P&L.',
  'Largest Loss': 'Single biggest losing trade by net P&L.',
  'Avg Trade': 'Average net P&L across every closed trade (winners + losers + breakeven).',
  'Max Win Streak': 'Longest consecutive run of winning trades.',
  'Max Loss Streak': 'Longest consecutive run of losing trades.',
  'Current Streak': 'Your current run — W for consecutive wins, L for consecutive losses.',
  'Unrealized P&L': 'Paper gain/loss on currently open positions at the latest available price.',
  'Realized P&L': 'Booked gain/loss from closed positions in this period.',
  'Market Value': 'Current market value of open positions (shares × latest price).',
};

export const PLACEHOLDER_CURVE = [
  { label: 'Week 1', nlv: 10000 },
  { label: 'Week 2', nlv: 10200 },
  { label: 'Week 3', nlv: 10150 },
  { label: 'Week 4', nlv: 10400 },
  { label: 'Week 5', nlv: 10350 },
  { label: 'Week 6', nlv: 10550 },
  { label: 'Week 7', nlv: 10700 },
  { label: 'Week 8', nlv: 10650 },
  { label: 'Week 9', nlv: 10900 },
  { label: 'Week 10', nlv: 11100 },
];

export const PLACEHOLDER_DOW = [
  { name: 'Mon', pnl: 120 },
  { name: 'Tue', pnl: -40 },
  { name: 'Wed', pnl: 80 },
  { name: 'Thu', pnl: 60 },
  { name: 'Fri', pnl: -20 },
];

/* ----------- Formatters ----------- */

export function formatCurrency(val: number): string {
  const abs = Math.abs(val);
  const formatted = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  return val < 0 ? `-${formatted}` : `+${formatted}`;
}

export function formatDollars(val: number): string {
  return val < 0
    ? `-$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNLV(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/* ----------- Period filtering ----------- */

export function filterByPeriod(trades: Trade[], period: Period): Trade[] {
  if (period === 'all') return trades;
  const now = new Date();
  const cutoff = new Date();
  switch (period) {
    case 'week': cutoff.setDate(now.getDate() - 7); break;
    case 'month': cutoff.setMonth(now.getMonth() - 1); break;
    case 'year': cutoff.setFullYear(now.getFullYear() - 1); break;
  }
  return trades.filter((t) => new Date(t.entryDate) >= cutoff);
}

export function filterBalancesByPeriod(balances: DailyBalance[], period: Period): DailyBalance[] {
  if (period === 'all') return balances;
  const cutoff = new Date();
  switch (period) {
    case 'week': cutoff.setDate(cutoff.getDate() - 7); break;
    case 'month': cutoff.setMonth(cutoff.getMonth() - 1); break;
    case 'year': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
  }
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return balances.filter((b) => b.date >= cutoffDate);
}

/* ----------- Metrics ----------- */

export function computeMetrics(closedTrades: Trade[], startingBalance: number = 0): ComputedMetrics {
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter((t) => (t.netPnL || 0) > 0);
  const losses = closedTrades.filter((t) => (t.netPnL || 0) < 0);
  const breakevens = closedTrades.filter((t) => (t.netPnL || 0) === 0);

  const grossProfit = wins.reduce((s, t) => s + (t.netPnL || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.netPnL || 0), 0));
  const netProfit = closedTrades.reduce((s, t) => s + (t.netPnL || 0), 0);

  const winAmounts = wins.map((t) => t.netPnL || 0);
  const lossAmounts = losses.map((t) => Math.abs(t.netPnL || 0));

  const averageWin = winAmounts.length > 0 ? winAmounts.reduce((a, b) => a + b, 0) / winAmounts.length : 0;
  const averageLoss = lossAmounts.length > 0 ? lossAmounts.reduce((a, b) => a + b, 0) / lossAmounts.length : 0;
  const averageTrade = totalTrades > 0 ? netProfit / totalTrades : 0;

  let maxWinStreak = 0, maxLossStreak = 0, tempWin = 0, tempLoss = 0;
  let currentWinStreak = 0, currentLossStreak = 0;
  for (const t of closedTrades) {
    const pnl = t.netPnL || 0;
    if (pnl > 0) { tempWin++; tempLoss = 0; maxWinStreak = Math.max(maxWinStreak, tempWin); }
    else if (pnl < 0) { tempLoss++; tempWin = 0; maxLossStreak = Math.max(maxLossStreak, tempLoss); }
  }
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    const pnl = closedTrades[i].netPnL || 0;
    if (pnl > 0) { if (currentLossStreak === 0) currentWinStreak++; else break; }
    else if (pnl < 0) { if (currentWinStreak === 0) currentLossStreak++; else break; }
    else break;
  }

  // Max drawdown on the daily equity curve (peak-to-trough decline in
  // end-of-day cumulative P&L). Aggregating to day buckets first avoids
  // overstating drawdown for active intraday traders.
  const pnlByDay = new Map<string, number>();
  for (const t of closedTrades) {
    const date = t.entryDate.split('T')[0];
    pnlByDay.set(date, (pnlByDay.get(date) || 0) + (t.netPnL || 0));
  }
  const sortedDays = [...pnlByDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  let maxDrawdown = 0, peak = 0, running = 0;
  for (const [, pnl] of sortedDays) {
    running += pnl;
    if (running > peak) peak = running;
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }
  const peakNLV = startingBalance + peak;

  return {
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: breakevens.length,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    winRate: totalTrades > 0 ? Number(((wins.length / totalTrades) * 100).toFixed(2)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? Infinity : 0,
    averageWin: Number(averageWin.toFixed(2)),
    averageLoss: Number(averageLoss.toFixed(2)),
    averageTrade: Number(averageTrade.toFixed(2)),
    largestWin: winAmounts.length > 0 ? Number(Math.max(...winAmounts).toFixed(2)) : 0,
    largestLoss: lossAmounts.length > 0 ? Number(Math.max(...lossAmounts).toFixed(2)) : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPercent: peakNLV > 0 ? Number(((maxDrawdown / peakNLV) * 100).toFixed(2)) : 0,
    currentWinStreak,
    maxWinStreak,
    currentLossStreak,
    maxLossStreak,
  };
}

/* ----------- Shared presentational components ----------- */

export function EquityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: EquityCurvePoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const nlv = point.nlv;
  const pnl = point.cumPnL;
  const isPositive = pnl >= 0;

  return (
    <div className="rounded-xl shadow-xl px-4 py-3 min-w-[180px]" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)' }}>
      <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Account Value</span>
          <span className="text-sm font-bold num" style={{ color: 'var(--text-primary)' }}>{formatNLV(nlv)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total P&L</span>
          <span className="text-sm font-semibold num" style={{ color: isPositive ? 'var(--positive)' : 'var(--negative)' }}>
            {formatCurrency(pnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DayOfWeekTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { name: string; pnl: number; trades: number; winRate: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPositive = d.pnl >= 0;

  return (
    <div className="rounded-xl shadow-xl px-4 py-3 min-w-[160px]" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)' }}>
      <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>{d.name}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>P&L</span>
          <span className="text-sm font-bold num" style={{ color: isPositive ? 'var(--positive)' : 'var(--negative)' }}>
            {formatDollars(d.pnl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Trades</span>
          <span className="text-sm font-semibold num" style={{ color: 'var(--text-primary)' }}>{d.trades}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Win Rate</span>
          <span className="text-sm font-semibold num" style={{ color: 'var(--text-primary)' }}>{d.winRate}%</span>
        </div>
      </div>
    </div>
  );
}

export function InfoTooltip({ text, align = 'center' }: { text: string; align?: 'left' | 'center' | 'right' }) {
  const horizontal =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className="group/tip relative inline-flex items-center align-middle ml-1">
      <Info className="w-3 h-3 cursor-help" style={{ color: 'var(--text-tertiary)' }} />
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full mb-1.5 ${horizontal} w-56 px-3 py-2 text-[11px] leading-snug rounded-lg shadow-xl opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-150 z-50 normal-case tracking-normal font-normal whitespace-normal text-left`}
        style={{
          background: 'var(--surface-1, #0d1117)',
          border: '1px solid var(--border-default, #30363d)',
          color: 'var(--text-primary, #c9d1d9)',
        }}
      >
        {text}
      </span>
    </span>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  valueStyle,
  sub,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
  sub?: string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold inline-flex items-center" style={{ color: 'var(--text-tertiary)' }}>
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
      </div>
      <p className="text-base font-bold num" style={{ color: 'var(--text-primary)', ...valueStyle }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  );
}
