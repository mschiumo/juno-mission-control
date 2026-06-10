// Shared journal prompt definitions + helpers for the personal (mindset) journal.
// Mood and Other are fixed; the text prompts in between are user-configurable
// (stored per-user via /api/personal-journal-prompts).

export interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

export interface PromptDef {
  id: string;
  question: string;
}

// Mood quick-pick — the chosen emoji becomes the day's badge in the weekly strip.
export const MOODS = ['🤩', '😄', '🙂', '😌', '😐', '😕', '😫', '😴'];

// Always-present, non-removable fields.
export const MOOD_PROMPT: PromptDef = { id: 'mood', question: 'How are you feeling today?' };
export const SLEEP_PROMPT: PromptDef = { id: 'sleep', question: 'Sleep Quality' };
export const OTHER_PROMPT: PromptDef = { id: 'other', question: 'Other' };

// Default reflection prompts (used until the user customizes them).
export const DEFAULT_TEXT_PROMPTS: PromptDef[] = [
  { id: 'grateful-today', question: 'What are you grateful for today?' },
  { id: 'challenged-today', question: 'What challenged you today?' },
  { id: 'improve-tomorrow', question: 'What can you improve for tomorrow?' },
];

export const hasContent = (prompts?: JournalPrompt[]) => !!prompts?.some((p) => p.answer?.trim());
export const moodOf = (prompts?: JournalPrompt[]) => prompts?.find((p) => p.id === 'mood')?.answer || '';
export const sleepOf = (prompts?: JournalPrompt[]) => {
  const v = parseInt(prompts?.find((p) => p.id === 'sleep')?.answer || '0', 10);
  return Number.isFinite(v) ? v : 0;
};

// Build the ordered prompt list for an entry — mood, then the configured text
// prompts, then Other — prefilled from a saved entry by id.
export function buildEntryPrompts(textPrompts: PromptDef[], saved?: JournalPrompt[] | null): JournalPrompt[] {
  const order: PromptDef[] = [MOOD_PROMPT, SLEEP_PROMPT, ...textPrompts, OTHER_PROMPT];
  return order.map((d) => {
    const s = saved?.find((p) => p.id === d.id);
    return { id: d.id, question: d.question, answer: s?.answer || '' };
  });
}
