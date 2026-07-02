import { getRedisClient } from '@/lib/redis';

/**
 * Per-account presentation/classification settings, keyed by account id.
 * The special id "manual" covers all trades without a brokerAccountId
 * (today's CSV/ThinkorSwim imports); broker accounts use their SnapTrade id.
 *
 * These are harmless per-user preferences (a display label, a day-trading vs
 * long-term flag, and an optional per-account starting balance) — not
 * billing-sensitive, so they're gated by requireUserId rather than requireOwner.
 */
export type AccountType = 'day-trading' | 'long-term';

export interface AccountSetting {
  label?: string;
  type: AccountType;
  startingBalance?: number;
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
 * Merge-update a single account's settings. Unspecified fields are preserved;
 * the account defaults to 'day-trading' so existing behavior never changes
 * unless the user explicitly flips it.
 */
export async function patchAccountSetting(
  userId: string,
  accountId: string,
  partial: Partial<AccountSetting>,
): Promise<AccountSettingsMap> {
  const redis = await getRedisClient();
  const existing = await getAccountSettings(userId);
  const prev = existing[accountId] ?? { type: 'day-trading' as AccountType };

  const next: AccountSetting = { ...prev };
  if (partial.type === 'day-trading' || partial.type === 'long-term') {
    next.type = partial.type;
  }
  if (typeof partial.label === 'string') {
    const trimmed = partial.label.trim().slice(0, 60);
    if (trimmed) next.label = trimmed;
    else delete next.label;
  }
  if (typeof partial.startingBalance === 'number' && partial.startingBalance >= 0) {
    next.startingBalance = partial.startingBalance;
  }

  const merged: AccountSettingsMap = { ...existing, [accountId]: next };
  await redis.set(accountSettingsKey(userId), JSON.stringify(merged));
  return merged;
}
