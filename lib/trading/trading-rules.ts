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

/** Fired on window (detail: boolean = enabled) when the 9:15 pop-up is switched on/off. */
export const TRADING_RULES_MODAL_EVENT = 'trading-rules-modal-toggled';

/** Example rules offered as one-click suggestions and placeholders on the Rules tab. */
export const SUGGESTED_TRADING_RULES = [
  'Max 3 trades per day',
  'Set a stop before entering every trade',
  'After 3R total loss, stop trading for the day',
  "Don't force entries",
  'Only take setups from my watchlist',
];

export interface TradingRulesState {
  /** The user's saved rules, or null if they have never saved any. */
  rules: string[] | null;
  /** Whether the 9:15 AM ET acknowledgement pop-up is on. */
  modalEnabled: boolean;
}

/** Loads the user's saved rules (null when never set) and pop-up setting. */
export async function fetchTradingRulesState(): Promise<TradingRulesState> {
  try {
    const res = await fetch('/api/user/prefs');
    const data = await res.json();
    const prefs = data?.success ? data.prefs ?? {} : {};
    return {
      rules: Array.isArray(prefs.tradingRules) ? prefs.tradingRules : null,
      modalEnabled: prefs.tradingRulesModalDisabled !== true,
    };
  } catch {
    return { rules: null, modalEnabled: true };
  }
}

/** Turns the 9:15 pop-up on or off. Throws on failure. */
export async function saveTradingRulesModalEnabled(enabled: boolean): Promise<void> {
  const res = await fetch('/api/user/prefs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tradingRulesModalDisabled: !enabled }),
  });
  const data = await res.json();
  if (!data?.success) throw new Error(data?.error || 'Save failed');
  window.dispatchEvent(new CustomEvent(TRADING_RULES_MODAL_EVENT, { detail: enabled }));
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
