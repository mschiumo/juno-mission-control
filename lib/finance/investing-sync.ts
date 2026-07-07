/**
 * Live brokerage value for the Investing section — reuses the existing
 * ConfluenceTrading Robinhood OAuth integration (lib/confluence/broker/
 * live-adapter.ts) instead of adding another aggregator: when the agentic
 * trading system is configured for live mode, we already have an
 * authenticated path to the account's total value.
 *
 * The synced account is a single "Robinhood — brokerage" BalanceAccount
 * (source: 'brokerage', stable id) whose balance is the account's net
 * liquidation value. It upserts on demand (Sync button) and nightly via the
 * finance-refresh cron, so the Investing chart accrues a real daily curve.
 *
 * Requirements (already in place for ConfluenceTrading live mode): Robinhood
 * OAuth env configured and the agentic account selected with paper mode off.
 * When unavailable we report why instead of writing anything.
 */

import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { isRobinhoodConfigured } from '@/lib/confluence/robinhood/oauth';
import { getAccountSummary } from '@/lib/confluence/broker/live-adapter';
import { recordSnapshots } from './history';
import { BalanceAccount } from './types';

const balanceAccountsKey = (userId: string) => `finance:${userId}:balance-accounts`;
const BROKERAGE_ACCOUNT_ID = 'bal_brokerage_robinhood';

export interface BrokerageSyncStatus {
  available: boolean;
  reason?: string;
}

export async function brokerageSyncStatus(userId: string): Promise<BrokerageSyncStatus> {
  if (!isRobinhoodConfigured()) {
    return { available: false, reason: 'Robinhood OAuth not configured (ConfluenceTrading live mode)' };
  }
  const state = await getSystemState(userId);
  if (state.paperMode) return { available: false, reason: 'ConfluenceTrading is in paper mode' };
  if (!state.agenticAccount) return { available: false, reason: 'No brokerage account selected in ConfluenceTrading' };
  return { available: true };
}

export async function syncBrokerageInvesting(
  userId: string,
): Promise<{ accountValue: number } | { error: string }> {
  const status = await brokerageSyncStatus(userId);
  if (!status.available) return { error: status.reason ?? 'Brokerage sync unavailable' };

  const state = await getSystemState(userId);
  let accountValue: number;
  try {
    const summary = await getAccountSummary(state.agenticAccount!);
    accountValue = Math.round(summary.accountValue * 100) / 100;
  } catch (e) {
    return { error: `Brokerage fetch failed: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
  if (!Number.isFinite(accountValue) || accountValue <= 0) {
    return { error: 'Brokerage returned an empty account value' };
  }

  const redis = await getRedisClient();
  const raw = await redis.get(balanceAccountsKey(userId));
  let accounts: BalanceAccount[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    accounts = Array.isArray(parsed) ? parsed : [];
  } catch {
    accounts = [];
  }

  const now = getNowInEST();
  const idx = accounts.findIndex((a) => a.id === BROKERAGE_ACCOUNT_ID);
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], balance: accountValue, source: 'brokerage', updatedAt: now };
  } else {
    accounts.push({
      id: BROKERAGE_ACCOUNT_ID,
      name: 'Robinhood — brokerage',
      kind: 'investment',
      balance: accountValue,
      institution: 'Robinhood',
      source: 'brokerage',
      externalId: state.agenticAccount!,
      createdAt: now,
      updatedAt: now,
    });
  }
  await redis.set(balanceAccountsKey(userId), JSON.stringify(accounts));
  await recordSnapshots(userId);

  return { accountValue };
}
