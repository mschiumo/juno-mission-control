/**
 * Redis persistence for the Finances tab. Single home for the account list and
 * the daily balance history so the CRUD routes, the Plaid sync, and the nightly
 * cron can never drift on key names or snapshot semantics.
 */

import { getRedisClient } from '@/lib/redis';
import { getTodayInEST } from '@/lib/date-utils';
import {
  CREDIT_ACCOUNTS_KEY,
  CREDIT_HISTORY_KEY,
  type BalanceSnapshot,
  type CreditAccount,
} from './credit-cards';

/** null (rather than []) distinguishes "never set up" from "all accounts deleted". */
export async function readAccounts(userId: string): Promise<CreditAccount[] | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(CREDIT_ACCOUNTS_KEY(userId));
  return raw ? (JSON.parse(raw) as CreditAccount[]) : null;
}

export async function writeAccounts(userId: string, accounts: CreditAccount[]): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(CREDIT_ACCOUNTS_KEY(userId), JSON.stringify(accounts));
}

export async function readHistory(userId: string): Promise<BalanceSnapshot[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(CREDIT_HISTORY_KEY(userId));
  return raw ? (JSON.parse(raw) as BalanceSnapshot[]) : [];
}

/**
 * Upsert today's snapshot — one row per EST day, so a dozen refreshes or edits in
 * an afternoon leave a single point on the chart rather than a spike of noise.
 */
export async function recordSnapshot(
  userId: string,
  accounts: CreditAccount[],
): Promise<BalanceSnapshot[]> {
  const redis = await getRedisClient();
  const history = await readHistory(userId);
  const today = getTodayInEST();
  const snapshot: BalanceSnapshot = {
    date: today,
    total: accounts.reduce((sum, a) => sum + a.balance, 0),
    balances: Object.fromEntries(accounts.map((a) => [a.id, a.balance])),
  };

  const idx = history.findIndex((h) => h.date === today);
  if (idx >= 0) history[idx] = snapshot;
  else history.push(snapshot);
  history.sort((a, b) => a.date.localeCompare(b.date));

  await redis.set(CREDIT_HISTORY_KEY(userId), JSON.stringify(history));
  return history;
}
