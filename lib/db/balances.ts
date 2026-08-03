import { getRedisClient } from '@/lib/redis';
import { DailyBalance } from '@/lib/parsers/tos-parser';

// Two stores, one curve. `user:daily-balances` holds figures the user uploaded
// (account statements); `user:broker-balances` holds the series derived from
// the live brokerage sync (lib/snaptrade-balances.ts). They stay separate
// because their lifecycles differ — uploads accumulate and are precious, while
// the derived series is recomputed wholesale on every sync — and the read path
// merges them with broker data winning on any date both cover.

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

/**
 * The series the equity curve consumes: uploaded statement balances extended /
 * overridden by the broker-derived ones. Broker wins on any date both cover
 * (it reflects the live ledger); statement uploads keep supplying the dates
 * the broker's backfill doesn't reach.
 */
export async function getCombinedDailyBalances(
  userId: string
): Promise<{ balances: DailyBalance[]; byAccount: Record<string, DailyBalance[]> }> {
  const [manual, broker] = await Promise.all([
    getDailyBalances(userId),
    getBrokerDailyBalances(userId),
  ]);
  if (broker.aggregate.length === 0) {
    return { balances: manual, byAccount: broker.byAccount };
  }
  const merged = new Map<string, number>();
  manual.forEach(b => merged.set(b.date, b.balance));
  broker.aggregate.forEach(b => merged.set(b.date, b.balance));
  return {
    balances: [...merged.entries()]
      .map(([date, balance]) => ({ date, balance }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byAccount: broker.byAccount,
  };
}
