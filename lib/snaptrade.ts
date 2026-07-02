/**
 * SnapTrade service wrapper
 *
 * Thin, typed wrappers around the SnapTrade TypeScript SDK so the rest of the
 * app never touches the raw client. SnapTrade lets users securely link a
 * brokerage (Robinhood, Schwab, Fidelity, …); we use it to pull trade
 * executions that feed the Performance and Journal sections.
 *
 * Auth model: each app user is registered once with SnapTrade, which returns a
 * `userSecret`. That `(userId, userSecret)` pair authenticates every subsequent
 * call for that user and is persisted in lib/db/broker-connections.ts.
 *
 * Credentials (SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY) are server-side
 * only. When they are absent the feature is treated as "not configured" so the
 * app degrades gracefully instead of throwing at import time.
 */

import { Snaptrade } from 'snaptrade-typescript-sdk';
import type { SnapTradeActivity } from '@/lib/snaptrade-transform';

let client: Snaptrade | null = null;

/** True when both SnapTrade credentials are present in the environment. */
export function isSnapTradeConfigured(): boolean {
  return Boolean(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY);
}

/**
 * Lazily construct (and memoize) the SnapTrade client.
 * Throws a clear error when credentials are missing — callers in API routes
 * should check isSnapTradeConfigured() first and return a friendly 503.
 */
export function getSnapTradeClient(): Snaptrade {
  if (!isSnapTradeConfigured()) {
    throw new Error(
      'SnapTrade is not configured. Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY.'
    );
  }
  if (!client) {
    client = new Snaptrade({
      clientId: process.env.SNAPTRADE_CLIENT_ID!,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
    });
  }
  return client;
}

// ── Authentication / user lifecycle ─────────────────────────────────────────

/**
 * Register an app user with SnapTrade. Returns the SnapTrade-issued userSecret,
 * which MUST be persisted — it cannot be retrieved again later.
 * Note: registering an already-registered userId errors, so callers should only
 * register when no stored connection exists for the user.
 */
export async function registerUser(
  snaptradeUserId: string
): Promise<{ userId: string; userSecret: string }> {
  const snaptrade = getSnapTradeClient();
  const res = await snaptrade.authentication.registerSnapTradeUser({
    userId: snaptradeUserId,
  });
  const userId = res.data.userId;
  const userSecret = res.data.userSecret;
  if (!userId || !userSecret) {
    throw new Error('SnapTrade registerSnapTradeUser did not return userId/userSecret');
  }
  return { userId, userSecret };
}

/**
 * Validate the partner credentials by making a lightweight authenticated call
 * (listSnapTradeUsers needs only clientId + consumerKey). Distinguishes
 * "vars missing" from "vars present but wrong/swapped".
 */
export async function checkCredentials(): Promise<{ valid: boolean; error?: string }> {
  try {
    const snaptrade = getSnapTradeClient();
    await snaptrade.authentication.listSnapTradeUsers();
    return { valid: true };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // Surface a short, non-sensitive reason (never echoes the keys).
    return { valid: false, error: raw.slice(0, 200) };
  }
}

/** Permanently deregister a user and disable all their brokerage links. */
export async function deleteUser(snaptradeUserId: string): Promise<void> {
  const snaptrade = getSnapTradeClient();
  await snaptrade.authentication.deleteSnapTradeUser({ userId: snaptradeUserId });
}

/**
 * Generate a Connection Portal URL the user opens to pick a brokerage and log
 * in. Optionally pass `customRedirect` to send the user back to the app after a
 * successful (redirect-style) connection; the iframe SDK uses callbacks instead.
 */
export async function generateConnectionPortalUrl(params: {
  snaptradeUserId: string;
  userSecret: string;
  customRedirect?: string;
  /** 'read' (data only) or 'trade'. We only need read access. */
  connectionType?: 'read' | 'trade';
}): Promise<string> {
  const snaptrade = getSnapTradeClient();
  const res = await snaptrade.authentication.loginSnapTradeUser({
    userId: params.snaptradeUserId,
    userSecret: params.userSecret,
    customRedirect: params.customRedirect,
    connectionType: params.connectionType ?? 'read',
  });
  // loginSnapTradeUser returns either { redirectURI } or a login-redirect object.
  const data = res.data as { redirectURI?: string };
  if (!data?.redirectURI) {
    throw new Error('SnapTrade loginSnapTradeUser did not return a redirectURI');
  }
  return data.redirectURI;
}

// ── Account information ──────────────────────────────────────────────────────

/** List the brokerage accounts linked under a user. */
export async function listAccounts(params: {
  snaptradeUserId: string;
  userSecret: string;
}) {
  const snaptrade = getSnapTradeClient();
  const res = await snaptrade.accountInformation.listUserAccounts({
    userId: params.snaptradeUserId,
    userSecret: params.userSecret,
  });
  return res.data;
}

/** List the brokerage authorizations (connections) for a user. */
export async function listConnections(params: {
  snaptradeUserId: string;
  userSecret: string;
}) {
  const snaptrade = getSnapTradeClient();
  const res = await snaptrade.connections.listBrokerageAuthorizations({
    userId: params.snaptradeUserId,
    userSecret: params.userSecret,
  });
  return res.data;
}

/**
 * Fetch raw activities (trade executions, dividends, transfers, …) for one
 * account. Phase 2's transform layer turns the BUY/SELL executions into the
 * app's round-trip Trade objects.
 */
export async function getAccountActivities(params: {
  snaptradeUserId: string;
  userSecret: string;
  accountId: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}) {
  const snaptrade = getSnapTradeClient();
  const res = await snaptrade.accountInformation.getAccountActivities({
    userId: params.snaptradeUserId,
    userSecret: params.userSecret,
    accountId: params.accountId,
    startDate: params.startDate,
    endDate: params.endDate,
  });
  return res.data;
}

/**
 * Fetch ALL activities for an account, following pagination. Returns the flat
 * list of activity objects (the transform layer filters to BUY/SELL).
 */
export async function getAllAccountActivities(params: {
  snaptradeUserId: string;
  userSecret: string;
  accountId: string;
  startDate?: string;
  endDate?: string;
}): Promise<SnapTradeActivity[]> {
  const snaptrade = getSnapTradeClient();
  const all: SnapTradeActivity[] = [];
  const limit = 1000;
  let offset = 0;

  // Guard bounds the loop in case `total` is ever missing/inconsistent.
  for (let guard = 0; guard < 100; guard++) {
    const res = await snaptrade.accountInformation.getAccountActivities({
      userId: params.snaptradeUserId,
      userSecret: params.userSecret,
      accountId: params.accountId,
      startDate: params.startDate,
      endDate: params.endDate,
      offset,
      limit,
    });
    const data = res.data as { data?: SnapTradeActivity[]; pagination?: { total?: number } };
    const page = data?.data ?? [];
    all.push(...page);
    const total = data?.pagination?.total ?? all.length;
    offset += page.length;
    if (page.length === 0 || all.length >= total) break;
  }
  return all;
}

/** Count a user's brokerage authorizations (connections) — used to enforce limits. */
export async function countConnections(params: {
  snaptradeUserId: string;
  userSecret: string;
}): Promise<number> {
  const conns = await listConnections(params);
  return Array.isArray(conns) ? conns.length : 0;
}
