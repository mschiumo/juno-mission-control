'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Check, Loader2, Pencil, Plus, RotateCcw, Trash2, Trophy, X } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';

interface DaysSinceItem {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD (EST)
  longestStreak: number; // best completed run, recorded server-side on reset (or set by hand)
  createdAt: string;
  updatedAt: string;
}

function daysSince(startDate: string): number {
  const today = getTodayInEST();
  const a = new Date(startDate + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

// One 🔥 per milestone reached — the row grows as the streak builds.
const FIRE_MILESTONES = [1, 3, 7, 14, 30, 60, 100];

function fireCount(days: number): number {
  return FIRE_MILESTONES.filter((m) => days >= m).length;
}

function nextMilestone(days: number): number | null {
  const next = FIRE_MILESTONES.find((m) => days < m);
  return next ?? null;
}

function formatStart(startDate: string): string {
  return new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const inputClass =
  'w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316]';
const smallBtnClass =
  'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] transition-colors disabled:opacity-50';

type PatchBody = { id: string; title?: string; reset?: boolean; longestStreak?: number };

export default function DaysSinceCard() {
  const [items, setItems] = useState<DaysSinceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // Per-item transient UI state (only one item is ever being edited/confirmed)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLongest, setEditLongest] = useState('');
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/days-since?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) setItems(data.items || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/days-since', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setNewTitle('');
        setShowAdd(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function patch(body: PatchBody) {
    setSaving(true);
    try {
      const res = await fetch('/api/days-since', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setEditingId(null);
        setConfirmResetId(null);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id)); // optimistic
    if (editingId === id) setEditingId(null);
    if (confirmResetId === id) setConfirmResetId(null);
    try {
      await fetch(`/api/days-since?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      load(); // revert by reloading on failure
    }
  }

  function startEdit(item: DaysSinceItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditLongest(String(Math.max(item.longestStreak, daysSince(item.startDate))));
    setConfirmResetId(null);
  }

  function saveEdit(item: DaysSinceItem) {
    if (!editTitle.trim()) return;
    const body: PatchBody = { id: item.id, title: editTitle };
    const longest = Number(editLongest);
    if (editLongest.trim() !== '' && Number.isFinite(longest) && longest >= 0) {
      body.longestStreak = Math.floor(longest);
    }
    patch(body);
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col xl:flex-1 xl:min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Days Since</h2>
          {items.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#30363d] text-[#8b949e]">{items.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9]"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/30 space-y-2.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="Title (e.g. Last rule break)"
            className={inputClass}
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newTitle.trim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Start Counting
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto max-h-80 xl:max-h-none min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[#8b949e]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 px-4">
            <CalendarClock className="w-7 h-7 text-[#30363d] mx-auto mb-2" />
            <p className="text-xs text-[#8b949e]">Nothing tracked yet.</p>
            <p className="text-[11px] text-[#484f58] mt-0.5">Add something to count the days since it happened.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#21262d]">
            {items.map((item) => {
              const days = daysSince(item.startDate);
              // The live run counts toward the record too — a first-ever streak
              // is also the longest so far, and an ongoing run that passes the
              // old record takes over.
              const longest = Math.max(item.longestStreak, days);
              const isRecordRun = days > 0 && days >= longest;
              const editing = editingId === item.id;
              const confirming = confirmResetId === item.id;

              if (editing) {
                return (
                  <li key={item.id} className="px-4 py-3 space-y-2.5 bg-[#0d1117]/30">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(item);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      placeholder="Title"
                      className={inputClass}
                      autoFocus
                    />
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide text-[#8b949e]">Longest streak (days)</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={editLongest}
                        onChange={(e) => setEditLongest(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(item);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className={`${inputClass} mt-1 [color-scheme:dark]`}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(item)}
                        disabled={saving || !editTitle.trim()}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 text-sm font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.id} className="group px-4 py-3 hover:bg-[#0d1117]/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: title, start date, record, actions */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.title}</p>
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1 rounded-md text-[#484f58] hover:text-white hover:bg-[#30363d] transition-colors flex-shrink-0"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 rounded-md text-[#484f58] hover:text-[#f85149] hover:bg-[#30363d] transition-colors flex-shrink-0"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[11px] text-[#8b949e] mt-0.5">since {formatStart(item.startDate)}</p>
                      <p className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#8b949e] min-w-0">
                        <Trophy className="w-3 h-3 flex-shrink-0 text-[#e3b341]" />
                        <span className="truncate">
                          Longest streak{' '}
                          <span className="font-semibold tabular-nums text-white">{longest}</span>{' '}
                          {longest === 1 ? 'day' : 'days'}
                        </span>
                        {isRecordRun && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-[#e3b341] bg-[#e3b341]/10 border border-[#e3b341]/30 rounded px-1.5 py-px leading-4 flex-shrink-0">
                            Current
                          </span>
                        )}
                      </p>
                      {confirming ? (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => patch({ id: item.id, reset: true })}
                            disabled={saving}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[#f85149]/10 hover:bg-[#f85149]/20 border border-[#f85149]/40 text-[#f85149] transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Confirm reset
                          </button>
                          <button onClick={() => setConfirmResetId(null)} className={smallBtnClass}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmResetId(item.id);
                            setEditingId(null);
                          }}
                          className={`${smallBtnClass} mt-2`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset to 0
                        </button>
                      )}
                    </div>

                    {/* Right: the count */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-3xl font-bold tabular-nums text-[#F97316] leading-none">{days}</p>
                      <p className="text-[11px] text-[#8b949e] mt-1">{days === 1 ? 'day' : 'days'}</p>
                      {fireCount(days) > 0 && (
                        <p
                          className="text-sm mt-1 tracking-tight"
                          title={`Milestones reached: ${FIRE_MILESTONES.filter((m) => days >= m).join(', ')} days`}
                        >
                          {'🔥'.repeat(fireCount(days))}
                        </p>
                      )}
                      {nextMilestone(days) !== null && (
                        <p className="text-[10px] text-[#484f58] mt-0.5">next 🔥 at {nextMilestone(days)}d</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
