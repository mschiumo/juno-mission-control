'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Trash2, Pencil, Target, Check, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';
import {
  MOODS, buildEntryPrompts, hasContent, moodOf, sleepOf,
  type JournalPrompt, type PromptDef, type GoalReview,
} from '@/lib/journal-prompts';

function longLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Minimal shape we need from a daily goal to review it.
type GoalLite = { id: string; title: string };
// In-flight answer for one goal card.
// madeProgress: undefined = not yet picked, null = neutral, true/false = explicit answer.
type ReviewAnswer = { madeProgress: boolean | null | undefined; note: string };

export default function JournalEntryModal({
  date,
  initialPrompts,
  initialGoalReviews,
  textPrompts,
  onClose,
  onSaved,
}: {
  date: string;
  initialPrompts: JournalPrompt[] | null;
  initialGoalReviews: GoalReview[] | null;
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

  const isToday = date === getTodayInEST();

  // --- Goal-review wizard (final step before submitting today's entry) ---
  // `goals` holds the in-progress daily goals to review; null while loading.
  // Only today's entry gets the review step; past entries just keep whatever
  // was stored. Prefill answers from any previously-saved reviews by goal id.
  const [goals, setGoals] = useState<GoalLite[] | null>(isToday ? null : []);
  const [reviewStep, setReviewStep] = useState(false);
  const [goalIdx, setGoalIdx] = useState(0);
  const [reviews, setReviews] = useState<Record<string, ReviewAnswer>>(() =>
    Object.fromEntries(
      (initialGoalReviews || []).map((r) => [r.goalId, { madeProgress: r.madeProgress, note: r.note || '' }]),
    ),
  );

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load the owner's in-progress daily goals once (today only).
  useEffect(() => {
    if (!isToday) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/goals?_t=${Date.now()}`);
        const data = await res.json();
        const daily: Array<{ id: string; title: string; phase: string }> =
          data?.success && Array.isArray(data?.data?.daily) ? data.data.daily : [];
        const inProgress = daily
          .filter((g) => g.phase === 'in-progress')
          .map((g) => ({ id: g.id, title: g.title }));
        if (!cancelled) setGoals(inProgress);
      } catch {
        if (!cancelled) setGoals([]); // degrade gracefully — no review step
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isToday]);

  const displayMood = moodOf(mode === 'view' ? initialPrompts || [] : prompts);
  const sleepVal = sleepOf(mode === 'view' ? initialPrompts || [] : prompts);

  // Read view shows exactly what was saved (handles prompts that were later edited/removed).
  const savedAnswered = (initialPrompts || []).filter(
    (p) => p.id !== 'mood' && p.id !== 'sleep' && p.answer?.trim(),
  );
  const viewReviews = initialGoalReviews || [];
  // Edit form: the configured text prompts (everything except mood, sleep + other).
  const editText = prompts.filter((p) => p.id !== 'mood' && p.id !== 'sleep' && p.id !== 'other');
  const otherPrompt = prompts.find((p) => p.id === 'other');

  const update = (id: string, answer: string) =>
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, answer } : p)));

  const setReview = (goalId: string, patch: Partial<ReviewAnswer>) =>
    setReviews((prev) => ({
      ...prev,
      [goalId]: { madeProgress: prev[goalId]?.madeProgress, note: prev[goalId]?.note ?? '', ...patch },
    }));

  // The goals that gate today's submit.
  const reviewGoals = isToday ? goals ?? [] : [];
  const goalsLoading = isToday && goals === null;
  const answeredCount = reviewGoals.filter((g) => reviews[g.id]?.madeProgress !== undefined).length;

  // Snapshot the answers for persistence. When there's nothing to review, keep
  // whatever was already stored so an edit doesn't wipe past reviews.
  function buildGoalReviews(): GoalReview[] {
    if (reviewGoals.length === 0) return initialGoalReviews ?? [];
    return reviewGoals.map((g) => {
      const r = reviews[g.id];
      const note = r?.note?.trim();
      return {
        goalId: g.id,
        title: g.title,
        madeProgress: r?.madeProgress ?? null,
        ...(note ? { note } : {}),
      };
    });
  }

  // Submitting today's Daily Journal doubles as completing the "Journal" habit.
  // Best-effort: never blocks (or fails) the journal save. Fires a refresh event
  // so the Habits card reflects the change live.
  async function markJournalHabitDone() {
    try {
      // Resolve the user's actual Journal habit. The id is NOT always 'journal':
      // a user's habit list is persisted once and never re-seeded, so renamed or
      // recreated habits carry generated ids (e.g. `habit_123`). Match the
      // seeded id first, then fall back to a habit literally named "Journal".
      const statusRes = await fetch('/api/habit-status');
      const status = await statusRes.json();
      const habits: Array<{ id: string; name?: string; completedToday?: boolean }> =
        status?.data?.habits ?? [];
      const journal =
        habits.find((h) => h.id === 'journal') ??
        habits.find((h) => h.name?.trim().toLowerCase() === 'journal');

      if (!journal) return; // user has no Journal habit — nothing to sync
      if (journal.completedToday) {
        // Already done (e.g. re-saving an edit) — just make sure the card reflects it.
        window.dispatchEvent(new CustomEvent('ct:habits-updated'));
        return;
      }

      const res = await fetch('/api/habit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId: journal.id, completed: true }),
      });
      if (res.ok) window.dispatchEvent(new CustomEvent('ct:habits-updated'));
    } catch {
      /* habit sync is best-effort */
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/personal-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, prompts, goalReviews: buildGoalReviews() }),
      });
      const data = await res.json();
      if (data.success) {
        if (isToday && hasContent(prompts)) await markJournalHabitDone();
        onSaved();
        onClose();
      }
    } catch {
      /* keep open on failure */
    } finally {
      setSaving(false);
    }
  }

  // Primary action from the question form: go to the goal review if there are
  // in-progress daily goals to check off, otherwise save directly.
  function onFormPrimary() {
    if (reviewGoals.length > 0) {
      setGoalIdx(0);
      setReviewStep(true);
    } else {
      save();
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
      setReviewStep(false);
      setGoalIdx(0);
      setMode('view');
    } else {
      onClose();
    }
  }

  if (typeof document === 'undefined') return null;

  const currentGoal = reviewGoals[goalIdx];
  const currentAnswer = currentGoal ? reviews[currentGoal.id] : undefined;
  const currentAnswered = currentAnswer?.madeProgress !== undefined;
  const isLastGoal = goalIdx === reviewGoals.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col">
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
            {savedAnswered.length > 0
              ? savedAnswered.map((p) => (
                  <div key={p.id}>
                    <p className="text-xs font-medium text-[#F97316] mb-1">{p.question}</p>
                    <p className="text-sm text-[#c9d1d9] whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-[#F97316]/30">
                      {p.answer}
                    </p>
                  </div>
                ))
              : sleepVal === 0 &&
                viewReviews.length === 0 && (
                  <p className="text-sm text-[#8b949e] italic">Tap the pencil to add a written reflection.</p>
                )}

            {/* Goals reviewed */}
            {viewReviews.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#F97316] mb-2 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Goals Reviewed
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {viewReviews.map((r) => (
                    <div
                      key={r.goalId}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border ${
                        r.madeProgress === true
                          ? 'bg-[#3fb950]/5 border-[#3fb950]/20'
                          : r.madeProgress === false
                            ? 'bg-[#f85149]/5 border-[#f85149]/20'
                            : 'bg-[#8b949e]/5 border-[#8b949e]/15'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                          r.madeProgress === true
                            ? 'bg-[#3fb950]/20 text-[#3fb950]'
                            : r.madeProgress === false
                              ? 'bg-[#f85149]/20 text-[#f85149]'
                              : 'bg-[#8b949e]/20 text-[#8b949e]'
                        }`}
                      >
                        {r.madeProgress === true ? (
                          <Check className="w-3 h-3" strokeWidth={3} />
                        ) : r.madeProgress === false ? (
                          <X className="w-3 h-3" strokeWidth={3} />
                        ) : (
                          <Minus className="w-3 h-3" strokeWidth={3} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#c9d1d9] leading-snug">{r.title}</p>
                        {r.note && (
                          <p className="text-[11px] text-[#8b949e] mt-0.5 leading-relaxed">{r.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : reviewStep ? (
          /* ---- Goal review wizard ---- */
          <div className="px-5 py-5">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-[#F97316]" />
              <p className="text-sm font-semibold text-white">Review Goals Progress</p>
            </div>
            <p className="text-xs text-[#8b949e] mb-4">
              Did you make progress on your in-progress daily goals today?
            </p>

            {/* Progress bar */}
            <div className="flex items-center gap-1.5 mb-2">
              {reviewGoals.map((g, i) => (
                <div
                  key={g.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < goalIdx ? 'bg-[#F97316]' : i === goalIdx ? 'bg-[#F97316]/60' : 'bg-[#30363d]'
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wide text-[#6e7681] mb-3">
              Goal {goalIdx + 1} of {reviewGoals.length}
            </p>

            {/* Current goal card */}
            {currentGoal && (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
                <p className="text-base font-medium text-white mb-4 leading-snug">{currentGoal.title}</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <button
                    onClick={() => setReview(currentGoal.id, { madeProgress: true })}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      currentAnswer?.madeProgress === true
                        ? 'bg-[#3fb950]/15 ring-1 ring-[#3fb950] text-[#3fb950]'
                        : 'bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:border-[#3fb950]/40 hover:text-[#c9d1d9]'
                    }`}
                  >
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                    Progress
                  </button>
                  <button
                    onClick={() => setReview(currentGoal.id, { madeProgress: null })}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      currentAnswer?.madeProgress === null
                        ? 'bg-[#8b949e]/15 ring-1 ring-[#8b949e] text-[#c9d1d9]'
                        : 'bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:border-[#8b949e]/40 hover:text-[#c9d1d9]'
                    }`}
                  >
                    <Minus className="w-4 h-4" strokeWidth={2.5} />
                    Neutral
                  </button>
                  <button
                    onClick={() => setReview(currentGoal.id, { madeProgress: false })}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      currentAnswer?.madeProgress === false
                        ? 'bg-[#f85149]/15 ring-1 ring-[#f85149] text-[#f85149]'
                        : 'bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:border-[#f85149]/40 hover:text-[#c9d1d9]'
                    }`}
                  >
                    <X className="w-4 h-4" strokeWidth={2.5} />
                    No progress
                  </button>
                </div>
                <textarea
                  value={currentAnswer?.note ?? ''}
                  onChange={(e) => setReview(currentGoal.id, { note: e.target.value })}
                  placeholder="Add a note (optional)…"
                  rows={2}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] resize-none focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
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
        {mode === 'edit' && reviewStep && (
          <div className="sticky bottom-0 bg-[#0d1117]/80 backdrop-blur-sm border-t border-[#30363d] px-5 py-3 flex items-center justify-between">
            <button
              onClick={() => (goalIdx > 0 ? setGoalIdx((i) => i - 1) : setReviewStep(false))}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-[#8b949e] hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#6e7681] tabular-nums">
                {answeredCount}/{reviewGoals.length} reviewed
              </span>
              <button
                onClick={() => (isLastGoal ? save() : setGoalIdx((i) => i + 1))}
                disabled={!currentAnswered || saving}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isLastGoal ? (saving ? 'Submitting…' : 'Submit Entry') : 'Next'}
                {!isLastGoal && !saving && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        {mode === 'edit' && !reviewStep && (
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
                onClick={onFormPrimary}
                disabled={saving || goalsLoading}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#F97316] hover:bg-[#ea6c08] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving || goalsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving
                  ? 'Saving…'
                  : reviewGoals.length > 0
                    ? `Review Goals (${reviewGoals.length})`
                    : 'Save Entry'}
                {reviewGoals.length > 0 && !saving && !goalsLoading && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
