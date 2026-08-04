import { getRedisClient } from '@/lib/redis';

/**
 * Per-account presentation settings, keyed by account id.
 * The special id "manual" covers all trades without a brokerAccountId
 * (today's CSV/ThinkorSwim imports); broker accounts use their SnapTrade id.
 *
 * These are harmless per-user preferences (a display label and an optional
 * per-account starting balance) — not billing-sensitive, so they're gated by
 * requireUserId rather than requireOwner.
 */
export interface AccountSetting {
  label?: string;
  startingBalance?: number;
  /**
   * Whether this account feeds the app at all. One brokerage login can expose
   * several accounts (Robinhood surfaces Individual, Crypto, …), so the user
   * picks which one to actually use.
   *
   * Tri-state: undefined means "never chosen" and is treated as active, so
   * existing setups keep working. Only an explicit false deactivates.
   */
  enabled?: boolean;
}

export type AccountSettingsMap = Record<string, AccountSetting>;

function accountSettingsKey(userId: string) {
  return `user:account-settings:${userId}`;
}

export async function getAccountSettings(userId: string): Promise<AccountSettingsMap> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(accountSettingsKey(userId));
    if (!raw) return {};
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? (parsed as AccountSettingsMap) : {};
  } catch (error) {
    console.error('Error getting account settings:', error);
    return {};
  }
}

/**
 * Merge-update a single account's settings. Unspecified fields are preserved.
 */
export async function patchAccountSetting(
  userId: string,
  accountId: string,
  partial: Partial<AccountSetting>,
): Promise<AccountSettingsMap> {
  const redis = await getRedisClient();
  const existing = await getAccountSettings(userId);
  const prev = existing[accountId] ?? {};

  const next: AccountSetting = { ...prev };
  if (typeof partial.label === 'string') {
    const trimmed = partial.label.trim().slice(0, 60);
    if (trimmed) next.label = trimmed;
    else delete next.label;
  }
  if (typeof partial.startingBalance === 'number' && partial.startingBalance >= 0) {
    next.startingBalance = partial.startingBalance;
  }
  if (typeof partial.enabled === 'boolean') {
    next.enabled = partial.enabled;
  }

  const merged: AccountSettingsMap = { ...existing, [accountId]: next };
  await redis.set(accountSettingsKey(userId), JSON.stringify(merged));
  return merged;
}
