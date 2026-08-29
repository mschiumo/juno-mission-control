'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Loader2, LineChart,
  Dumbbell, BookOpen, PenLine,
} from 'lucide-react';

// The weekly review numbers from MJ's 3/6/12-month plan: trading P&L (auto,
// from the trading journal), training days (auto, Strava + workout split),
// journaling days (auto, daily journal), writing days (auto, 'Write' habit
// check-offs). Card balance / debt payoff moved to the Finances tab.

interface Scoreboard {
  week: { start: string; today: string };
  numbers: {
    pnl: number;
    pnlGross?: number;
    pnlFees?: number;
    pnlTrades: number;
    journal: number;
    training: number;
    writing: { days: number; goal: number } | null;
  };
}

const WEEKLY_TARGETS = { training: 5, journal: 7 }; // 3x MT + 2 runs · daily journal

function fmtUSD(n: number): string {
  const abs = Math.abs(n);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: abs < 1000 ? 2 : 0,
    minimumFractionDigits: 0,
  });
}

function weekLabel(start: string): string {
  return new Date(start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// variant 'inline' is the original full-width layout (Fitness card's Scoreboard
// tab); 'card' fills its parent's height with a 2x2 tile grid for the
// standalone ScoreboardCard in the dashboard's right column.
export default function WeeklyScoreboard({ variant = 'inline' }: { variant?: 'inline' | 'card' }) {
  const card = variant === 'card';
  const [data, setData] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/weekly-review?_t=${Date.now()}`);
      const json = await res.json();
      if (json.success) setData(json);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh auto counts when workouts/habits/journal change elsewhere.
  useEffect(() => {
    window.addEventListener('ct:habits-updated', load);
    return () => window.removeEventListener('ct:habits-updated', load);
  }, [load]);

  const numbers = data?.numbers;
  // In card mode tiles stretch to fill the column, so center their content and
  // scale up type/icons; the inline (Fitness tab) sizes are unchanged.
  const tileCls = card
    ? 'bg-[#0d1117] border border-[#30363d] rounded-lg p-4 flex flex-col justify-center'
    : 'bg-[#0d1117] border border-[#30363d] rounded-lg p-3';
  const headCls = card ? 'flex items-center gap-2 mb-2.5' : 'flex items-center gap-1.5 mb-1';
  const labelCls = card
    ? 'text-xs uppercase tracking-wider text-[#8b949e] font-semibold'
    : 'text-[9px] uppercase tracking-wider text-[#8b949e] font-medium';
  const numCls = card ? 'text-3xl font-bold tabular-nums' : 'text-base font-bold tabular-nums';
  const denomCls = card ? 'text-[#484f58] text-base font-semibold' : 'text-[#484f58] text-xs font-semibold';
  const subCls = card ? 'text-[11px] text-[#484f58] mt-1' : 'text-[10px] text-[#484f58] mt-0.5';

  const tileIcon = (Icon: typeof LineChart) =>
    card ? (
      <span className="w-7 h-7 rounded-lg bg-[#F97316]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[#F97316]" />
      </span>
    ) : (
      <Icon className="w-3 h-3 text-[#F97316]" />
    );

  // Card mode only: progress toward the weekly target under each count.
  const targetBar = (value: number, goal: number) =>
    card ? (
      <div className="h-1.5 rounded-full bg-[#161b22] border border-white/5 overflow-hidden mt-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            value >= goal
              ? 'bg-gradient-to-r from-[#22c55e] to-[#4ade80]'
              : 'bg-gradient-to-r from-[#F97316] to-[#f59e0b]'
          }`}
          style={{ width: `${Math.min(100, (value / goal) * 100)}%` }}
        />
      </div>
    ) : null;

  return (
    <div className={card ? 'p-4 h-full flex flex-col' : 'p-4'}>
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className={`flex items-center gap-1.5 ${card ? 'text-[11px] font-medium' : 'text-[10px]'} text-[#8b949e]`}>
          {!card && <ClipboardCheck className="w-3 h-3 text-[#F97316]" />}
          {data ? `Week of ${weekLabel(data.week.start)}` : 'Weekly review'}
        </span>
        <span className="text-[10px] text-[#484f58]">trading p&l · training · journal · writing</span>
      </div>

      {loading && !data ? (
        <div className={`flex items-center justify-center py-6 text-[#8b949e] ${card ? 'flex-1' : ''}`}>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-xs text-[#8b949e]">Couldn&apos;t load the scoreboard — refresh to retry.</p>
      ) : (
        <div className={card ? 'grid grid-cols-2 auto-rows-fr gap-2.5 flex-1 min-h-0' : 'grid grid-cols-2 md:grid-cols-4 gap-2.5'}>
          {/* Trading P&L (auto) */}
          <div className={tileCls}>
            <div className={headCls}>
              {tileIcon(LineChart)}
              <span className={labelCls}>Trading P&L</span>
            </div>
            <span
              className={`${numCls} ${
                numbers!.pnl > 0 ? 'text-[#22c55e]' : numbers!.pnl < 0 ? 'text-[#ef4444]' : 'text-white'
              }`}
            >
              {numbers!.pnl > 0 ? '+' : ''}{fmtUSD(numbers!.pnl)}
            </span>
            <p className={subCls}>
              auto · {numbers!.pnlTrades} closed trade{numbers!.pnlTrades !== 1 ? 's' : ''}
              {numbers!.pnlFees ? ` · after ${fmtUSD(numbers!.pnlFees)} fees` : ' this week'}
            </p>
          </div>

          {/* Training (auto) */}
          <div className={tileCls}>
            <div className={headCls}>
              {tileIcon(Dumbbell)}
              <span className={labelCls}>Training Days</span>
            </div>
            <span className={numCls}>
              <span className={numbers!.training >= WEEKLY_TARGETS.training ? 'text-[#22c55e]' : 'text-white'}>{numbers!.training}</span>
              <span className={denomCls}> / {WEEKLY_TARGETS.training}</span>
            </span>
            <p className={subCls}>auto · Strava + workout split</p>
            {targetBar(numbers!.training, WEEKLY_TARGETS.training)}
          </div>

          {/* Journaling (auto) */}
          <div className={tileCls}>
            <div className={headCls}>
              {tileIcon(BookOpen)}
              <span className={labelCls}>Journaling</span>
            </div>
            <span className={numCls}>
              <span className={numbers!.journal >= WEEKLY_TARGETS.journal ? 'text-[#22c55e]' : 'text-white'}>{numbers!.journal}</span>
              <span className={denomCls}> / {WEEKLY_TARGETS.journal} days</span>
            </span>
            <p className={subCls}>auto · daily journal entries</p>
            {targetBar(numbers!.journal, WEEKLY_TARGETS.journal)}
          </div>

          {/* Writing (auto — 'Write' habit check-offs) */}
          <div className={tileCls}>
            <div className={headCls}>
              {tileIcon(PenLine)}
              <span className={labelCls}>Writing Days</span>
            </div>
            {numbers!.writing ? (
              <>
                <span className={numCls}>
                  <span className={numbers!.writing.days >= numbers!.writing.goal ? 'text-[#22c55e]' : 'text-white'}>
                    {numbers!.writing.days}
                  </span>
                  <span className={denomCls}> / {numbers!.writing.goal} days</span>
                </span>
                <p className={subCls}>auto · &apos;Write&apos; habit check-offs</p>
                {targetBar(numbers!.writing.days, numbers!.writing.goal)}
              </>
            ) : (
              <>
                <span className={card ? 'text-3xl font-bold text-[#484f58]' : 'text-base font-bold text-[#484f58]'}>—</span>
                <p className={subCls}>add a &apos;Write&apos; habit to track this</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
