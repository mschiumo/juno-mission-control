/**
 * SnapTrade sync orchestration
 *
 * Pulls each linked account's activities, transforms them into round-trip
 * Trades, and merges them into the user's trade list. The broker is the source
 * of truth ONLY for broker-sourced trades: manually-imported (account-statement
 * / CSV) trades are always preserved, and a sync that produces no broker trades
 * (no linked accounts, or an empty/transient activities feed) skips the write
 * entirely rather than blanking the list. User-authored journal fields are
 * carried across re-syncs so re-importing never wipes written reflections, and
 * the pre-sync list is backed up once for recovery.
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

  const existing = await getAllTrades(userId);

  // SAFETY GUARD — never let a sync blank the trade list.
  //
  // A sync must be *additive* to broker data and must NEVER delete the user's
  // manually-imported (account-statement / CSV) trades. Two empty-result cases
  // used to fall straight through to a full-list wipe:
  //   1. No linked accounts (e.g. a stale connection record whose brokerage
  //      link was never completed) — the account loop never runs.
  //   2. Accounts linked but the activities feed is transiently empty (SnapTrade
  //      backfills brokerage history asynchronously after a link).
  // In both cases the broker is NOT the source of truth for anything, so we skip
  // the write entirely and leave existing trades untouched.
  if (accounts.length === 0 || brokerTrades.length === 0) {
    console.warn(
      `syncUserTrades: no broker trades to write for user ${userId} ` +
        `(accounts=${accounts.length}, brokerActivities=${perAccount.reduce((n, p) => n + p.activities, 0)}); ` +
        `leaving ${existing.length} existing trades untouched.`
    );
    await setLastSyncedAt(userId, new Date().toISOString());
    return { userId, accounts: accounts.length, tradesWritten: 0, backedUp: 0, perAccount };
  }

  // Carry user-authored journal fields forward (match by stable externalId).
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

  // Broker owns only broker-sourced trades. Preserve everything the user brought
  // in by hand (manual / CSV / account-statement imports have source !== 'broker')
  // and swap out just the broker subset for the freshly-synced set.
  const preserved = existing.filter(t => t.source !== 'broker');
  const nextTrades = [...preserved, ...merged];

  const { written, backedUp } = await replaceAllTrades(nextTrades, userId, { backup: true });
  await setLastSyncedAt(userId, new Date().toISOString());

  return {
    userId,
    accounts: accounts.length,
    tradesWritten: merged.length,
    backedUp,
    perAccount,
  };
}
