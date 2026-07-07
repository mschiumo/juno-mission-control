'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, Crosshair, Flame, RefreshCw, Check, Pencil,
  TrendingUp, TrendingDown, Minus, Loader2, ShieldAlert,
} from 'lucide-react';

interface DayFocus {
  text: string;
  done: boolean;
  updatedAt: string;
}

interface DisciplineDay {
  date: string;
  score: number | null;
  habitScore: number | null;
  journaled: boolean;
  focus: DayFocus | null;
}

interface AtRiskHabit {
  id: string;
  name: string;
  icon: string;
  streak: number;
}

function scoreColor(score: number | null): string {
  if (score === null) return '#21262d';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#d29922';
  if (score >= 20) return '#F97316';
  return '#ef4444';
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'No data yet';
  if (score >= 85) return 'Elite';
  if (score >= 70) return 'Dialed in';
  if (score >= 50) return 'Building';
  if (score >= 30) return 'Slipping';
  return 'Off track';
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function DisciplineCard() {
  const [days, setDays] = useState<DisciplineDay[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskHabit[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFocus, setSavingFocus] = useState(false);
  const [protecting, setProtecting] = useState<string | null>(null);

  // Focus editor state
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/discipline?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setDays(data.days || []);
        setAtRisk(data.atRisk || []);
      }
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [load]);

  // Refresh when habits or the journal change elsewhere on the dashboard.
  useEffect(() => {
    window.addEventListener('ct:habits-updated', load);
    window.addEventListener('ct:discipline-updated', load);
    return () => {
      window.removeEventListener('ct:habits-updated', load);
      window.removeEventListener('ct:discipline-updated', load);
    };
  }, [load]);

  const today = days.length > 0 ? days[days.length - 1] : null;
  const todayScore = today?.score ?? null;
  const focus = today?.focus ?? null;

  // 7-day momentum: this week's average vs the prior week's.
  const momentum = useMemo(() => {
    const scores = days.map((d) => d.score);
    const thisWeek = scores.slice(-7).filter((s): s is number => s !== null);
    const lastWeek = scores.slice(-14, -7).filter((s): s is number => s !== null);
    const a = avg(thisWeek);
    const b = avg(lastWeek);
    if (a === null || b === null) return null;
    return Math.round(a - b);
  }, [days]);

  async function saveFocus(payload: { text?: string; done?: boolean }) {
    setSavingFocus(true);
    try {
      const res = await fetch('/api/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) await load();
    } catch {
      // score view will show the old state; user can retry
    } finally {
      setSavingFocus(false);
      setEditingFocus(false);
    }
  }

  // One-tap streak protection: mark the habit done right from this card.
  async function protectStreak(habitId: string) {
    setProtecting(habitId);
    try {
      const res = await fetch('/api/habit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, completed: true }),
      });
      if (res.ok) {
        window.dispatchEvent(new Event('ct:habits-updated'));
        await load();
      }
    } catch {
      // leave as-is; HabitCard remains the source of truth
    } finally {
      setProtecting(null);
    }
  }

  const ringColor = scoreColor(todayScore);
  const circumference = 2 * Math.PI * 26;
  const dashOffset = todayScore === null ? circumference : circumference * (1 - todayScore / 100);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-gradient-to-r from-[#F97316]/10 to-transparent">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Discipline</h2>
          {momentum !== null && (
            <span
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{
                background: momentum > 2 ? 'rgba(34,197,94,0.12)' : momentum < -2 ? 'rgba(239,68,68,0.12)' : 'rgba(139,148,158,0.12)',
                color: momentum > 2 ? '#22c55e' : momentum < -2 ? '#ef4444' : '#8b949e',
              }}
              title="7-day average vs the week before"
            >
              {momentum > 2 ? <TrendingUp className="w-3 h-3" /> : momentum < -2 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {momentum > 0 ? `+${momentum}` : momentum}
            </span>
          )}
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          disabled={loading}
          className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Today's score */}
          <div className="flex items-center gap-4 bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
                <circle cx="30" cy="30" r="26" fill="none" stroke="#21262d" strokeWidth="6" />
                <circle
                  cx="30" cy="30" r="26" fill="none"
                  stroke={ringColor} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold tabular-nums" style={{ color: todayScore === null ? '#8b949e' : ringColor }}>
                  {todayScore === null ? '—' : todayScore}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">Today&apos;s Score</p>
              <p className="text-sm font-semibold text-white">{scoreLabel(todayScore)}</p>
              <p className="text-[10px] text-[#8b949e] mt-0.5 leading-relaxed">
                Habits · journal · #1 focus
              </p>
            </div>
          </div>

          {/* Today's #1 focus */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 flex flex-col">
            <div className="flex items-center gap-1.5 mb-2">
              <Crosshair className="w-3.5 h-3.5 text-[#F97316]" />
              <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">Today&apos;s #1 Focus</span>
            </div>
            {editingFocus || !focus?.text ? (
              <div className="flex gap-2 flex-1 items-start">
                <input
                  type="text"
                  value={focusDraft}
                  maxLength={200}
                  onChange={(e) => setFocusDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && focusDraft.trim()) saveFocus({ text: focusDraft }); }}
                  placeholder="The one thing that matters most today…"
                  className="flex-1 min-w-0 px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316]"
                />
                <button
                  onClick={() => saveFocus({ text: focusDraft })}
                  disabled={savingFocus || !focusDraft.trim()}
                  className="px-3 py-2 bg-[#F97316] hover:bg-[#ff8c5a] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {savingFocus ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set'}
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 flex-1">
                <button
                  onClick={() => saveFocus({ done: !focus.done })}
                  disabled={savingFocus}
                  className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 transition-all flex items-center justify-center disabled:opacity-50 ${
                    focus.done ? 'bg-[#22c55e] border-[#22c55e]' : 'border-[#737373] hover:border-[#F97316]'
                  }`}
                  title={focus.done ? 'Mark not done' : 'Mark done'}
                >
                  {focus.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </button>
                <p className={`flex-1 text-sm leading-snug ${focus.done ? 'text-[#737373] line-through' : 'text-white'}`}>
                  {focus.text}
                </p>
                <button
                  onClick={() => { setFocusDraft(focus.text); setEditingFocus(true); }}
                  className="p-1 hover:bg-[#30363d] rounded-md transition-colors flex-shrink-0"
                  title="Edit focus"
                >
                  <Pencil className="w-3 h-3 text-[#737373] hover:text-[#F97316]" />
                </button>
              </div>
            )}
          </div>

          {/* Streaks at risk */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              {atRisk.length > 0
                ? <ShieldAlert className="w-3.5 h-3.5 text-[#d29922]" />
                : <ShieldCheck className="w-3.5 h-3.5 text-[#22c55e]" />}
              <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">Streaks at Risk</span>
              {atRisk.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d29922]/15 text-[#d29922] font-semibold">{atRisk.length}</span>
              )}
            </div>
            {atRisk.length === 0 ? (
              <p className="text-xs text-[#8b949e]">
                {loading ? 'Checking…' : 'All live streaks are safe today. Keep stacking.'}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {atRisk.map((h) => (
                  <div key={h.id} className="flex items-center gap-2">
                    <span className="text-sm flex-shrink-0">{h.icon}</span>
                    <span className="flex-1 min-w-0 text-xs text-white truncate">{h.name}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-[#d29922] font-semibold flex-shrink-0">
                      <Flame className="w-3 h-3" />
                      {h.streak}d
                    </span>
                    <button
                      onClick={() => protectStreak(h.id)}
                      disabled={protecting !== null}
                      className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/25 transition-colors disabled:opacity-50"
                      title="Mark done now"
                    >
                      {protecting === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Done'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
