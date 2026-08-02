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
 * Alongside trades, each sync derives the daily balance + fee series that feed
 * the Performance equity curve (see lib/snaptrade-balances.ts) from the same
 * activity ledger, so a connected brokerage keeps the curve alive without
 * statement uploads. Derivation is best-effort: it never fails the sync.
 *
 * Shared by the manual sync route and the scheduled cron.
 */

import { Trade } from '@/types/trading';
import {
  listAccounts,
  getAllAccountActivities,
  listAccountPositions,
} from '@/lib/snaptrade';
import { buildTradesFromActivities } from '@/lib/snaptrade-transform';
import { deriveDailyBalances, deriveDailyFees, AccountLedger } from '@/lib/snaptrade-balances';
import { getAllTrades, replaceAllTrades } from '@/lib/db/trades-v2';
import { saveBrokerDailyBalances } from '@/lib/db/balances';
import { saveBrokerDailyFees } from '@/lib/db/fees';
import { getAccountSettings } from '@/lib/db/account-settings';
import { isAccountActive } from '@/lib/account-classification';
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
  balance?: { total?: { amount?: number | null } | null } | null;
}

export interface SyncResult {
  userId: string;
  accounts: number;
  tradesWritten: number;
  backedUp: number;
  /** Points in the derived daily-balance series (0 when derivation was skipped). */
  balanceDays: number;
  perAccount: { accountId: string; brokerage: string; activities: number; trades: number }[];
}

export async function syncUserTrades(connection: BrokerConnection): Promise<SyncResult> {
  const { userId, snaptradeUserId, userSecret } = connection;

  // Refresh the account list from SnapTrade (authoritative); fall back to cache.
  // The same response carries each account's current total value — the anchor
  // for the derived balance series. On the cached-fallback path there is no
  // fresh anchor, so derivation is skipped for those accounts.
  let accounts: BrokerAccount[] = connection.accounts;
  const totalValueById = new Map<string, number>();
  try {
    const raw = (await listAccounts({ snaptradeUserId, userSecret })) as SnapTradeAccountRaw[];
    accounts = (raw ?? []).map(a => ({
      id: a.id,
      brokerage: a.institution_name,
      name: a.name || a.institution_name,
      number: a.number,
      authorizationId: a.brokerage_authorization,
    }));
    for (const a of raw ?? []) {
      const amount = a.balance?.total?.amount;
      if (typeof amount === 'number' && Number.isFinite(amount)) {
        totalValueById.set(a.id, amount);
      }
    }
    await setBrokerAccounts(userId, accounts);
  } catch (error) {
    console.error('syncUserTrades: listAccounts failed, using cached accounts:', error);
  }

  // A single brokerage login can expose several accounts (Robinhood surfaces
  // Individual, Crypto, …). Only pull the ones the user actually chose to use —
  // skipping the rest avoids importing unwanted history and saves API calls.
  const settings = await getAccountSettings(userId);
  const activeAccounts = accounts.filter(a => isAccountActive(settings, a.id));
  if (activeAccounts.length < accounts.length) {
    console.info(
      `syncUserTrades: skipping ${accounts.length - activeAccounts.length} deactivated account(s) for user ${userId}`,
    );
  }

  const perAccount: SyncResult['perAccount'] = [];
  const brokerTrades: Trade[] = [];
  const ledgers: AccountLedger[] = [];

  for (const acct of activeAccounts) {
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

    // Anchor correction for the balance derivation: subtract open positions'
    // unrealized P&L so the series is at-cost. Best-effort — a failed positions
    // call just leaves the anchor marked-to-market.
    let openPnl = 0;
    try {
      const positions = await listAccountPositions({
        snaptradeUserId,
        userSecret,
        accountId: acct.id,
      });
      openPnl = positions.reduce((s, p) => s + (p.open_pnl ?? 0), 0);
    } catch (error) {
      console.error(`syncUserTrades: positions fetch failed for ${acct.id} (using marked value):`, error);
    }
    ledgers.push({
      accountId: acct.id,
      activities,
      trades,
      totalValue: totalValueById.get(acct.id) ?? null,
      openPnl,
    });
  }

  // Derive the equity-curve inputs from the ledgers just pulled. Runs before
  // the trade-write guard below: balances are meaningful even when no round
  // trips exist yet (e.g. a freshly funded account). Empty results skip the
  // write so a transient feed can't blank a previously derived series.
  const balanceDays = await deriveAndStoreBalances(userId, ledgers);

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
  if (activeAccounts.length === 0 || brokerTrades.length === 0) {
    console.warn(
      `syncUserTrades: no broker trades to write for user ${userId} ` +
        `(activeAccounts=${activeAccounts.length}/${accounts.length}, ` +
        `brokerActivities=${perAccount.reduce((n, p) => n + p.activities, 0)}); ` +
        `leaving ${existing.length} existing trades untouched.`
    );
    await setLastSyncedAt(userId, new Date().toISOString());
    return {
      userId,
      accounts: activeAccounts.length,
      tradesWritten: 0,
      backedUp: 0,
      balanceDays,
      perAccount,
    };
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
    accounts: activeAccounts.length,
    tradesWritten: merged.length,
    backedUp,
    balanceDays,
    perAccount,
  };
}

/**
 * Derive and persist the balance + fee series for the equity curve.
 * Best-effort by design: any failure is logged and the sync carries on —
 * derived analytics must never block the trade pull.
 */
async function deriveAndStoreBalances(
  userId: string,
  ledgers: AccountLedger[]
): Promise<number> {
  try {
    const { balances, skipped } = deriveDailyBalances(ledgers);
    if (skipped.length > 0) {
      console.warn(
        `syncUserTrades: no balance anchor for account(s) ${skipped.join(', ')} — ` +
          'excluded from the derived series this sync.'
      );
    }
    if (balances.length > 0) await saveBrokerDailyBalances(balances, userId);

    const fees = deriveDailyFees(ledgers);
    if (fees.length > 0) await saveBrokerDailyFees(fees, userId);

    return balances.length;
  } catch (error) {
    console.error('syncUserTrades: balance derivation failed (non-fatal):', error);
    return 0;
  }
}
