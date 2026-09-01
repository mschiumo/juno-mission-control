/**
 * Long-term Portfolio sync
 *
 * Pulls the portfolio connection's accounts, positions, and full activity
 * ledger from SnapTrade and stores them wholesale under the `portfolio:*`
 * Redis namespace. Modeled on lib/snaptrade-sync.ts but with the opposite
 * output: this sync persists POSITIONS and ACTIVITIES (never trades), and it
 * never touches the trading Journal, balances, or fees stores.
 *
 * The daily value series reuses the same anchor-and-walk-back derivation the
 * trading curve uses (lib/snaptrade-balances.ts). Round-trip trades are built
 * transiently — only so realized P&L lands on the right day in the derived
 * series — and are then discarded.
 */

import {
  listAccounts,
  listAccountPositions,
  getAccountBalances,
  getAllAccountActivities,
  refreshConnection,
} from '@/lib/snaptrade';
import {
  buildTradesFromActivities,
  toETTimestamp,
  type SnapTradeActivity,
} from '@/lib/snaptrade-transform';
import { deriveDailyBalances, type AccountLedger } from '@/lib/snaptrade-balances';
import { getESTDateFromTimestamp } from '@/lib/date-utils';
import type { BrokerAccount } from '@/lib/db/broker-connections';
import {
  savePortfolioSnapshot,
  savePortfolioActivities,
  setPortfolioAccounts,
  setPortfolioLastSyncedAt,
  setPortfolioLastRefreshedAt,
  type PortfolioConnection,
  type PortfolioSnapshot,
  type PortfolioPosition,
  type PortfolioActivity,
  type PortfolioAccountSummary,
} from '@/lib/db/portfolio-connection';

interface SnapTradeAccountRaw {
  id: string;
  brokerage_authorization: string;
  name: string | null;
  number: string;
  institution_name: string;
  balance?: { total?: { amount?: number | null } | null };
  sync_status?: {
    holdings?: { last_successful_sync?: string | null } | null;
  } | null;
}

export interface PortfolioSyncResult {
  accounts: number;
  positions: number;
  activities: number;
  totalValue: number | null;
}

const r2 = (n: number) => Number(n.toFixed(2));

function normalizeActivity(a: SnapTradeActivity, accountId: string): PortfolioActivity | null {
  if (!a.trade_date) return null;
  const date = getESTDateFromTimestamp(toETTimestamp(a.trade_date));
  const symbol = a.symbol?.symbol || a.symbol?.raw_symbol || undefined;
  return {
    // The natural key keeps re-syncs stable when the broker omits ids.
    id: a.id || `${date}:${(a.type || '').toUpperCase()}:${symbol ?? ''}:${a.amount ?? ''}:${a.units ?? ''}`,
    date,
    type: (a.type || 'OTHER').toUpperCase(),
    description: a.description || undefined,
    symbol,
    amount: a.amount ?? null,
    units: a.units ?? undefined,
    price: a.price ?? undefined,
    fee: a.fee ?? undefined,
    accountId,
  };
}

/**
 * Sync one user's portfolio connection. Returns counts for logging. Throws on
 * a total failure (e.g. SnapTrade unreachable); partially-failing accounts are
 * skipped rather than poisoning the stored snapshot.
 */
