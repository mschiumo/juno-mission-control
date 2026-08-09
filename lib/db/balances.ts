import { getRedisClient } from '@/lib/redis';
import { DailyBalance } from '@/lib/parsers/tos-parser';

// Two stores, one curve. `user:daily-balances` holds figures the user uploaded
// (account statements); `user:broker-balances` holds the series derived from
// the live brokerage sync (lib/snaptrade-balances.ts). They stay separate
// because their lifecycles differ — uploads accumulate and are precious, while
// the derived series is recomputed wholesale on every sync. The read path is
// single-source: the broker series feeds the curve whenever it exists (a
// linked brokerage is the sole source of truth), otherwise statement uploads
// do. The two are never blended — their account scopes differ, so mixing them
// per-date renders discontinuities that read as P&L that never happened.

function balancesKey(userId: string) {
  return `user:daily-balances:${userId}`;
}

function brokerBalancesKey(userId: string) {
  return `user:broker-balances:${userId}`;
}

export async function getDailyBalances(userId: string): Promise<DailyBalance[]> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(balancesKey(userId));
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error getting daily balances:', error);
    return [];
  }
}

/**
 * Merge new daily balances into the stored set. For any date present in
 * `incoming`, the new value overrides the stored one — uploads always reflect
 * the latest broker truth for the dates they cover. Untouched dates are
 * preserved so daily uploads accumulate history naturally.
 */
export async function saveDailyBalances(incoming: DailyBalance[], userId: string): Promise<number> {
  if (incoming.length === 0) return 0;
  try {
    const redis = await getRedisClient();
    const existing = await getDailyBalances(userId);

    const merged = new Map<string, number>();
    existing.forEach(b => merged.set(b.date, b.balance));
    incoming.forEach(b => merged.set(b.date, b.balance));

    const result: DailyBalance[] = [...merged.entries()]
      .map(([date, balance]) => ({ date, balance }))
      .sort((a, b) => a.date.localeCompare(b.date));

    await redis.set(balancesKey(userId), JSON.stringify(result));
    return result.length;
  } catch (error) {
    console.error('Error saving daily balances:', error);
    throw error;
  }
}

export async function clearDailyBalances(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(balancesKey(userId));
  } catch (error) {
    console.error('Error clearing daily balances:', error);
  }
}

/**
 * Broker-derived balances: the aggregate series plus one series per account
 * (keyed by SnapTrade account id). The per-account series feed each account's
 * own Performance view; the aggregate feeds "All Accounts".
 */
export interface BrokerBalances {
  aggregate: DailyBalance[];
  byAccount: Record<string, DailyBalance[]>;
}

const EMPTY_BROKER_BALANCES: BrokerBalances = { aggregate: [], byAccount: {} };

export async function getBrokerDailyBalances(userId: string): Promise<BrokerBalances> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(brokerBalancesKey(userId));
    if (!raw) return EMPTY_BROKER_BALANCES;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Records written before the per-account split were a bare aggregate array.
    if (Array.isArray(parsed)) return { aggregate: parsed, byAccount: {} };
    return {
      aggregate: Array.isArray(parsed?.aggregate) ? parsed.aggregate : [],
      byAccount: parsed?.byAccount && typeof parsed.byAccount === 'object' ? parsed.byAccount : {},
    };
  } catch (error) {
    console.error('Error getting broker daily balances:', error);
    return EMPTY_BROKER_BALANCES;
  }
}

/**
 * Replace the broker-derived balance series. Unlike uploads this is a full
 * overwrite: the series is recomputed from the complete ledger on every sync,
 * so merging with a previous derivation would only preserve stale points.
 */
export async function saveBrokerDailyBalances(
  balances: BrokerBalances,
  userId: string
): Promise<number> {
  try {
    const redis = await getRedisClient();
    await redis.set(brokerBalancesKey(userId), JSON.stringify(balances));
    return balances.aggregate.length;
  } catch (error) {
    console.error('Error saving broker daily balances:', error);
    throw error;
  }
}

export async function clearBrokerDailyBalances(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(brokerBalancesKey(userId));
  } catch (error) {
    console.error('Error clearing broker daily balances:', error);
  }
}

/** Which store is feeding the equity curve. */
export type BalanceSource = 'broker' | 'manual';

/**
 * Trim a balance series so it starts at `startDate`. The broker-derived series
 * walks the activity ledger back well before the brokerage was linked —
 * including the account's unfunded $0 days — but the app's story starts at
 * connection. Points before `startDate` are dropped; the balance as of that
 * day is carried forward as a boundary point so the curve opens at the
 * account's value at connection rather than at its first later event.
 */
export function clampBalancesFromDate(
  balances: DailyBalance[],
  startDate: string
): DailyBalance[] {
  if (balances.length === 0 || balances[0].date >= startDate) return balances;
  let carry: number | null = null;
  const kept: DailyBalance[] = [];
  for (const b of balances) {
    if (b.date < startDate) carry = b.balance;
    else kept.push(b);
  }
  if (carry !== null && (kept.length === 0 || kept[0].date > startDate)) {
    kept.unshift({ date: startDate, balance: carry });
  }
  return kept;
}

/**
 * The series the equity curve consumes — single-source. When the brokerage
 * sync has produced a series, it is the curve's only input (the linked broker
 * is the source of truth; disconnecting clears the derived series, restoring
 * the uploads). Otherwise the statement uploads are. `source` tells the client
 * which one it got, so it can skip manual-only adornments (the hand-entered
 * starting-balance anchor) on a broker-fed curve.
 */
export async function getCombinedDailyBalances(
  userId: string
): Promise<{
  balances: DailyBalance[];
  byAccount: Record<string, DailyBalance[]>;
  source: BalanceSource;
}> {
  const [manual, broker] = await Promise.all([
    getDailyBalances(userId),
    getBrokerDailyBalances(userId),
  ]);
  if (broker.aggregate.length === 0) {
    return { balances: manual, byAccount: broker.byAccount, source: 'manual' };
  }
  return { balances: broker.aggregate, byAccount: broker.byAccount, source: 'broker' };
}
