'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Pencil, Loader2, TrendingDown, TrendingUp,
  Landmark, Dumbbell, NotebookPen, Megaphone, Check, X,
} from 'lucide-react';

// The "four numbers" from MJ's 3/6/12-month plan (weekly review) + debt
// thermometer. Training and trade-journal counts auto-fill; card balance and
// posts are deliberate manual entries.

interface Pace {
  expectedPct: number;
  actualPct: number;
  onPace: boolean;
  targetPct: number;
  targetDate: string;
}

interface DebtPayload {
  configured: boolean;
  startBalance?: number;
  startDate?: string;
  current?: number;
  pctPaid?: number;
  paidOff?: number;
  projectedFreeDate?: string | null;
  pace?: Pace;
}

interface Scoreboard {
  week: { start: string; today: string };
  numbers: {
    cardBalance: number | null;
    prevCardBalance: number | null;
    trades: number;
    training: number;
    posts: number;
  };
  debt: DebtPayload;
}

const WEEKLY_TARGETS = { training: 5, trades: 5, posts: 3 }; // 3x MT + 2 runs · trading weekdays · IG cadence

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function weekLabel(start: string): string {
  return new Date(start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function WeeklyScoreboard() {
  const [data, setData] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inline editors
  const [editing, setEditing] = useState<'balance' | 'posts' | 'start' | null>(null);
  const [draft, setDraft] = useState('');

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

  // Refresh training count when workouts/habits change elsewhere.
  useEffect(() => {
    window.addEventListener('ct:habits-updated', load);
    return () => window.removeEventListener('ct:habits-updated', load);
  }, [load]);

  async function save(payload: { cardBalance?: number; postsPublished?: number; startBalance?: number }) {
    setSaving(true);
    try {
      const res = await fetch('/api/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) setData(json);
    } catch {
      /* user can retry */
    } finally {
      setSaving(false);
      setEditing(null);
      setDraft('');
    }
  }

  function submitDraft() {
    const value = parseFloat(draft.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(value) || value < 0) return;
    if (editing === 'balance') save({ cardBalance: value });
    if (editing === 'posts') save({ postsPublished: Math.round(value) });
    if (editing === 'start') save({ startBalance: value });
  }

  const numbers = data?.numbers;
  const debt = data?.debt;
  const balanceDelta =
    numbers?.cardBalance != null && numbers?.prevCardBalance != null
      ? numbers.cardBalance - numbers.prevCardBalance
      : null;

  const inlineEditor = (placeholder: string) => (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitDraft();
          if (e.key === 'Escape') { setEditing(null); setDraft(''); }
        }}
        className="w-24 px-2 py-1 bg-[#161b22] border border-[#F97316]/60 rounded-md text-sm text-white tabular-nums focus:outline-none"
      />
      <button onClick={submitDraft} disabled={saving} className="p-1 rounded-md bg-[#22c55e]/15 hover:bg-[#22c55e]/30 disabled:opacity-50" title="Save">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#22c55e]" /> : <Check className="w-3.5 h-3.5 text-[#22c55e]" />}
      </button>
      <button onClick={() => { setEditing(null); setDraft(''); }} className="p-1 rounded-md hover:bg-[#30363d]" title="Cancel">
        <X className="w-3.5 h-3.5 text-[#8b949e]" />
      </button>
    </span>
  );

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
          <ClipboardCheck className="w-3 h-3 text-[#F97316]" />
          {data ? `Week of ${weekLabel(data.week.start)}` : 'Weekly review'}
        </span>
        <span className="text-[10px] text-[#484f58]">card balance · trades · training · posts</span>
      </div>
      <div>
        {loading && !data ? (
          <div className="flex items-center justify-center py-6 text-[#8b949e]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-xs text-[#8b949e]">Couldn&apos;t load the scoreboard — refresh to retry.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* The four numbers */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Card balance (manual) */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Landmark className="w-3 h-3 text-[#F97316]" />
                  <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Card Balance</span>
                </div>
                {editing === 'balance' ? inlineEditor('15800') : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-white tabular-nums">
                      {numbers!.cardBalance != null ? fmtUSD(numbers!.cardBalance) : '—'}
                    </span>
                    <button
                      onClick={() => { setEditing('balance'); setDraft(numbers!.cardBalance != null ? String(numbers!.cardBalance) : ''); }}
                      className="p-1 hover:bg-[#30363d] rounded-md" title="Log this week's balance"
                    >
                      <Pencil className="w-3 h-3 text-[#737373] hover:text-[#F97316]" />
                    </button>
                  </div>
                )}
                {balanceDelta !== null && editing !== 'balance' && (
                  <p className={`flex items-center gap-1 text-[10px] mt-0.5 ${balanceDelta <= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                    {balanceDelta <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    {balanceDelta <= 0 ? '' : '+'}{fmtUSD(balanceDelta)} vs last entry
                  </p>
                )}
                {numbers!.cardBalance === null && editing !== 'balance' && (
                  <p className="text-[10px] text-[#484f58] mt-0.5">log it weekly — one number, one direction</p>
                )}
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

              {/* Trade journal (auto) */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <NotebookPen className="w-3 h-3 text-[#F97316]" />
                  <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Trade Journal</span>
                </div>
                <span className="text-base font-bold tabular-nums">
                  <span className={numbers!.trades >= WEEKLY_TARGETS.trades ? 'text-[#22c55e]' : 'text-white'}>{numbers!.trades}</span>
                  <span className="text-[#484f58] text-xs font-semibold"> / {WEEKLY_TARGETS.trades} days</span>
                </span>
                <p className="text-[10px] text-[#484f58] mt-0.5">auto · trading journal entries</p>
              </div>

              {/* Posts (manual) */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Megaphone className="w-3 h-3 text-[#F97316]" />
                  <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Posts Published</span>
                </div>
                {editing === 'posts' ? inlineEditor('3') : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold tabular-nums">
                      <span className={numbers!.posts >= WEEKLY_TARGETS.posts ? 'text-[#22c55e]' : 'text-white'}>{numbers!.posts}</span>
                      <span className="text-[#484f58] text-xs font-semibold"> / {WEEKLY_TARGETS.posts}</span>
                    </span>
                    <button
                      onClick={() => save({ postsPublished: numbers!.posts + 1 })}
                      disabled={saving}
                      className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-[#F97316]/15 text-[#F97316] hover:bg-[#F97316]/30 disabled:opacity-50"
                      title="Log a published post"
                    >
                      +1
                    </button>
                    <button
                      onClick={() => { setEditing('posts'); setDraft(String(numbers!.posts)); }}
                      className="p-1 hover:bg-[#30363d] rounded-md" title="Edit count"
                    >
                      <Pencil className="w-3 h-3 text-[#737373] hover:text-[#F97316]" />
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-[#484f58] mt-0.5">IG poetry · 3/wk cadence</p>
              </div>
            </div>

            {/* Debt thermometer */}
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Debt Payoff</span>
                {debt?.configured && debt.pace && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      debt.pace.onPace ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#ef4444]/15 text-[#ef4444]'
                    }`}
                    title={`Plan checkpoint: ${debt.pace.targetPct}% paid by ${fmtDate(debt.pace.targetDate)} · expected today ${debt.pace.expectedPct}%`}
                  >
                    {debt.pace.onPace ? 'ON PACE' : 'BEHIND PACE'}
                  </span>
                )}
              </div>

              {!debt?.configured ? (
                <div className="flex-1 flex flex-col justify-center gap-2">
                  <p className="text-xs text-[#8b949e] leading-relaxed">
                    Set your starting card balance to arm the thermometer — every weekly balance you log
                    tracks % paid down and projects your debt-free date.
                  </p>
                  {editing === 'start' ? inlineEditor('15800') : (
                    <button
                      onClick={() => { setEditing('start'); setDraft(''); }}
                      className="self-start px-3 py-1.5 bg-[#F97316] hover:bg-[#ff8c5a] text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Set starting balance
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#22c55e] tabular-nums">{debt.pctPaid}%</span>
                    <span className="text-[11px] text-[#8b949e]">paid down · {fmtUSD(debt.paidOff!)} of {fmtUSD(debt.startBalance!)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#21262d] overflow-hidden mt-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#84cc16] transition-all duration-700"
                      style={{ width: `${debt.pctPaid}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-[#484f58] tabular-nums">
                    <span>{fmtUSD(debt.startBalance!)}</span>
                    <span className="text-[#c9d1d9] font-medium">{fmtUSD(debt.current!)} now</span>
                    <span>$0</span>
                  </div>
                  <div className="mt-auto pt-2 text-[11px] text-[#8b949e]">
                    {debt.projectedFreeDate ? (
                      <>Debt-free ≈ <span className="text-white font-semibold">{fmtDate(debt.projectedFreeDate)}</span> at the current pace</>
                    ) : (
                      <>Log a balance each week — two entries in, the projection appears.</>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
