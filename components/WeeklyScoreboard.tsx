'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Pencil, Loader2, LineChart,
  Dumbbell, BookOpen, Megaphone, Check, X,
} from 'lucide-react';

// The weekly review numbers from MJ's 3/6/12-month plan: trading P&L (auto,
// from the trading journal), training days (auto, Strava + workout split),
// journaling days (auto, daily journal), posts published (manual).
// Card balance / debt payoff moved to the Finances tab.

interface Scoreboard {
  week: { start: string; today: string };
  numbers: {
    pnl: number;
    pnlTrades: number;
    journal: number;
    training: number;
    posts: number;
  };
}

const WEEKLY_TARGETS = { training: 5, journal: 7, posts: 3 }; // 3x MT + 2 runs · daily journal · IG cadence

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
  const [saving, setSaving] = useState(false);

  // Inline editor (posts is the only manual number now)
  const [editingPosts, setEditingPosts] = useState(false);
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

  // Refresh auto counts when workouts/habits/journal change elsewhere.
  useEffect(() => {
    window.addEventListener('ct:habits-updated', load);
    return () => window.removeEventListener('ct:habits-updated', load);
  }, [load]);

  async function save(payload: { postsPublished: number }) {
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
      setEditingPosts(false);
      setDraft('');
    }
  }

  function submitDraft() {
    const value = parseFloat(draft.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(value) || value < 0) return;
    save({ postsPublished: Math.round(value) });
  }

  const numbers = data?.numbers;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
          <ClipboardCheck className="w-3 h-3 text-[#F97316]" />
          {data ? `Week of ${weekLabel(data.week.start)}` : 'Weekly review'}
        </span>
        <span className="text-[10px] text-[#484f58]">trading p&l · training · journal · posts</span>
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

          {/* Posts (manual) */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Megaphone className="w-3 h-3 text-[#F97316]" />
              <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-medium">Posts Published</span>
            </div>
            {editingPosts ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={draft}
                  placeholder="3"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitDraft();
                    if (e.key === 'Escape') { setEditingPosts(false); setDraft(''); }
                  }}
                  className="w-16 px-2 py-1 bg-[#161b22] border border-[#F97316]/60 rounded-md text-sm text-white tabular-nums focus:outline-none"
                />
                <button onClick={submitDraft} disabled={saving} className="p-1 rounded-md bg-[#22c55e]/15 hover:bg-[#22c55e]/30 disabled:opacity-50" title="Save">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#22c55e]" /> : <Check className="w-3.5 h-3.5 text-[#22c55e]" />}
                </button>
                <button onClick={() => { setEditingPosts(false); setDraft(''); }} className="p-1 rounded-md hover:bg-[#30363d]" title="Cancel">
                  <X className="w-3.5 h-3.5 text-[#8b949e]" />
                </button>
              </span>
            ) : (
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
                  onClick={() => { setEditingPosts(true); setDraft(String(numbers!.posts)); }}
                  className="p-1 hover:bg-[#30363d] rounded-md" title="Edit count"
                >
                  <Pencil className="w-3 h-3 text-[#737373] hover:text-[#F97316]" />
                </button>
              </div>
            )}
            <p className="text-[10px] text-[#484f58] mt-0.5">IG poetry · 3/wk cadence</p>
          </div>
        </div>
      )}
    </div>
  );
}
