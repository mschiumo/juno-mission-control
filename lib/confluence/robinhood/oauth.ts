/**
 * Robinhood OAuth token management for the server-side MCP transport.
 *
 * Robinhood agentic access is OAuth 2.1 + PKCE — there is no static API key. You
 * capture a refresh token once (see docs/CONFLUENCE_ROBINHOOD_TOKEN.md), and
 * this module trades it for short-lived access tokens on demand and caches them
 * in Redis, so callers never handle expiry.
 *
 * Token source precedence:
 *   1. Refresh flow — when ROBINHOOD_OAUTH_CLIENT_ID + a refresh token are set.
 *      Access tokens are cached (Redis) until ~60s before expiry; the refresh
 *      token is persisted in Redis and updated on rotation (so a rotating
 *      refresh token survives across invocations, not just the env seed).
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

/** True when either a refresh-token flow or a static token is configured. */
export function isRobinhoodConfigured(): boolean {
  const hasRefresh = !!(process.env.ROBINHOOD_OAUTH_CLIENT_ID && process.env.ROBINHOOD_OAUTH_REFRESH_TOKEN);
  return hasRefresh || !!process.env.ROBINHOOD_MCP_TOKEN;
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
  const clientId = process.env.ROBINHOOD_OAUTH_CLIENT_ID!;
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
  const hasRefresh = !!(process.env.ROBINHOOD_OAUTH_CLIENT_ID && (await currentRefreshToken()));
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
    'Robinhood MCP is not configured. Set ROBINHOOD_OAUTH_CLIENT_ID + a refresh token (durable) or a static ROBINHOOD_MCP_TOKEN (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).',
  );
}
