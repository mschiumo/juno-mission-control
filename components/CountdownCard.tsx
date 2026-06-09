'use client';

import { useState, useEffect, useCallback } from 'react';
import { Hourglass, Plus, X, Trash2, Loader2 } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';

interface CountdownLabel {
  type: 'emoji' | 'color';
  value: string;
}

interface CountdownEvent {
  id: string;
  title: string;
  dueDate: string;
  label: CountdownLabel;
  createdAt: string;
}

// A wide array of emoji choices for labelling events.
const EMOJI_CHOICES = [
  '🎯', '💍', '💒', '🎂', '🎉', '🎊', '🥂', '🍾', '❤️', '💐',
  '✈️', '🏖️', '🏝️', '🗺️', '🏔️', '🚗', '🏠', '🔑', '🎓', '📚',
  '📝', '💼', '🚀', '🏆', '🥇', '🏃', '💪', '⛳', '🎾', '⚽',
  '👶', '🐶', '🐱', '🎄', '🎁', '🦃', '🩺', '🦷', '💰', '📈',
  '🌅', '🌙', '🎸', '🎤', '🎬', '🍰', '🌍', '⭐',
];

// Accent color choices (alternative to an emoji label).
const COLOR_CHOICES = [
  '#F97316', '#58a6ff', '#3fb950', '#8957e5',
  '#f85149', '#d29922', '#ec4899', '#14b8a6',
];

function daysUntil(dueDate: string): number {
  const today = getTodayInEST();
  const a = new Date(today + 'T00:00:00');
  const b = new Date(dueDate + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatDue(dueDate: string): string {
  return new Date(dueDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function countdownText(days: number): { text: string; color: string } {
  if (days < 0) return { text: `${Math.abs(days)}d ago`, color: '#8b949e' };
  if (days === 0) return { text: 'Today', color: '#F97316' };
  if (days === 1) return { text: 'Tomorrow', color: '#F97316' };
  return { text: `${days} days`, color: '#c9d1d9' };
}

function LabelChip({ label, size = 'md' }: { label: CountdownLabel; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-7 h-7 text-base' : 'w-9 h-9 text-xl';
  if (label.type === 'color') {
    return (
      <span className={`${box} rounded-lg flex items-center justify-center flex-shrink-0`} style={{ background: `${label.value}20` }}>
        <span className="w-3.5 h-3.5 rounded-full" style={{ background: label.value }} />
      </span>
    );
  }
  return (
    <span className={`${box} rounded-lg flex items-center justify-center flex-shrink-0 bg-[#0d1117]`}>
      {label.value}
    </span>
  );
}

export default function CountdownCard() {
  const today = getTodayInEST();
  const [events, setEvents] = useState<CountdownEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-form state
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [label, setLabel] = useState<CountdownLabel>({ type: 'emoji', value: '🎯' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/countdown-events?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) setEvents(data.events || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setTitle('');
    setDueDate('');
    setLabel({ type: 'emoji', value: '🎯' });
  }

  async function handleAdd() {
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/countdown-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, dueDate, label }),
      });
      const data = await res.json();
      if (data.success) {
        resetForm();
        setShowAdd(false);
        await load();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id)); // optimistic
    try {
      await fetch(`/api/countdown-events?id=${id}`, { method: 'DELETE' });
    } catch {
      load(); // revert by reloading on failure
    }
  }

  const sorted = [...events].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-white">Countdown</h2>
          {events.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#30363d] text-[#8b949e]">{events.length}</span>
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event name (e.g. Wedding)"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316]"
          />
          <input
            type="date"
            value={dueDate}
            min={today}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316] [color-scheme:dark]"
          />

          {/* Emoji picker */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#8b949e] mb-1.5">Pick an emoji</p>
            <div className="grid grid-cols-8 gap-1 max-h-[88px] overflow-y-auto pr-1">
              {EMOJI_CHOICES.map((emoji) => {
                const active = label.type === 'emoji' && label.value === emoji;
                return (
                  <button
                    key={emoji}
                    onClick={() => setLabel({ type: 'emoji', value: emoji })}
                    className={`aspect-square rounded-md text-lg flex items-center justify-center transition-colors ${
                      active ? 'bg-[#F97316]/20 ring-1 ring-[#F97316]' : 'hover:bg-[#30363d]'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#8b949e] mb-1.5">…or a color</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOR_CHOICES.map((color) => {
                const active = label.type === 'color' && label.value === color;
                return (
                  <button
                    key={color}
                    onClick={() => setLabel({ type: 'color', value: color })}
                    className={`w-6 h-6 rounded-full transition-transform ${active ? 'ring-2 ring-offset-2 ring-offset-[#161b22] ring-white scale-110' : ''}`}
                    style={{ background: color }}
                    title={color}
                  />
                );
              })}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={saving || !title.trim() || !dueDate}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Countdown
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto max-h-72 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[#8b949e]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Hourglass className="w-7 h-7 text-[#30363d] mx-auto mb-2" />
            <p className="text-xs text-[#8b949e]">No countdowns yet.</p>
            <p className="text-[11px] text-[#484f58] mt-0.5">Add an event to track its deadline.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#21262d]">
            {sorted.map((event) => {
              const days = daysUntil(event.dueDate);
              const { text, color } = countdownText(days);
              return (
                <li key={event.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[#0d1117]/50 transition-colors">
                  <LabelChip label={event.label} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{event.title}</p>
                    <p className="text-[11px] text-[#8b949e]">{formatDue(event.dueDate)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold tabular-nums" style={{ color }}>{text}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="p-1 rounded-md text-[#484f58] opacity-0 group-hover:opacity-100 hover:text-[#f85149] hover:bg-[#30363d] transition-all flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
