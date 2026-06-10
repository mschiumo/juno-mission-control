'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Trash2, Pencil } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import {
  MOODS, buildEntryPrompts, hasContent, moodOf, sleepOf,
  type JournalPrompt, type PromptDef,
} from '@/lib/journal-prompts';

function longLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function JournalEntryModal({
  date,
  initialPrompts,
  textPrompts,
  onClose,
  onSaved,
}: {
  date: string;
  initialPrompts: JournalPrompt[] | null;
  textPrompts: PromptDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existed = hasContent(initialPrompts || undefined);
  const [prompts, setPrompts] = useState<JournalPrompt[]>(buildEntryPrompts(textPrompts, initialPrompts));
  const [mode, setMode] = useState<'view' | 'edit'>(existed ? 'view' : 'edit');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isToday = date === getTodayInEST();
  const displayMood = moodOf(mode === 'view' ? initialPrompts || [] : prompts);
  const sleepVal = sleepOf(mode === 'view' ? initialPrompts || [] : prompts);

  // Read view shows exactly what was saved (handles prompts that were later edited/removed).
  const savedAnswered = (initialPrompts || []).filter(
    (p) => p.id !== 'mood' && p.id !== 'sleep' && p.answer?.trim(),
  );
  // Edit form: the configured text prompts (everything except mood, sleep + other).
  const editText = prompts.filter((p) => p.id !== 'mood' && p.id !== 'sleep' && p.id !== 'other');
  const otherPrompt = prompts.find((p) => p.id === 'other');

  const update = (id: string, answer: string) =>
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, answer } : p)));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/personal-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, prompts }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      }
    } catch {
      /* keep open on failure */
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setDeleting(true);
    try {
      await fetch(`/api/personal-journal?date=${date}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } catch {
      /* keep open on failure */
    } finally {
      setDeleting(false);
    }
  }

  function cancelEdit() {
    if (existed) {
      setPrompts(buildEntryPrompts(textPrompts, initialPrompts));
      setConfirmDelete(false);
      setMode('view');
    } else {
      onClose();
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#161b22] border-b border-[#30363d] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl leading-none">{displayMood || '📓'}</span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">
                {isToday ? 'Today' : longLabel(date)}
              </h3>
              <p className="text-xs text-[#8b949e]">{isToday ? longLabel(date) : 'Daily reflection'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {mode === 'view' && (
              <button
                onClick={() => setMode('edit')}
                title="Edit entry"
                className="p-2 rounded-lg text-[#8b949e] hover:text-[#F97316] hover:bg-[#30363d] transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {mode === 'view' ? (
          <div className="px-5 py-5 space-y-4">
            {sleepVal > 0 && (
              <div>
                <p className="text-xs font-medium text-[#F97316] mb-1">Sleep Quality</p>
                <div className="flex items-center gap-2 pl-3 border-l-2 border-[#F97316]/30">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={`w-2.5 h-2.5 rounded-full ${n <= sleepVal ? 'bg-[#F97316]' : 'bg-[#30363d]'}`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-[#c9d1d9]">{sleepVal}/5</span>
                </div>
              </div>
            )}
            {savedAnswered.length > 0 ? (
              savedAnswered.map((p) => (
                <div key={p.id}>
                  <p className="text-xs font-medium text-[#F97316] mb-1">{p.question}</p>
                  <p className="text-sm text-[#c9d1d9] whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-[#F97316]/30">
                    {p.answer}
                  </p>
                </div>
              ))
            ) : (
              sleepVal === 0 && (
                <p className="text-sm text-[#8b949e] italic">Tap the pencil to add a written reflection.</p>
              )
            )}
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            {/* Mood picker */}
            <div>
              <p className="text-xs font-medium text-[#F97316] mb-1.5">How are you feeling today?</p>
              <div className="flex gap-1.5">
                {MOODS.map((m) => {
                  const active = displayMood === m;
                  return (
                    <button
                      key={m}
                      onClick={() => update('mood', active ? '' : m)}
                      className={`flex-1 aspect-square rounded-lg text-xl flex items-center justify-center transition-all ${
                        active
                          ? 'bg-[#F97316]/20 ring-1 ring-[#F97316] scale-110'
                          : 'bg-[#0d1117] hover:bg-[#30363d] grayscale hover:grayscale-0 opacity-80 hover:opacity-100'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sleep quality */}
            <div>
              <p className="text-xs font-medium text-[#F97316] mb-1.5">Sleep Quality</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= sleepVal;
                  return (
                    <button
                      key={n}
                      onClick={() => update('sleep', sleepVal === n ? '' : String(n))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                        active
                          ? 'bg-[#F97316] text-white'
                          : 'bg-[#0d1117] text-[#8b949e] hover:bg-[#30363d]'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-[#484f58] mt-1 px-0.5">
                <span>Poor</span>
                <span>Great</span>
              </div>
            </div>

            {/* Configured text prompts */}
            {editText.map((p) => (
              <div key={p.id}>
                <label className="text-xs font-medium text-[#F97316] mb-1.5 block">{p.question}</label>
                <textarea
                  value={p.answer}
                  onChange={(e) => update(p.id, e.target.value)}
                  placeholder="Type here..."
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] resize-none focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            ))}

            {/* Other (always present, optional) */}
            {otherPrompt && (
              <div>
                <label className="text-xs font-medium text-[#F97316] mb-1.5 block">
                  Other<span className="text-[#8b949e] font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={otherPrompt.answer}
                  onChange={(e) => update('other', e.target.value)}
                  placeholder="Anything else on your mind..."
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] resize-none focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            )}
          </div>
        )}

        {/* Footer (edit mode) */}
        {mode === 'edit' && (
          <div className="sticky bottom-0 bg-[#0d1117]/80 backdrop-blur-sm border-t border-[#30363d] px-5 py-3 flex items-center justify-between">
            <div>
              {existed &&
                (confirmDelete ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#8b949e]">Delete?</span>
                    <button onClick={del} disabled={deleting} className="text-[#f85149] font-medium hover:underline">
                      {deleting ? 'Deleting…' : 'Yes'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-[#8b949e] hover:text-white">
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#f85149] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="px-3 py-1.5 text-[#8b949e] hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