export async function syncPortfolio(
  connection: PortfolioConnection
): Promise<PortfolioSyncResult> {
  const auth = {
    snaptradeUserId: connection.snaptradeUserId,
    userSecret: connection.userSecret,
  };

  const rawAccounts = (await listAccounts(auth)) as SnapTradeAccountRaw[];
  const accounts: BrokerAccount[] = (rawAccounts ?? []).map(a => ({
    id: a.id,
    brokerage: a.institution_name,
    name: a.name || a.institution_name,
    number: a.number,
    authorizationId: a.brokerage_authorization,
  }));
  await setPortfolioAccounts(connection.userId, accounts);

  const accountSummaries: PortfolioAccountSummary[] = [];
  const positions: PortfolioPosition[] = [];
  const allActivities: PortfolioActivity[] = [];
  const ledgers: AccountLedger[] = [];

  for (const raw of rawAccounts ?? []) {
    const totalValue = raw.balance?.total?.amount ?? null;

    let cash: number | null = null;
    try {
      const balances = await getAccountBalances({ ...auth, accountId: raw.id });
      const cashSum = balances.reduce(
        (s, b) => (typeof b.cash === 'number' ? s + b.cash : s),
        0
      );
      cash = balances.some(b => typeof b.cash === 'number') ? r2(cashSum) : null;
    } catch (error) {
      console.error(`[PortfolioSync] balances failed for account ${raw.id}:`, error);
    }

    let accountOpenPnl = 0;
    try {
      const rawPositions = await listAccountPositions({ ...auth, accountId: raw.id });
      for (const p of rawPositions) {
        const units = p.units ?? 0;
        if (units === 0) continue;
        const symbol =
          p.symbol?.symbol?.symbol || p.symbol?.symbol?.raw_symbol || 'UNKNOWN';
        const price = p.price ?? null;
        const avgCost = p.average_purchase_price ?? null;
        accountOpenPnl += p.open_pnl ?? 0;
        positions.push({
          symbol,
          description: p.symbol?.symbol?.description || undefined,
          units,
          price,
          avgCost,
          costBasis: avgCost != null ? r2(units * avgCost) : null,
          marketValue: price != null ? r2(units * price) : null,
          openPnl: p.open_pnl != null ? r2(p.open_pnl) : null,
          accountId: raw.id,
        });
      }
    } catch (error) {
      console.error(`[PortfolioSync] positions failed for account ${raw.id}:`, error);
    }

    let activities: SnapTradeActivity[] = [];
    try {
      activities = await getAllAccountActivities({ ...auth, accountId: raw.id });
      for (const a of activities) {
        const normalized = normalizeActivity(a, raw.id);
        if (normalized) allActivities.push(normalized);
      }
    } catch (error) {
      console.error(`[PortfolioSync] activities failed for account ${raw.id}:`, error);
    }

    // Transient round trips so realized P&L lands on the right day in the
    // derived value series; they are never written anywhere.
    const trades = buildTradesFromActivities(activities, {
      userId: connection.userId,
      accountId: raw.id,
      brokerage: raw.institution_name,
    });
    ledgers.push({
      accountId: raw.id,
      activities,
      trades,
      totalValue,
      openPnl: accountOpenPnl,
    });

    accountSummaries.push({
      id: raw.id,
      brokerage: raw.institution_name,
      name: raw.name || raw.institution_name,
      number: raw.number,
      totalValue,
      cash,
    });
  }

  const { balances } = deriveDailyBalances(ledgers);

  allActivities.sort((a, b) => b.date.localeCompare(a.date));

  const reportedValues = accountSummaries.filter(a => a.totalValue != null);
  const reportedCash = accountSummaries.filter(a => a.cash != null);
  const snapshot: PortfolioSnapshot = {
    accounts: accountSummaries,
    positions: positions.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)),
    totalValue: reportedValues.length
      ? r2(reportedValues.reduce((s, a) => s + (a.totalValue ?? 0), 0))
      : null,
    cash: reportedCash.length
      ? r2(reportedCash.reduce((s, a) => s + (a.cash ?? 0), 0))
      : null,
    openPnl: r2(positions.reduce((s, p) => s + (p.openPnl ?? 0), 0)),
    balances,
    syncedAt: new Date().toISOString(),
  };

  await savePortfolioSnapshot(connection.userId, snapshot);
  await savePortfolioActivities(connection.userId, allActivities);
  await setPortfolioLastSyncedAt(connection.userId, snapshot.syncedAt);

  return {
    accounts: accountSummaries.length,
    positions: positions.length,
    activities: allActivities.length,
    totalValue: snapshot.totalValue,
  };
}

export interface PortfolioRefreshSyncResult extends PortfolioSyncResult {
  /** True when the billable SnapTrade refresh was triggered on any connection. */
  refreshed: boolean;
  /** True when SnapTrade confirmed fresh holdings before the pull (vs syncing
   *  whatever was cached because the refresh hadn't landed by the deadline). */
  holdingsUpdated: boolean;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Force-refresh then sync: asks SnapTrade to pull fresh holdings straight from
 * the brokerage — the plain sync only re-reads SnapTrade's once-a-day cache —
 * waits (bounded) for the async refresh to land, then runs the normal sync.
 *
 * SnapTrade bills each refresh call, so callers gate this behind a cooldown
 * (manual sync) or a low-frequency cron. Falls back to a plain cache sync when
 * the refresh can't be triggered.
 */
export async function refreshAndSyncPortfolio(
  connection: PortfolioConnection,
  opts: { pollTimeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<PortfolioRefreshSyncResult> {
  const pollTimeoutMs = opts.pollTimeoutMs ?? 60_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 10_000;
  const auth = {
    snaptradeUserId: connection.snaptradeUserId,
    userSecret: connection.userSecret,
  };

  // Baseline holdings-sync stamps so we can tell when the refresh lands.
  const baseline = new Map<string, string | null>();
  try {
    const raw = (await listAccounts(auth)) as SnapTradeAccountRaw[];
    for (const a of raw ?? []) {
      baseline.set(a.id, a.sync_status?.holdings?.last_successful_sync ?? null);
    }
  } catch (error) {
    console.error('[PortfolioSync] baseline listAccounts failed:', error);
  }

  const authorizationIds = [
    ...new Set(
      connection.accounts
        .map(a => a.authorizationId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  let refreshed = false;
  for (const authorizationId of authorizationIds) {
    try {
      await refreshConnection({ ...auth, authorizationId });
      refreshed = true;
    } catch (error) {
      // Refresh can be rejected (e.g. disabled on real-time plans); the cache
      // sync below still runs.
      console.error(
        `[PortfolioSync] refresh failed for authorization ${authorizationId}:`,
        error
      );
    }
  }

  let holdingsUpdated = false;
  if (refreshed && baseline.size > 0) {
    const deadline = Date.now() + pollTimeoutMs;
    while (Date.now() < deadline && !holdingsUpdated) {
      await sleep(pollIntervalMs);
      try {
        const raw = (await listAccounts(auth)) as SnapTradeAccountRaw[];
        holdingsUpdated = (raw ?? []).some(a => {
          const current = a.sync_status?.holdings?.last_successful_sync ?? null;
          return current != null && current !== baseline.get(a.id);
        });
      } catch {
        // Transient — keep polling until the deadline.
      }
    }
  }

  const result = await syncPortfolio(connection);
  if (refreshed) {
    await setPortfolioLastRefreshedAt(connection.userId, new Date().toISOString());
  }
  return { ...result, refreshed, holdingsUpdated };
}
