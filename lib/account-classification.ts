/**
 * Account classification helpers.
 *
 * A brokerage login can expose several accounts (a Robinhood connection alone
 * can surface Individual, Crypto, and more), so "how many brokerages are
 * linked" and "how many accounts feed the app" are different numbers. This
 * module owns the second one: the user picks the single account that actually
 * feeds the Journal, P&L, and trading stats.
 *
 * Imports here MUST stay type-only for lib/db/account-settings — that module
 * pulls in Redis, and this one is used from client components.
 */

import type { AccountSettingsMap } from '@/lib/db/account-settings';

/** Pseudo-account covering every trade with no brokerAccountId (CSV/manual). */
export const MANUAL_ACCOUNT_ID = 'manual';

/**
 * How many real accounts may be active at once. Brokerage connections are
 * capped separately (MAX_BROKER_CONNECTIONS) — this caps the accounts drawn
 * from those connections, which is what actually drives data volume and cost.
 */
export const MAX_ACTIVE_ACCOUNTS = 1;

/** Minimal shape needed to classify a trade. */
export interface AccountScopedTrade {
  brokerAccountId?: string;
}

/** The settings key a trade belongs to: its broker account, or 'manual'. */
export function tradeAccountId(trade: AccountScopedTrade): string {
  return trade.brokerAccountId ?? MANUAL_ACCOUNT_ID;
}

/**
 * Whether an account's data should be pulled and shown at all.
 *
 * `enabled` is tri-state on purpose: undefined means "the user hasn't chosen",
 * which we treat as active so existing setups keep working after upgrade. Only
 * an explicit `false` deactivates an account.
 */
export function isAccountActive(settings: AccountSettingsMap, accountId: string): boolean {
  return settings[accountId]?.enabled !== false;
}

/** Ids of accounts the user explicitly switched off. */
export function inactiveAccountIds(settings: AccountSettingsMap): Set<string> {
  return new Set(Object.entries(settings).filter(([, s]) => s.enabled === false).map(([id]) => id));
}

/**
 * Trades that belong in the trading Journal and its P&L: everything from
 * active accounts. Trades from accounts the user switched off are excluded.
 */
export function tradingJournalTrades<T extends AccountScopedTrade>(
  trades: T[],
  settings: AccountSettingsMap,
): T[] {
  // Fast path: nothing deactivated yet.
  const hasOverrides = Object.values(settings).some((s) => s.enabled === false);
  if (!hasOverrides) return trades;

  return trades.filter((t) => isAccountActive(settings, tradeAccountId(t)));
}
