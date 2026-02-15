import { createClient } from 'redis';

// Strava Token Storage Schema
interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete_id: number;
}

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  console.log('[StravaAuth] Attempting to get Redis client...');
  
  if (redisClient) {
    console.log('[StravaAuth] Using existing Redis client');
    return redisClient;
  }
  
  console.log('[StravaAuth] Creating new Redis client...');
  console.log('[StravaAuth] REDIS_URL available:', !!process.env.REDIS_URL);
  
  try {
    const client = createClient({
      url: process.env.REDIS_URL || undefined
    });
    
    console.log('[StravaAuth] Redis client created:', !!client);
    
    client.on('error', (err) => {
      console.error('[StravaAuth] Redis Client Error:', err.message);
    });
    
    console.log('[StravaAuth] Connecting to Redis...');
    await client.connect();
    console.log('[StravaAuth] Redis connected successfully');
    redisClient = client;
    return client;
  } catch (error) {
    console.error('[StravaAuth] Failed to connect to Redis:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Redis connection error details:', error);
    return null;
  }
}

const STRAVA_TOKEN_KEY = 'strava:tokens';

/**
 * Get tokens from Redis
 */
export async function getTokens(): Promise<StravaTokens | null> {
  console.log('[StravaAuth] getTokens() called - attempting to retrieve from Redis...');
  
  try {
    const redis = await getRedisClient();
    console.log('[StravaAuth] Redis client for getTokens:', !!redis);
    
    if (!redis) {
      console.error('[StravaAuth] Redis unavailable - cannot retrieve Strava tokens');
      return null;
    }

    console.log('[StravaAuth] Fetching tokens with key:', STRAVA_TOKEN_KEY);
    const data = await redis.get(STRAVA_TOKEN_KEY);
    console.log('[StravaAuth] Token data retrieved:', data ? 'YES (length: ' + data.length + ')' : 'NO (null/undefined)');
    
    if (!data) {
      console.log('[StravaAuth] No Strava tokens found in Redis');
      return null;
    }

    const tokens = JSON.parse(data) as StravaTokens;
    console.log('[StravaAuth] Tokens parsed successfully. Athlete ID:', tokens.athlete_id, 'Expires at:', tokens.expires_at);
    console.log('[StravaAuth] Token expired?', isTokenExpired(tokens.expires_at));
    return tokens;
  } catch (error) {
    console.error('[StravaAuth] Failed to get Strava tokens from Redis:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Error details:', error);
    return null;
  }
}

/**
 * Save tokens to Redis
 */
export async function saveTokens(tokens: StravaTokens): Promise<boolean> {
  console.log('[StravaAuth] saveTokens() called for athlete:', tokens.athlete_id);
  
  try {
    const redis = await getRedisClient();
    console.log('[StravaAuth] Redis client for saveTokens:', !!redis);
    
    if (!redis) {
      console.error('[StravaAuth] Redis unavailable - cannot save Strava tokens');
      return false;
    }

    const tokenData = JSON.stringify(tokens);
    console.log('[StravaAuth] Token data to save (length):', tokenData.length);
    
    await redis.set(STRAVA_TOKEN_KEY, tokenData);
    console.log('[StravaAuth] Strava tokens saved to Redis successfully');
    return true;
  } catch (error) {
    console.error('[StravaAuth] Failed to save Strava tokens to Redis:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Error details:', error);
    return false;
  }
}

/**
 * Check if token is expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: number): boolean {
  const bufferSeconds = 300; // 5 minute buffer
  const now = Date.now();
  const expiresMs = (expiresAt - bufferSeconds) * 1000;
  const isExpired = now >= expiresMs;
  
  console.log('[StravaAuth] isTokenExpired check - now:', now, 'expiresMs:', expiresMs, 'isExpired:', isExpired);
  
  return isExpired;
}

/**
 * Refresh the Strava access token using the refresh token
 * Strava returns a NEW refresh token on every exchange - must persist it!
 */
export async function refreshStravaToken(refreshToken: string): Promise<StravaTokens | null> {
  console.log('[StravaAuth] refreshStravaToken() called');
  console.log('[StravaAuth] Refresh token provided (first 10 chars):', refreshToken.substring(0, 10) + '...');
  
  try {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    console.log('[StravaAuth] STRAVA_CLIENT_ID available:', !!clientId);
    console.log('[StravaAuth] STRAVA_CLIENT_SECRET available:', !!clientSecret);

    if (!clientId || !clientSecret) {
      console.error('[StravaAuth] Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET');
      return null;
    }

    console.log('[StravaAuth] Sending token refresh request to Strava...');

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    console.log('[StravaAuth] Token refresh response status:', response.status);
    console.log('[StravaAuth] Token refresh response OK:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[StravaAuth] Strava token refresh failed:', response.status, errorText);
      console.error('[StravaAuth] Full error response:', errorText);
      console.error('[StravaAuth] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));
      try {
        const errorJson = JSON.parse(errorText);
        console.error('[StravaAuth] Parsed error details:', JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON, text already logged above
      }
      return null;
    }

    const data = await response.json();
    console.log('[StravaAuth] Token refresh response parsed successfully');
    console.log('[StravaAuth] New expires_at:', data.expires_at);
    console.log('[StravaAuth] Athlete ID:', data.athlete?.id);

    // Strava returns a NEW refresh token on every exchange - critical to save it!
    const tokens: StravaTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // NEW refresh token
      expires_at: data.expires_at,
      athlete_id: data.athlete?.id || 0,
    };

    console.log('[StravaAuth] New tokens created, saving to Redis...');
    
    // Persist the new tokens to Redis
    const saved = await saveTokens(tokens);
    if (!saved) {
      console.error('[StravaAuth] Failed to persist refreshed tokens to Redis');
      return null;
    }

    console.log('[StravaAuth] Token refreshed and persisted successfully');
    return tokens;
  } catch (error) {
    console.error('[StravaAuth] Error refreshing Strava token:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Error details:', error);
    return null;
  }
}

