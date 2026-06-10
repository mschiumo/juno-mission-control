'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Loader2, Settings } from 'lucide-react';
import { type PromptDef } from '@/lib/journal-prompts';

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

export default function ManagePromptsModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: PromptDef[];
  onClose: () => void;
  onSaved: (prompts: PromptDef[]) => void;
}) {
  const [prompts, setPrompts] = useState<PromptDef[]>(initial.map((p) => ({ ...p })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = () => setPrompts((p) => [...p, { id: newId(), question: '' }]);
  const update = (id: string, question: string) =>
    setPrompts((p) => p.map((x) => (x.id === id ? { ...x, question } : x)));
  const remove = (id: string) => setPrompts((p) => p.filter((x) => x.id !== id));

  async function save() {
    setSaving(true);
    const cleaned = prompts.filter((p) => p.question.trim());
    try {
      const res = await fetch('/api/personal-journal-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: cleaned }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved(data.prompts || cleaned);
        onClose();
      }
    } catch {
      /* keep open on failure */
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#161b22] border-b border-[#30363d] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#F97316]" />
            <div>
              <h3 className="text-base font-semibold text-white">Manage Prompts</h3>
              <p className="text-xs text-[#8b949e]">Customize your daily reflection questions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-2.5">
          {prompts.length === 0 && (
            <p className="text-sm text-[#8b949e] italic py-2">
              No custom prompts. Add one below, or just use Mood + Other.
            </p>
          )}

          {prompts.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-[10px] text-[#484f58] w-4 text-right tabular-nums">{i + 1}</span>
              <input
                type="text"
                value={p.question}
                onChange={(e) => update(p.id, e.target.value)}
                placeholder="Enter a reflection question…"
                className="flex-1 px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
              />
              <button
                onClick={() => remove(p.id)}
                title="Delete prompt"
                className="p-2 rounded-lg text-[#8b949e] hover:text-[#f85149] hover:bg-[#30363d] transition-colors flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            onClick={add}
            className="flex items-center gap-2 mt-1 px-3 py-2 w-full justify-center text-sm font-medium text-[#F97316] bg-[#F97316]/10 hover:bg-[#F97316]/20 border border-dashed border-[#F97316]/40 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add a prompt
          </button>

          <p className="text-[11px] text-[#484f58] pt-1">
            A mood quick-pick and an optional “Other” field are always included.
          </p>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#0d1117]/80 backdrop-blur-sm border-t border-[#30363d] px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
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
            {saving ? 'Saving…' : 'Save Prompts'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
