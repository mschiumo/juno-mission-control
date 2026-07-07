import { getRedisClient } from '@/lib/redis';

// Strava OAuth + API helpers.
//
// Hard-won lesson from the previous integrations (see git history around
// Feb 2026): Strava returns a NEW refresh token on every token refresh, so the
// refresh token can never live in an env var — it must be persisted after
// every exchange. Tokens are stored per-user in Redis so each connected
// athlete refreshes independently.

const TOKEN_KEY_PREFIX = 'strava:tokens';
const STATE_KEY_PREFIX = 'strava:oauth_state';

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete_id: number;
  athlete_name: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number; // meters
  start_date_local: string; // ISO, athlete-local wall time
  achievement_count: number; // segment + best-effort achievements on this activity
  pr_count: number; // personal records set on this activity
}

function tokenKey(userId: string) {
  return `${TOKEN_KEY_PREFIX}:${userId}`;
}

function stateKey(userId: string) {
  return `${STATE_KEY_PREFIX}:${userId}`;
}

export async function saveTokens(userId: string, tokens: StravaTokens): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(tokenKey(userId), JSON.stringify(tokens));
}

export async function getTokens(userId: string): Promise<StravaTokens | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(tokenKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StravaTokens;
  } catch {
    return null;
  }
}

export async function deleteTokens(userId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(tokenKey(userId));
}

// Short-lived CSRF state for the OAuth round-trip.
export async function saveOAuthState(userId: string, state: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(stateKey(userId), state, { EX: 600 });
}

export async function consumeOAuthState(userId: string, state: string): Promise<boolean> {
  const redis = await getRedisClient();
  const stored = await redis.get(stateKey(userId));
  await redis.del(stateKey(userId));
  return !!stored && stored === state;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

export async function exchangeCodeForTokens(code: string): Promise<StravaTokens> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not configured');

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Number(clientId),
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed (${res.status}): ${await res.text()}`);

  const data = (await res.json()) as TokenResponse;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete?.id ?? 0,
    athlete_name: [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(' '),
  };
}

/**
 * Returns a valid access token for the user, refreshing (and persisting the
 * rotated refresh token) when the current one is expired or about to expire.
 * Returns null when the user has never connected Strava.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokens = await getTokens(userId);
  if (!tokens) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - nowSec > 300) return tokens.access_token; // 5-min buffer

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not configured');

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Number(clientId),
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) {
    // A 400/401 here means the refresh token is dead (revoked or lost
    // rotation) — the user must reconnect. Drop the stored tokens so the UI
    // falls back to the Connect state instead of erroring forever.
    if (res.status === 400 || res.status === 401) {
      await deleteTokens(userId);
      return null;
    }
    throw new Error(`Strava token refresh failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as TokenResponse;
  const updated: StravaTokens = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token, // CRITICAL: persist the rotated token
    expires_at: data.expires_at,
  };
  await saveTokens(userId, updated);
  return updated.access_token;
}

/** Fetch the user's recent activities (most recent first). */
export async function fetchRecentActivities(userId: string, afterUnixSec: number): Promise<StravaActivity[] | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const params = new URLSearchParams({ after: String(afterUnixSec), per_page: '200' });
  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    // Access token rejected despite refresh — treat as disconnected.
    await deleteTokens(userId);
    return null;
  }
  if (!res.ok) throw new Error(`Strava activities fetch failed (${res.status}): ${await res.text()}`);

  const raw = (await res.json()) as StravaActivity[];
  return raw.map((a) => ({
    id: a.id,
    name: a.name,
    sport_type: a.sport_type,
    distance: a.distance,
    moving_time: a.moving_time,
    total_elevation_gain: a.total_elevation_gain,
    start_date_local: a.start_date_local,
    achievement_count: a.achievement_count ?? 0,
    pr_count: a.pr_count ?? 0,
  }));
}
