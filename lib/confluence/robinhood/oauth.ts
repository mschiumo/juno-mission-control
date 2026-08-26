/**
 * Robinhood OAuth token management for the server-side MCP transport.
 *
 * Robinhood agentic access is OAuth 2.1 + PKCE — there is no static API key. You
 * capture a refresh token once (see docs/CONFLUENCE_ROBINHOOD_TOKEN.md), and
 * this module trades it for short-lived access tokens on demand and caches them
 * in Redis, so callers never handle expiry.
 *
 * Token source precedence:
 *   1. Refresh flow — when a client id + a refresh token are available. BOTH are
 *      Redis-first with the env var as a seed: the in-app reconnect flow
 *      (lib/confluence/robinhood/connect.ts) writes fresh credentials straight
 *      to Redis, and refresh-token rotation is persisted there too, so neither
 *      survives on env alone. Access tokens are cached until ~60s before expiry.
 *   2. Static ROBINHOOD_MCP_TOKEN — a manually-pasted access token (short-lived;
 *      fine for a one-off supervised test).
 *
 * Nothing here runs unless configured; callers get ConfluenceNotConfigured.
 */

import { getRedisClient } from '@/lib/redis';

export class ConfluenceNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfluenceNotConfigured';
  }
}

const DEFAULT_TOKEN_URL = 'https://api.robinhood.com/oauth2/token/';
const EXPIRY_MARGIN_MS = 60_000; // refresh a minute early
const ACCESS_KEY = 'confluence:robinhood:access'; // { token, expiresAt }
const REFRESH_KEY = 'confluence:robinhood:refresh'; // current refresh token (survives rotation)
const CLIENT_ID_KEY = 'confluence:robinhood:client-id'; // client registered by the in-app connect flow

/**
 * True when a token can actually be resolved — i.e. exactly the precedence
 * {@link getRobinhoodAccessToken} follows, Redis included.
 *
 * This MUST stay async and Redis-aware. Refresh tokens rotate, and the rotated
 * one is persisted to Redis (REFRESH_KEY), not back into the environment. An
 * env-only check therefore reports "not configured" for a perfectly working
 * connection whose env seed has been superseded or removed — which is what the
 * Positions/Quotes panels showed ("reconnecting…", zero positions) and what
 * silently disabled auto take-profit in the order-poll cron, all while orders
 * kept reaching the broker through the Redis-backed token.
 */
export async function isRobinhoodAvailable(): Promise<boolean> {
  if (process.env.ROBINHOOD_MCP_TOKEN) return true;
  if (!(await currentClientId())) return false;
  return !!(await currentRefreshToken());
}

/**
 * Which credential path is actually in play — presence only, never values.
 *
 * `isRobinhoodAvailable()` collapses several very different states into one
 * boolean, and the health endpoint reported only that boolean as
 * `configured: true`. So a deployment missing ROBINHOOD_OAUTH_CLIENT_ID —
 * which makes getRobinhoodAccessToken() silently fall back to the short-lived
 * static ROBINHOOD_MCP_TOKEN — looked identical to a healthy OAuth setup.
 * That ambiguity is what made a 401 from Robinhood unattributable.
 */
export interface RobinhoodAuthDiagnostics {
  /** The branch getRobinhoodAccessToken() will take. */
  tokenSource: 'refresh' | 'static' | 'none';
  clientIdSet: boolean;
  /** Where the client id comes from (Redis — set by in-app reconnect — wins over the env seed). */
  clientIdSource: 'redis' | 'env' | 'none';
  staticTokenSet: boolean;
  /** Where the refresh token would come from (Redis wins over the env seed). */
  refreshTokenSource: 'redis' | 'env' | 'none';
  /** True when an unexpired access token is cached in Redis. */
  accessTokenCached: boolean;
}

/**
 * Describe the current auth configuration WITHOUT revealing any secret.
 * Every field is a boolean or an enum — no token, prefix, or length.
 */
export async function describeRobinhoodAuth(): Promise<RobinhoodAuthDiagnostics> {
  const staticTokenSet = !!process.env.ROBINHOOD_MCP_TOKEN;

  let clientIdSource: RobinhoodAuthDiagnostics['clientIdSource'] = 'none';
  let refreshTokenSource: RobinhoodAuthDiagnostics['refreshTokenSource'] = 'none';
  try {
    const redis = await getRedisClient();
    if (await redis.get(CLIENT_ID_KEY)) clientIdSource = 'redis';
    if (await redis.get(REFRESH_KEY)) refreshTokenSource = 'redis';
  } catch {
    /* fall through to the env seeds */
  }
  if (clientIdSource === 'none' && process.env.ROBINHOOD_OAUTH_CLIENT_ID) {
    clientIdSource = 'env';
  }
  if (refreshTokenSource === 'none' && process.env.ROBINHOOD_OAUTH_REFRESH_TOKEN) {
    refreshTokenSource = 'env';
  }
  const clientIdSet = clientIdSource !== 'none';

  const cached = await readCachedAccess();
  const accessTokenCached = !!cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now();

  const tokenSource = resolveTokenSource({ clientIdSet, refreshTokenSource, staticTokenSet });
  return { tokenSource, clientIdSet, clientIdSource, staticTokenSet, refreshTokenSource, accessTokenCached };
}

/**
 * Which branch {@link getRobinhoodAccessToken} will take, given what exists.
 *
 * Pure, and kept beside the real resolver on purpose: a diagnostic that drifts
 * from the code it describes is worse than none — it would confidently
 * misattribute an outage. Any change to getRobinhoodAccessToken's precedence
 * must change this too (test/confluence-broker/auth-precedence.test.ts).
 */
