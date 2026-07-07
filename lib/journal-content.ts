/**
 * Shared check for whether a daily-journal entry contains actual text.
 *
 * An entry only counts as "journaled" (calendar badge, month stats,
 * journal_consistency goal tracking) when at least one prompt has a
 * non-blank answer. Entries with no text — e.g. stubs created by older
 * account-statement imports — are treated as if they don't exist.
 */
export function hasJournalContent(prompts: unknown): boolean {
  if (!Array.isArray(prompts)) return false;
  return prompts.some(
    (p) => typeof p?.answer === 'string' && p.answer.trim() !== ''
  );
}

/** Parse a stored prompts JSON string and check it for content. */
export function hasJournalContentRaw(promptsJson: string | undefined): boolean {
  if (!promptsJson) return false;
  try {
    return hasJournalContent(JSON.parse(promptsJson));
  } catch {
    return false;
  }
}
