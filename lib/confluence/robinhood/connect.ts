/**
 * In-app Robinhood OAuth (re)connect — the browser flow, run by the app itself.
 *
 * Robinhood agentic access has no permanent credential: clients are registered
 * DYNAMICALLY (RFC 7591) and Robinhood culls those registrations on its own
 * schedule — twice in Aug 2026 the app's client died while the token endpoint
 * kept happily refreshing for it (the two live on different hosts:
 * api.robinhood.com mints tokens, agent.robinhood.com serves the MCP and
 * decides which clients it still accepts). Recovery therefore always means a
 * fresh registration + a fresh human login; the only thing that CAN be
 * improved is how much ceremony that takes. This module reduces it to one
 * click: the app registers its own client against its own callback URL,
 * redirects the owner to Robinhood to sign in, and stores the resulting
 * credentials in Redis itself — no terminal script, no env edits, no manual
 * cache reset.
 *
 * Split: pure/URL-building pieces are exported for tests; the Redis stash
 * gives the callback its PKCE verifier back and makes `state` single-use.
 */

import { createHash, randomBytes } from 'node:crypto';
import { getRedisClient } from '@/lib/redis';

export const ROBINHOOD_MCP_RESOURCE = 'https://agent.robinhood.com/mcp/trading';
const DISCOVERY_URL =
  'https://agent.robinhood.com/.well-known/oauth-authorization-server/mcp/trading';
const DISCOVERY_TIMEOUT_MS = 8_000;

export interface OAuthServerMeta {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  scopes_supported?: string[];
}

/** Last-observed live values (2026-08-25) — used when discovery is unreachable. */
export const FALLBACK_META: OAuthServerMeta = {
  authorization_endpoint: 'https://robinhood.com/oauth',
  token_endpoint: 'https://api.robinhood.com/oauth2/token/',
  registration_endpoint: 'https://agent.robinhood.com/oauth/trading/register',
  scopes_supported: ['internal'],
};

/**
 * Overlay whatever discovery returned onto the fallback. Discovery is the
 * authority when reachable (the registration endpoint has already moved once);
 * missing/empty fields keep the fallback value so a partial document cannot
 * produce an unusable meta.
 */
export function mergeOAuthMeta(fetched: Partial<OAuthServerMeta> | null | undefined): OAuthServerMeta {
  const merged = { ...FALLBACK_META };
  if (!fetched) return merged;
  if (fetched.authorization_endpoint) merged.authorization_endpoint = fetched.authorization_endpoint;
  if (fetched.token_endpoint) merged.token_endpoint = fetched.token_endpoint;
  if (fetched.registration_endpoint) merged.registration_endpoint = fetched.registration_endpoint;
  if (Array.isArray(fetched.scopes_supported) && fetched.scopes_supported.length) {
    merged.scopes_supported = fetched.scopes_supported;
  }
  return merged;
}

export async function discoverOAuthMeta(): Promise<OAuthServerMeta> {
  try {
    const res = await fetch(DISCOVERY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) return mergeOAuthMeta(null);
    return mergeOAuthMeta((await res.json()) as Partial<OAuthServerMeta>);
  } catch {
    return mergeOAuthMeta(null);
  }
}

/**
 * Register a fresh public client for `redirectUri`. Always fresh: reconnect
 * exists precisely because the previous registration stopped being honoured,
 * and abandoned registrations cost nothing. Verified 2026-08-25 that the
 * endpoint accepts a non-localhost https redirect URI.
 */
export async function registerClient(meta: OAuthServerMeta, redirectUri: string): Promise<string> {
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'confluencetrading-exec',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { client_id?: string; error?: string };
  if (!res.ok || !body.client_id) {
    throw new Error(
      `Robinhood client registration failed (HTTP ${res.status}${body.error ? `: ${body.error}` : ''}).`,
    );
  }
  return body.client_id;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');

/** PKCE pair (S256). The verifier never leaves the server — it is stashed in Redis. */
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function newState(): string {
  return b64url(randomBytes(24));
}

export function buildAuthorizeUrl(
  meta: OAuthServerMeta,
  opts: { clientId: string; redirectUri: string; state: string; codeChallenge: string },
): string {
  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('code_challenge', opts.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', opts.state);
  if (meta.scopes_supported?.length) url.searchParams.set('scope', meta.scopes_supported.join(' '));
  url.searchParams.set('resource', ROBINHOOD_MCP_RESOURCE);
  return url.toString();
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
}

export async function exchangeCode(
  tokenEndpoint: string,
  opts: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
): Promise<ExchangedTokens> {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: opts.codeVerifier,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Robinhood token exchange failed (${detail}).`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSec: data.expires_in ?? 3600,
  };
}

/* ------------------------------------------------------------------ */
/*  Pending-flow state (Redis)                                         */
/* ------------------------------------------------------------------ */

const STATE_KEY_PREFIX = 'confluence:robinhood:oauth-state:';
/** A login + MFA comfortably fits in 10 minutes; an abandoned flow self-cleans. */
const STATE_TTL_SEC = 600;

export interface PendingOAuth {
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
  /** Captured at start so the callback needs no second discovery round-trip. */
  tokenEndpoint: string;
}

export async function stashPendingOAuth(state: string, pending: PendingOAuth): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(STATE_KEY_PREFIX + state, JSON.stringify(pending), { EX: STATE_TTL_SEC });
}

/**
 * Fetch-and-delete: each `state` redeems exactly once, so a replayed callback
 * URL (browser refresh, forwarded link) cannot re-run the exchange.
 */
export async function consumePendingOAuth(state: string): Promise<PendingOAuth | null> {
  try {
    const redis = await getRedisClient();
    const key = STATE_KEY_PREFIX + state;
    const raw = await redis.get(key);
    if (!raw) return null;
    await redis.del(key);
    return JSON.parse(raw) as PendingOAuth;
  } catch {
    return null;
  }
}
