/**
 * SnapTrade sync orchestration
 *
 * Pulls each linked account's activities, transforms them into round-trip
 * Trades, and writes them as the user's trade list (broker = source of truth,
 * per the product decision). The destructive replace is backed up once
 * (original pre-broker trades) and user-authored journal fields are carried
 * across re-syncs so re-importing never wipes written reflections.
 *
 * Shared by the manual sync route and the scheduled cron.
 */

import { Trade } from '@/types/trading';
import { listAccounts, getAllAccountActivities } from '@/lib/snaptrade';
import { buildTradesFromActivities } from '@/lib/snaptrade-transform';
import { getAllTrades, replaceAllTrades } from '@/lib/db/trades-v2';
import {
  BrokerConnection,
  BrokerAccount,
  setBrokerAccounts,
  setLastSyncedAt,
} from '@/lib/db/broker-connections';

// Fields a user authors in the journal — never overwritten by a re-sync.
const JOURNAL_FIELDS: (keyof Trade)[] = [
  'entryNotes', 'exitNotes', 'emotion', 'setupQuality', 'followedPlan',
  'mistakes', 'lessons', 'tags', 'journalEntryId',
];

interface SnapTradeAccountRaw {
  id: string;
  brokerage_authorization: string;
  name: string | null;
  number: string;
  institution_name: string;
}

export interface SyncResult {
  userId: string;
  accounts: number;
  tradesWritten: number;
  backedUp: number;
  perAccount: { accountId: string; brokerage: string; activities: number; trades: number }[];
}

export async function syncUserTrades(connection: BrokerConnection): Promise<SyncResult> {
  const { userId, snaptradeUserId, userSecret } = connection;

  // Refresh the account list from SnapTrade (authoritative); fall back to cache.
  let accounts: BrokerAccount[] = connection.accounts;
  try {
    const raw = (await listAccounts({ snaptradeUserId, userSecret })) as SnapTradeAccountRaw[];
    accounts = (raw ?? []).map(a => ({
      id: a.id,
      brokerage: a.institution_name,
      name: a.name || a.institution_name,
      number: a.number,
      authorizationId: a.brokerage_authorization,
    }));
    await setBrokerAccounts(userId, accounts);
  } catch (error) {
    console.error('syncUserTrades: listAccounts failed, using cached accounts:', error);
  }

  const perAccount: SyncResult['perAccount'] = [];
  const brokerTrades: Trade[] = [];

  for (const acct of accounts) {
    const activities = await getAllAccountActivities({
      snaptradeUserId,
      userSecret,
      accountId: acct.id,
    });
    const trades = buildTradesFromActivities(activities, {
      userId,
      accountId: acct.id,
      brokerage: acct.brokerage,
    });
    brokerTrades.push(...trades);
    perAccount.push({
      accountId: acct.id,
      brokerage: acct.brokerage,
      activities: activities.length,
      trades: trades.length,
    });
  }

  // Carry user-authored journal fields forward (match by stable externalId).
  const existing = await getAllTrades(userId);
  const byExternal = new Map(
    existing.filter(t => t.externalId).map(t => [t.externalId as string, t])
  );
  const merged = brokerTrades.map(t => {
    const prev = t.externalId ? byExternal.get(t.externalId) : undefined;
    if (!prev) return t;
    const carry: Record<string, unknown> = {};
    for (const f of JOURNAL_FIELDS) {
      const val = prev[f];
      if (val !== undefined) carry[f] = val;
    }
    // Keep the original createdAt so the trade's age stays stable across syncs.
    return { ...t, ...carry, createdAt: prev.createdAt ?? t.createdAt } as Trade;
  });

  const { written, backedUp } = await replaceAllTrades(merged, userId, { backup: true });
  await setLastSyncedAt(userId, new Date().toISOString());

  return { userId, accounts: accounts.length, tradesWritten: written, backedUp, perAccount };
}
