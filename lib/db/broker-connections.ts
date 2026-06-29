/**
 * Broker connection storage (SnapTrade)
 *
 * Persists the per-user SnapTrade auth + linked-account metadata in Redis,
 * keyed by our app userId — mirroring the userId-keyed pattern used by
 * trades-v2 / active-trades. One record per user.
 *
 * SECURITY: `userSecret` is a long-lived credential that authenticates all
 * SnapTrade calls for the user. It is stored via getUserSecret/setUserSecret so
 * at-rest encryption can be slotted in (Phase 4) without touching callers.
 * TODO(phase4): encrypt userSecret at rest before opening to more users.
 */

import { getRedisClient } from '@/lib/redis';

export interface BrokerAccount {
  /** SnapTrade account id — stable, used as the sync key. */
  id: string;
  /** Brokerage display name, e.g. "Robinhood". */
  brokerage: string;
  /** Human-readable account name. */
  name: string;
  /** Masked account number, when provided. */
  number?: string;
  /** SnapTrade connection/authorization id this account belongs to. */
  authorizationId?: string;
}

export interface BrokerConnection {
  /** Our app user id (also used as the SnapTrade userId). */
  userId: string;
  /** The id we registered with SnapTrade (currently === userId). */
  snaptradeUserId: string;
  /** SnapTrade-issued secret — sensitive, see module note. */
  userSecret: string;
  /** Last-known set of linked accounts (refreshed on /accounts and /sync). */
  accounts: BrokerAccount[];
  /** ISO timestamp of initial registration. */
  connectedAt: string;
  /** ISO timestamp of the last successful trade sync, if any. */
  lastSyncedAt?: string;
}

function connectionKey(userId: string): string {
  return `broker:snaptrade:${userId}`;
}

// Indirection points for future at-rest encryption of the secret.
function setUserSecret(secret: string): string {
  return secret; // TODO(phase4): encrypt
}
function getUserSecret(stored: string): string {
  return stored; // TODO(phase4): decrypt
}

/** Fetch the user's SnapTrade connection record, or null if none. */
export async function getBrokerConnection(userId: string): Promise<BrokerConnection | null> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(connectionKey(userId));
    if (!data) return null;
    const parsed = JSON.parse(data) as BrokerConnection;
    return { ...parsed, userSecret: getUserSecret(parsed.userSecret) };
  } catch (error) {
    console.error('Error getting broker connection from Redis:', error);
    return null;
  }
}

/** Create or overwrite the user's SnapTrade connection record. */
export async function saveBrokerConnection(connection: BrokerConnection): Promise<void> {
  try {
    const redis = await getRedisClient();
    const toStore: BrokerConnection = {
      ...connection,
      userSecret: setUserSecret(connection.userSecret),
    };
    await redis.set(connectionKey(connection.userId), JSON.stringify(toStore));
  } catch (error) {
    console.error('Error saving broker connection to Redis:', error);
    throw error;
  }
}

/** Replace the stored account list (e.g. after re-listing accounts). */
export async function setBrokerAccounts(
  userId: string,
  accounts: BrokerAccount[]
): Promise<void> {
  const existing = await getBrokerConnection(userId);
  if (!existing) return;
  await saveBrokerConnection({ ...existing, accounts });
}

/** Stamp the last successful sync time. */
export async function setLastSyncedAt(userId: string, isoTimestamp: string): Promise<void> {
  const existing = await getBrokerConnection(userId);
  if (!existing) return;
  await saveBrokerConnection({ ...existing, lastSyncedAt: isoTimestamp });
}

/** Delete the user's SnapTrade connection record. */
export async function deleteBrokerConnection(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(connectionKey(userId));
  } catch (error) {
    console.error('Error deleting broker connection:', error);
    throw error;
  }
}
