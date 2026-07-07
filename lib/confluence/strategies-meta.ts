/**
 * Strategy display identity — client-safe (no server imports, no strategy
 * code). Every registered strategy gets a stable visual identity so a
 * proposal can always be traced to the ruleset that produced it: short badge
 * label, unique color, human name, one-line philosophy.
 *
 * Keep ids in sync with lib/confluence/agent/strategies/index.ts (a unit test
 * enforces this).
 */

export interface StrategyMeta {
  id: string;
  /** Human name shown on the Strategy tab. */
  name: string;
  /** Short badge label shown on proposal cards. */
  short: string;
  /** Unique badge color (fixed hex — identity, not theme). */
  color: string;
  /** Dim background for the badge chip. */
  colorDim: string;
  /** One-line philosophy. */
  tagline: string;
}

export const STRATEGY_META: Record<string, StrategyMeta> = {
  'value-ta-pullback': {
    id: 'value-ta-pullback',
    name: 'Value-TA Pullback',
    short: 'VALUE-TA',
    color: '#818cf8', // indigo — the flagship swing strategy
    colorDim: 'rgba(99, 102, 241, 0.15)',
    tagline: 'Value picks the name, technicals pick the moment: quality large caps pulled back to a rising 50-day.',
  },
  // Display-only id for the Value-TA hedge sleeve (not a registry strategy —
  // it runs INSIDE value-ta-pullback; distinct badge so hedge proposals are
  // unmistakable in the queue).
  'value-ta-hedge': {
    id: 'value-ta-hedge',
    name: 'Value-TA Hedge Sleeve',
    short: 'VTA-HEDGE',
    color: '#f59e0b', // amber — bearish overlay on the flagship
    colorDim: 'rgba(245, 158, 11, 0.15)',
    tagline: 'Long 1x inverse index ETFs when the index is in a downtrend bouncing into resistance — bearish exposure without shorting.',
  },
  placeholder: {
    id: 'placeholder',
    name: 'Placeholder Screen',
    short: 'DEMO',
    color: '#9ca3af', // gray — illustrative only, not a real edge
    colorDim: 'rgba(156, 163, 175, 0.15)',
    tagline: 'Illustrative fundamentals screen from the paper-mode spine. Not a real strategy.',
  },
};

export const UNKNOWN_STRATEGY_META: StrategyMeta = {
  id: 'unknown',
  name: 'Unknown strategy',
  short: '?',
  color: '#9ca3af',
  colorDim: 'rgba(156, 163, 175, 0.15)',
  tagline: 'Proposal predates strategy tagging or came from an unregistered strategy.',
};

export function strategyMeta(id?: string): StrategyMeta | null {
  if (!id) return null;
  return STRATEGY_META[id] ?? { ...UNKNOWN_STRATEGY_META, id };
}
