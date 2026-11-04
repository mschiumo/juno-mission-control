/**
 * Market News categories — shared by the server-side aggregator and the
 * client card. Keep this file free of server-only imports.
 *
 * Order matters in two places:
 *  - the client renders the category tabs in this order;
 *  - the categorizer uses it to break ties when a headline scores equally in
 *    several categories (earlier wins).
 */
export type NewsCategoryId =
  | 'fed'
  | 'geopolitics'
  | 'politics'
  | 'macro'
  | 'commodities'
  | 'mergers'
  | 'earnings'
  | 'ai'
  | 'crypto'
  | 'markets';

export type NewsPriority = 'high' | 'medium';

export interface NewsCategoryMeta {
  /** Full name shown on the story chip. */
  name: string;
  /** Short name shown on the filter tab. */
  label: string;
  priority: NewsPriority;
  color: string;
}

export const NEWS_CATEGORY_ORDER: NewsCategoryId[] = [
  'fed',
  'geopolitics',
  'politics',
  'macro',
  'commodities',
  'mergers',
  'earnings',
  'ai',
  'crypto',
  'markets',
];

export const NEWS_CATEGORY_META: Record<NewsCategoryId, NewsCategoryMeta> = {
  fed:         { name: 'Fed & Central Banks',   label: 'Fed',         priority: 'high',   color: '#8b5cf6' },
  geopolitics: { name: 'Geopolitics & War',     label: 'Geopolitics', priority: 'high',   color: '#ef4444' },
  politics:    { name: 'Politics & Policy',     label: 'Politics',    priority: 'high',   color: '#ec4899' },
  macro:       { name: 'Economy & Data',        label: 'Macro',       priority: 'high',   color: '#3b82f6' },
  commodities: { name: 'Energy & Commodities',  label: 'Energy',      priority: 'high',   color: '#eab308' },
  mergers:     { name: 'M&A',                   label: 'M&A',         priority: 'high',   color: '#f97316' },
  earnings:    { name: 'Earnings',              label: 'Earnings',    priority: 'medium', color: '#14b8a6' },
  ai:          { name: 'AI & Tech',             label: 'AI',          priority: 'medium', color: '#22c55e' },
  crypto:      { name: 'Crypto',                label: 'Crypto',      priority: 'medium', color: '#f59e0b' },
  markets:     { name: 'Stocks & Markets',      label: 'Markets',     priority: 'medium', color: '#06b6d4' },
};

/**
 * Categories that make up the "Breaking" digest (the default tab). Everything
 * market-moving in the broad sense — macro, politics, war, energy, Fed, M&A —
 * plus general market headlines. AI and crypto have their own tabs and are
 * deliberately kept out so they can't crowd the digest.
 */
export const DIGEST_CATEGORIES: NewsCategoryId[] = [
  'fed',
  'geopolitics',
  'politics',
  'macro',
  'commodities',
  'mergers',
  'markets',
  'earnings',
];

/** How often the server re-pulls every source (and how often the card re-reads). */
export const NEWS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/** Human-readable age for a unix-seconds timestamp, relative to `nowMs`. */
export function formatTimeAgo(timestampSec: number, nowMs: number): string {
  const diff = nowMs - timestampSec * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