export function resolveTokenSource(input: {
  clientIdSet: boolean;
  refreshTokenSource: RobinhoodAuthDiagnostics['refreshTokenSource'];
  staticTokenSet: boolean;
}): RobinhoodAuthDiagnostics['tokenSource'] {
  // The refresh flow requires BOTH a client id and a refresh token; without
  // either, the static token is used — silently, which is the trap.
  if (input.clientIdSet && input.refreshTokenSource !== 'none') return 'refresh';
  if (input.staticTokenSet) return 'static';
  return 'none';
}

/** Current client id: Redis (set by the in-app reconnect flow) → env seed. */
async function currentClientId(): Promise<string | null> {
  try {
    const redis = await getRedisClient();
    const stored = await redis.get(CLIENT_ID_KEY);
    if (stored) return stored;
  } catch {
    /* fall through to env seed */
  }
  return process.env.ROBINHOOD_OAUTH_CLIENT_ID || null;
}

/** Current refresh token: Redis (may have rotated) → env seed. */
async function currentRefreshToken(): Promise<string | null> {
  try {
    const redis = await getRedisClient();
    const stored = await redis.get(REFRESH_KEY);
    if (stored) return stored;
  } catch {
    /* fall through to env seed */
  }
  return process.env.ROBINHOOD_OAUTH_REFRESH_TOKEN || null;
}

async function persistRefreshToken(token: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(REFRESH_KEY, token);
  } catch {
    /* best effort — env seed still works next time */
  }
}

interface CachedAccess {
  token: string;
  expiresAt: number; // epoch ms
}

async function readCachedAccess(): Promise<CachedAccess | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(ACCESS_KEY);
    return raw ? (JSON.parse(raw) as CachedAccess) : null;
  } catch {
    return null;
  }
}

async function cacheAccess(token: string, expiresInSec: number): Promise<void> {
  const expiresAt = Date.now() + expiresInSec * 1000;
  try {
    const redis = await getRedisClient();
    // Expire the cache entry a touch before the token itself.
    const ttl = Math.max(1, expiresInSec - 60);
    await redis.set(ACCESS_KEY, JSON.stringify({ token, expiresAt } satisfies CachedAccess), { EX: ttl });
  } catch {
    /* best effort */
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function refreshAccessToken(): Promise<string> {
  const clientId = await currentClientId();
  if (!clientId) {
    throw new ConfluenceNotConfigured('No Robinhood OAuth client id available — reconnect from Agents → Settings.');
  }
  const refreshToken = await currentRefreshToken();
  if (!refreshToken) {
    throw new ConfluenceNotConfigured('No Robinhood refresh token available — capture one (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).');
  }
  const tokenUrl = process.env.ROBINHOOD_OAUTH_TOKEN_URL || DEFAULT_TOKEN_URL;

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });

  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    // invalid_grant usually means the refresh token expired or was rotated away —
    // the operator must re-run the OAuth capture.
    throw new ConfluenceNotConfigured(`Robinhood token refresh failed (${detail}). Re-run the OAuth capture (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).`);
  }

  // Rotation: persist a new refresh token if the server issued one.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await persistRefreshToken(data.refresh_token);
  }
  await cacheAccess(data.access_token, data.expires_in ?? 3600);
  return data.access_token;
}

/**
 * Return a valid Robinhood access token, refreshing/caching as needed.
 * Throws ConfluenceNotConfigured when nothing is configured or a refresh fails.
 */
export async function getRobinhoodAccessToken(): Promise<string> {
  const hasRefresh = !!((await currentClientId()) && (await currentRefreshToken()));
  if (hasRefresh) {
    const cached = await readCachedAccess();
    if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return cached.token;
    }
    return refreshAccessToken();
  }

  const staticToken = process.env.ROBINHOOD_MCP_TOKEN;
  if (staticToken) return staticToken;

  throw new ConfluenceNotConfigured(
    'Robinhood MCP is not configured. Reconnect from Agents → Settings, or set ROBINHOOD_OAUTH_CLIENT_ID + a refresh token (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).',
  );
}

/**
 * Store a freshly-captured credential set (in-app reconnect flow). Writes are
 * NOT best-effort: if Redis is down the new credentials would exist nowhere —
 * the env still seeds the OLD dead client — so the caller must see the failure
 * rather than report a reconnect that didn't stick. The stale access-token
 * cache is dropped in the same breath so the next call uses the new grant.
 */
export async function persistOAuthCredentials(creds: {
  clientId: string;
  refreshToken: string;
  accessToken?: string;
  expiresInSec?: number;
}): Promise<void> {
  const redis = await getRedisClient();
  await Promise.all([
    redis.set(CLIENT_ID_KEY, creds.clientId),
    redis.set(REFRESH_KEY, creds.refreshToken),
    redis.del(ACCESS_KEY),
  ]);
  if (creds.accessToken && creds.expiresInSec) {
    await cacheAccess(creds.accessToken, creds.expiresInSec);
  }
}

/**
 * Clear every cached credential (client id, refresh token, access token) so the
 * environment re-seeds on the next call. Reports what was present — mid-recovery,
 * "nothing was cached" is a different diagnosis from "cleared".
 */
export async function resetCachedRobinhoodAuth(): Promise<{
  clientId: boolean;
  refreshToken: boolean;
  accessToken: boolean;
}> {
  const redis = await getRedisClient();
  const [hadClientId, hadRefresh, hadAccess] = await Promise.all([
    redis.get(CLIENT_ID_KEY),
    redis.get(REFRESH_KEY),
    redis.get(ACCESS_KEY),
  ]);
  await Promise.all([redis.del(CLIENT_ID_KEY), redis.del(REFRESH_KEY), redis.del(ACCESS_KEY)]);
  return { clientId: !!hadClientId, refreshToken: !!hadRefresh, accessToken: !!hadAccess };
}
