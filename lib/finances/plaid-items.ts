/**
 * Storage for Plaid Items — one Item is one institution login (e.g. Capital One,
 * which may expose several cards). The access token is the long-lived credential
 * to the owner's real bank, so it is encrypted at rest (lib/finances/crypto.ts)
 * and never leaves the server: no route may return it, not even to the owner.
 */

import { getRedisClient } from '@/lib/redis';
import { decryptToken, encryptToken } from './crypto';
import type { SyncStatus } from './credit-cards';

export const PLAID_ITEMS_KEY = (userId: string) => `finances:${userId}:plaid-items`;

const KEY_PREFIX = 'finances:';
const KEY_SUFFIX = ':plaid-items';

/**
 * Redis MATCH pattern for finding every user with linked banks.
 *
 * Note the wildcard sits in the *middle*: the user id is infixed, so a naive
 * `PLAID_ITEMS_KEY('') + '*'` produces `finances::plaid-items*` and matches
 * nothing at all — which would make the nightly sweep silently no-op.
 */
export const PLAID_ITEMS_SCAN_PATTERN = `${KEY_PREFIX}*${KEY_SUFFIX}`;

/** Recover the user id from a scanned items key, or null if it isn't one. */
export function userIdFromItemsKey(key: string): string | null {
  if (!key.startsWith(KEY_PREFIX) || !key.endsWith(KEY_SUFFIX)) return null;
  const userId = key.slice(KEY_PREFIX.length, key.length - KEY_SUFFIX.length);
  // Reject ids containing the delimiter — those would be a different key shape.
  if (!userId || userId.includes(':')) return null;
  return userId;
}

export interface StoredPlaidItem {
  itemId: string;
  institutionName: string;
  institutionId?: string;
  /** AES-256-GCM ciphertext — never expose this field over the wire. */
  encryptedAccessToken: string;
  createdAt: string;
  lastSyncedAt?: string;
  status: SyncStatus;
  error?: string;
}

/** The safe projection of an Item for client responses — no token material. */
export interface PublicPlaidItem {
  itemId: string;
  institutionName: string;
  createdAt: string;
  lastSyncedAt?: string;
  status: SyncStatus;
  error?: string;
}

export function toPublicItem(item: StoredPlaidItem): PublicPlaidItem {
  return {
    itemId: item.itemId,
    institutionName: item.institutionName,
    createdAt: item.createdAt,
    lastSyncedAt: item.lastSyncedAt,
    status: item.status,
    error: item.error,
  };
}

export async function readItems(userId: string): Promise<StoredPlaidItem[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(PLAID_ITEMS_KEY(userId));
  return raw ? (JSON.parse(raw) as StoredPlaidItem[]) : [];
}

export async function writeItems(userId: string, items: StoredPlaidItem[]): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(PLAID_ITEMS_KEY(userId), JSON.stringify(items));
}

/**
 * Insert or update an Item by itemId. Re-linking the same institution (Plaid's
 * update mode, or simply running Link again) replaces the stored token in place
 * instead of accumulating duplicate Items — each duplicate would otherwise be a
 * separately billed subscription.
 */
export async function upsertItem(
  userId: string,
  item: { itemId: string; accessToken: string; institutionName: string; institutionId?: string },
): Promise<StoredPlaidItem> {
  const items = await readItems(userId);
  const now = new Date().toISOString();
  const existing = items.find((i) => i.itemId === item.itemId);

  const stored: StoredPlaidItem = {
    itemId: item.itemId,
    institutionName: item.institutionName || existing?.institutionName || 'Bank',
    institutionId: item.institutionId ?? existing?.institutionId,
    encryptedAccessToken: encryptToken(item.accessToken),
    createdAt: existing?.createdAt ?? now,
    lastSyncedAt: existing?.lastSyncedAt,
    status: 'ok',
    error: undefined,
  };

  const next = existing
    ? items.map((i) => (i.itemId === item.itemId ? stored : i))
    : [...items, stored];
  await writeItems(userId, next);
  return stored;
}

export async function markItemStatus(
  userId: string,
  itemId: string,
  status: SyncStatus,
  error?: string,
): Promise<void> {
  const items = await readItems(userId);
  const now = new Date().toISOString();
  await writeItems(
    userId,
    items.map((i) =>
      i.itemId === itemId
        ? { ...i, status, error, lastSyncedAt: status === 'ok' ? now : i.lastSyncedAt }
        : i,
    ),
  );
}

export async function removeItem(userId: string, itemId: string): Promise<StoredPlaidItem | null> {
  const items = await readItems(userId);
  const target = items.find((i) => i.itemId === itemId) ?? null;
  if (target) await writeItems(userId, items.filter((i) => i.itemId !== itemId));
  return target;
}

/** Decrypt an Item's access token for server-side Plaid calls only. */
export function accessTokenOf(item: StoredPlaidItem): string {
  return decryptToken(item.encryptedAccessToken);
}
