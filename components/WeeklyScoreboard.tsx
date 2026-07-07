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

export default function WeeklyScoreboard() {
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

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
          <ClipboardCheck className="w-3 h-3 text-[#F97316]" />
          {data ? `Week of ${weekLabel(data.week.start)}` : 'Weekly review'}
        </span>
        <span className="text-[10px] text-[#484f58]">trading p&l · training · journal · writing</span>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-6 text-[#8b949e]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-xs text-[#8b949e]">Couldn&apos;t load the scoreboard — refresh to retry.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Trading P&L (auto) */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <LineChart className="w-3 h-3 text-[#F97316]" />
              <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Trading P&L</span>
            </div>
            <span
              className={`text-base font-bold tabular-nums ${
                numbers!.pnl > 0 ? 'text-[#22c55e]' : numbers!.pnl < 0 ? 'text-[#ef4444]' : 'text-white'
              }`}
            >
              {numbers!.pnl > 0 ? '+' : ''}{fmtUSD(numbers!.pnl)}
            </span>
            <p className="text-[10px] text-[#484f58] mt-0.5">
              auto · {numbers!.pnlTrades} closed trade{numbers!.pnlTrades !== 1 ? 's' : ''} this week
            </p>
          </div>

          {/* Training (auto) */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Dumbbell className="w-3 h-3 text-[#F97316]" />
              <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Training Days</span>
            </div>
            <span className="text-base font-bold tabular-nums">
              <span className={numbers!.training >= WEEKLY_TARGETS.training ? 'text-[#22c55e]' : 'text-white'}>{numbers!.training}</span>
              <span className="text-[#484f58] text-xs font-semibold"> / {WEEKLY_TARGETS.training}</span>
            </span>
            <p className="text-[10px] text-[#484f58] mt-0.5">auto · Strava + workout split</p>
          </div>

          {/* Journaling (auto) */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <BookOpen className="w-3 h-3 text-[#F97316]" />
              <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Journaling</span>
            </div>
            <span className="text-base font-bold tabular-nums">
              <span className={numbers!.journal >= WEEKLY_TARGETS.journal ? 'text-[#22c55e]' : 'text-white'}>{numbers!.journal}</span>
              <span className="text-[#484f58] text-xs font-semibold"> / {WEEKLY_TARGETS.journal} days</span>
            </span>
            <p className="text-[10px] text-[#484f58] mt-0.5">auto · daily journal entries</p>
          </div>

          {/* Writing (auto — 'Write' habit check-offs) */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <PenLine className="w-3 h-3 text-[#F97316]" />
              <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Writing Days</span>
            </div>
            {numbers!.writing ? (
              <>
                <span className="text-base font-bold tabular-nums">
                  <span className={numbers!.writing.days >= numbers!.writing.goal ? 'text-[#22c55e]' : 'text-white'}>
                    {numbers!.writing.days}
                  </span>
                  <span className="text-[#484f58] text-xs font-semibold"> / {numbers!.writing.goal} days</span>
                </span>
                <p className="text-[10px] text-[#484f58] mt-0.5">auto · &apos;Write&apos; habit check-offs</p>
              </>
            ) : (
              <>
                <span className="text-base font-bold text-[#484f58]">—</span>
                <p className="text-[10px] text-[#484f58] mt-0.5">add a &apos;Write&apos; habit to track this</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
