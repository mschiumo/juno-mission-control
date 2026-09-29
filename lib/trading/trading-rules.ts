/**
 * Shared constants for the user's personal trading rules — the list shown in
 * the 9:15 AM ET pre-market acknowledgement modal and edited on the Trading →
 * Rules sub-tab. Stored per user as `tradingRules` in user prefs.
 *
 * Client-safe: imported by both the UI and the prefs API route.
 */

export const DEFAULT_TRADING_RULES = [
  "Don't double trade",
  "Don't force entries",
  "Don't exit early or trail too tightly on runners",
  'Remain neutral, even after wins or losses',
  'After 3R total loss, stop trading for the day',
  'If up 3R on the day, preserve AT LEAST 1R of profit',
];

export const MAX_RULE_LENGTH = 240;
export const MAX_RULES = 30;

/** Fired on window (detail: string[]) after rules are saved, so other mounted views pick up the change. */
export const TRADING_RULES_UPDATED_EVENT = 'trading-rules-updated';

/** Loads the user's saved rules, falling back to the defaults when none are stored. */
export async function fetchTradingRules(): Promise<string[]> {
  try {
    const res = await fetch('/api/user/prefs');
    const data = await res.json();
    if (data?.success && Array.isArray(data.prefs?.tradingRules)) {
      return data.prefs.tradingRules;
    }
  } catch {
    // Fall back to defaults
  }
  return DEFAULT_TRADING_RULES;
}

/** Trims, drops blanks, caps, and saves the rules. Returns the stored list; throws on failure. */
export async function saveTradingRules(draft: string[]): Promise<string[]> {
  const cleaned = draft
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .slice(0, MAX_RULES);
  const res = await fetch('/api/user/prefs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tradingRules: cleaned }),
  });
  const data = await res.json();
  if (!data?.success) throw new Error(data?.error || 'Save failed');
  window.dispatchEvent(new CustomEvent(TRADING_RULES_UPDATED_EVENT, { detail: cleaned }));
  return cleaned;
}
