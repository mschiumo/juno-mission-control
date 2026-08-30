/**
 * Long-term Portfolio connection + data storage (SnapTrade)
 *
 * The Portfolio tab tracks the owner's buy-and-hold brokerage account. It is
 * deliberately a SEPARATE SnapTrade user (`<userId>-portfolio`) with its own
 * Redis namespace (`portfolio:*`) so the trading Journal pipeline can never
 * see these accounts: the trading sync wholesale-replaces broker trades and
 * feeds the Performance equity curve, and a long-term account flowing through
 * it would dump buy-and-hold activity straight into the day-trading P&L.
 * Keeping the namespaces apart (the trading cron enumerates
 * `broker:snaptrade:*`) is the isolation mechanism.
 *
 * SECURITY: `userSecret` is encrypted at rest exactly like the trading
 * connection's (AES-256-GCM via lib/secret-box.ts, keyed by
 * BROKER_SECRET_ENC_KEY).
 */

import { getRedisClient } from '@/lib/redis';
import { sealSecret, openSecret } from '@/lib/secret-box';
import type { BrokerAccount } from '@/lib/db/broker-connections';
import type { DailyBalance } from '@/lib/parsers/tos-parser';

/** SnapTrade userId used for the portfolio connection — distinct from the
 *  trading connection's (which is the bare app userId). */
export function portfolioSnaptradeUserId(userId: string): string {
  return `${userId}-portfolio`;
}

export interface PortfolioConnection {
  /** Our app user id. */
  userId: string;
  /** The SnapTrade userId this connection is registered under (see above). */
  snaptradeUserId: string;
  /** SnapTrade-issued secret — sensitive, encrypted at rest. */
  userSecret: string;
  /** Last-known set of linked accounts (refreshed on connect/complete and sync). */
  accounts: BrokerAccount[];
  /** ISO timestamp of initial registration. */
  connectedAt: string;
  /** ISO timestamp of the last successful sync, if any. */
  lastSyncedAt?: string;
}

/** One open position, normalized from SnapTrade's Position shape. */
export interface PortfolioPosition {
  symbol: string;
  description?: string;
  /** Share count; negative would indicate a short position. */
  units: number;
  /** Broker's last-known price per share (typically previous close). */
  price: number | null;
  /** Cost basis per share. */
  avgCost: number | null;
  /** units × avgCost, when avgCost is known. */
  costBasis: number | null;
  /** units × price, when price is known. */
  marketValue: number | null;
  /** Broker-reported unrealized P&L on the position. */
  openPnl: number | null;
  accountId: string;
}

export interface PortfolioAccountSummary {
  id: string;
  brokerage: string;
  name: string;
  number?: string;
  /** Broker-reported total account value (cash + positions, marked to market). */
  totalValue: number | null;
  /** Available cash, when the balance endpoint reports it. */
  cash: number | null;
}

/** Everything the Portfolio tab renders, recomputed wholesale on each sync. */
export interface PortfolioSnapshot {
  accounts: PortfolioAccountSummary[];
  positions: PortfolioPosition[];
  /** Sum of account total values (null when no account reported one). */
  totalValue: number | null;
  /** Sum of reported cash balances. */
  cash: number | null;
  /** Sum of positions' unrealized P&L. */
  openPnl: number;
  /** Derived daily account-value series (positions at cost) — see
   *  lib/snaptrade-balances.ts for the method. */
  balances: DailyBalance[];
  syncedAt: string;
}

/** One ledger entry (deposit, withdrawal, dividend, trade, fee, …). */
export interface PortfolioActivity {
  id: string;
  /** ET calendar day, YYYY-MM-DD. */
  date: string;
  /** SnapTrade activity type, uppercased: CONTRIBUTION, WITHDRAWAL, DIVIDEND, … */
  type: string;
  description?: string;
  symbol?: string;
  /** Cash amount for non-trade activities; signed as the broker reports it. */
  amount: number | null;
  units?: number;
  price?: number;
  fee?: number;
  accountId: string;
}

/** A stored weekly portfolio review. */
export interface PortfolioReview {
  /** ISO week key, e.g. 2026-W35. */
  periodKey: string;
  periodLabel: string;
  generatedAt: string;
  /** Raw model output (JSON text). */
  analysis: string;
  /** Snapshot figures at generation time, for the history list. */
  totalValue: number | null;
  weekChange: number | null;
  positionsCount: number;
}