/**
 * Initialize tokens from environment variables (for first-time setup)
 */
export async function initializeTokensFromEnv(): Promise<StravaTokens | null> {
  console.log('[StravaAuth] initializeTokensFromEnv() called');
  
  try {
    const accessToken = process.env.STRAVA_ACCESS_TOKEN;
    const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
    const expiresAt = process.env.STRAVA_EXPIRES_AT;

    console.log('[StravaAuth] STRAVA_ACCESS_TOKEN available:', !!accessToken);
    console.log('[StravaAuth] STRAVA_REFRESH_TOKEN available:', !!refreshToken);
    console.log('[StravaAuth] STRAVA_EXPIRES_AT available:', !!expiresAt);

    if (!accessToken || !refreshToken) {
      console.log('[StravaAuth] No initial Strava tokens in environment variables');
      return null;
    }

    const tokens: StravaTokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt ? parseInt(expiresAt, 10) : Math.floor(Date.now() / 1000) + 21600, // 6 hours default
      athlete_id: 0,
    };

    console.log('[StravaAuth] Created tokens from env, expires_at:', tokens.expires_at);

    const saved = await saveTokens(tokens);
    if (saved) {
      console.log('[StravaAuth] Strava tokens initialized from environment variables');
    } else {
      console.error('[StravaAuth] Failed to save tokens from env to Redis');
    }
    return tokens;
  } catch (error) {
    console.error('[StravaAuth] Error initializing tokens from env:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Error details:', error);
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function to use when making API calls
 */
export async function getValidAccessToken(): Promise<string | null> {
  console.log('[StravaAuth] getValidAccessToken() called');
  
  try {
    // Try to get existing tokens from Redis
    console.log('[StravaAuth] Attempting to get tokens from Redis...');
    let tokens = await getTokens();
    console.log('[StravaAuth] Tokens from Redis:', tokens ? 'YES' : 'NO');

    // If no tokens in Redis, try to initialize from env
    if (!tokens) {
      console.log('[StravaAuth] No tokens in Redis, trying to initialize from env...');
      tokens = await initializeTokensFromEnv();
      console.log('[StravaAuth] Tokens from env:', tokens ? 'YES' : 'NO');
    }

    // If still no tokens, use refresh token from env var directly (fallback for Redis issues)
    if (!tokens) {
      const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
      if (refreshToken) {
        console.log('[StravaAuth] Using refresh token from env var directly');
        tokens = await refreshStravaToken(refreshToken);
        if (tokens) {
          // Save to Redis for next time (best effort)
          await saveTokens(tokens);
        }
      }
    }

    if (!tokens) {
      console.error('[StravaAuth] No Strava tokens available');
      return null;
    }

    console.log('[StravaAuth] Current token expires at:', tokens.expires_at);
    console.log('[StravaAuth] Current time:', Math.floor(Date.now() / 1000));
    console.log('[StravaAuth] Is token expired?', isTokenExpired(tokens.expires_at));

    // Check if token needs refresh
    if (isTokenExpired(tokens.expires_at)) {
      console.log('[StravaAuth] Strava access token expired, refreshing...');
      tokens = await refreshStravaToken(tokens.refresh_token);
      
      if (!tokens) {
        console.error('[StravaAuth] Failed to refresh Strava token');
        return null;
      }
    } else {
      console.log('[StravaAuth] Token is still valid, no refresh needed');
    }

    console.log('[StravaAuth] Returning valid access token (first 10 chars):', tokens.access_token.substring(0, 10) + '...');
    return tokens.access_token;
  } catch (error) {
    console.error('[StravaAuth] Error getting valid access token:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Error details:', error);
    return null;
  }
}

/**
 * Clear stored tokens (for logout/reset)
 */
export async function clearTokens(): Promise<boolean> {
  console.log('[StravaAuth] clearTokens() called');
  
  try {
    const redis = await getRedisClient();
    console.log('[StravaAuth] Redis client for clearTokens:', !!redis);
    
    if (!redis) {
      console.error('[StravaAuth] Redis unavailable - cannot clear tokens');
      return false;
    }

    await redis.del(STRAVA_TOKEN_KEY);
    console.log('[StravaAuth] Strava tokens cleared from Redis');
    return true;
  } catch (error) {
    console.error('[StravaAuth] Error clearing Strava tokens:', error instanceof Error ? error.message : error);
    console.error('[StravaAuth] Error details:', error);
    return false;
  }
}

// Export types
export type { StravaTokens };
