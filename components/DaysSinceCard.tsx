'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';

interface DaysSinceCounter {
  title: string;
  startDate: string; // YYYY-MM-DD (EST)
  createdAt: string;
  updatedAt: string;
}

function daysSince(startDate: string): number {
  const today = getTodayInEST();
  const a = new Date(startDate + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function formatStart(startDate: string): string {
  return new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DaysSinceCard() {
  const [counter, setCounter] = useState<DaysSinceCounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/days-since?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) setCounter(data.counter || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(body: { title?: string; reset?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch('/api/days-since', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setCounter(data.counter);
        setEditing(false);
        setConfirmReset(false);
        setTitleInput('');
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const days = counter ? daysSince(counter.startDate) : 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Days Since</h2>
        </div>
        {counter && !editing && (
          <button
            onClick={() => {
              setTitleInput(counter.title);
              setEditing(true);
              setConfirmReset(false);
            }}
            className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            title="Edit title"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-[#8b949e]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !counter || editing ? (
        /* Setup / edit form */
        <div className="px-4 py-4 space-y-2.5">
          {!counter && (
            <p className="text-xs text-[#8b949e]">
              Track how many days it&apos;s been since something happened.
            </p>
          )}
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && titleInput.trim()) save({ title: titleInput });
            }}
            placeholder="Title (e.g. Last rule break)"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316]"
            autoFocus={editing}
          />
          <div className="flex gap-2">
            <button
              onClick={() => save({ title: titleInput })}
              disabled={saving || !titleInput.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {counter ? 'Save Title' : 'Start Counting'}
            </button>
            {editing && (
              <button
                onClick={() => {
                  setEditing(false);
                  setTitleInput('');
                }}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Counter display */
        <div className="px-4 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{counter.title}</p>
            <p className="text-[11px] text-[#8b949e] mt-0.5">since {formatStart(counter.startDate)}</p>
            {confirmReset ? (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => save({ reset: true })}
                  disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[#f85149]/10 hover:bg-[#f85149]/20 border border-[#f85149]/40 text-[#f85149] transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Confirm reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1 mt-2 px-2.5 py-1 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to 0
              </button>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-4xl font-bold tabular-nums text-[#F97316] leading-none">{days}</p>
            <p className="text-[11px] text-[#8b949e] mt-1">{days === 1 ? 'day' : 'days'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