const connectionKey = (userId: string) => `portfolio:snaptrade:${userId}`;
const snapshotKey = (userId: string) => `portfolio:snapshot:${userId}`;
const activitiesKey = (userId: string) => `portfolio:activities:${userId}`;
const reviewsKey = (userId: string) => `portfolio:reviews:${userId}`;

/** Reviews kept in the history list (about six months of weeklies). */
const MAX_REVIEWS = 26;

// ── Connection record ────────────────────────────────────────────────────────

export async function getPortfolioConnection(
  userId: string
): Promise<PortfolioConnection | null> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(connectionKey(userId));
    if (!data) return null;
    const parsed = JSON.parse(data) as PortfolioConnection;
    return { ...parsed, userSecret: openSecret(parsed.userSecret) };
  } catch (error) {
    console.error('Error getting portfolio connection from Redis:', error);
    return null;
  }
}

export async function savePortfolioConnection(
  connection: PortfolioConnection
): Promise<void> {
  const redis = await getRedisClient();
  const toStore: PortfolioConnection = {
    ...connection,
    userSecret: sealSecret(connection.userSecret),
  };
  await redis.set(connectionKey(connection.userId), JSON.stringify(toStore));
}

export async function setPortfolioAccounts(
  userId: string,
  accounts: BrokerAccount[]
): Promise<void> {
  const existing = await getPortfolioConnection(userId);
  if (!existing) return;
  await savePortfolioConnection({ ...existing, accounts });
}

export async function setPortfolioLastSyncedAt(
  userId: string,
  isoTimestamp: string
): Promise<void> {
  const existing = await getPortfolioConnection(userId);
  if (!existing) return;
  await savePortfolioConnection({ ...existing, lastSyncedAt: isoTimestamp });
}

/** Enumerate every portfolio connection (for the cron sync). */
export async function getAllPortfolioConnections(): Promise<PortfolioConnection[]> {
  const out: PortfolioConnection[] = [];
  try {
    const redis = await getRedisClient();
    for await (const key of redis.scanIterator({
      MATCH: 'portfolio:snaptrade:*',
      COUNT: 100,
    })) {
      const keyStr = Array.isArray(key) ? key[0] : key;
      const data = await redis.get(keyStr);
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as PortfolioConnection;
        out.push({ ...parsed, userSecret: openSecret(parsed.userSecret) });
      } catch (error) {
        console.error(`Skipping unreadable portfolio connection ${keyStr}:`, error);
      }
    }
  } catch (error) {
    console.error('Error enumerating portfolio connections:', error);
  }
  return out;
}

export async function deletePortfolioConnection(userId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(connectionKey(userId));
}

// ── Snapshot / activities / reviews ─────────────────────────────────────────

export async function getPortfolioSnapshot(
  userId: string
): Promise<PortfolioSnapshot | null> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(snapshotKey(userId));
    return data ? (JSON.parse(data) as PortfolioSnapshot) : null;
  } catch (error) {
    console.error('Error getting portfolio snapshot:', error);
    return null;
  }
}

export async function savePortfolioSnapshot(
  userId: string,
  snapshot: PortfolioSnapshot
): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(snapshotKey(userId), JSON.stringify(snapshot));
}

export async function getPortfolioActivities(
  userId: string
): Promise<PortfolioActivity[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(activitiesKey(userId));
    return data ? (JSON.parse(data) as PortfolioActivity[]) : [];
  } catch (error) {
    console.error('Error getting portfolio activities:', error);
    return [];
  }
}

export async function savePortfolioActivities(
  userId: string,
  activities: PortfolioActivity[]
): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(activitiesKey(userId), JSON.stringify(activities));
}

export async function getPortfolioReviews(userId: string): Promise<PortfolioReview[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(reviewsKey(userId));
    return data ? (JSON.parse(data) as PortfolioReview[]) : [];
  } catch (error) {
    console.error('Error getting portfolio reviews:', error);
    return [];
  }
}

/** Insert or replace the review for its periodKey; newest first, capped. */
export async function savePortfolioReview(
  userId: string,
  review: PortfolioReview
): Promise<void> {
  const redis = await getRedisClient();
  const existing = await getPortfolioReviews(userId);
  const rest = existing.filter(r => r.periodKey !== review.periodKey);
  const next = [review, ...rest]
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
    .slice(0, MAX_REVIEWS);
  await redis.set(reviewsKey(userId), JSON.stringify(next));
}

/** Remove all portfolio data stores (snapshot, activities, reviews). */
export async function clearPortfolioData(userId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del([snapshotKey(userId), activitiesKey(userId), reviewsKey(userId)]);
}
