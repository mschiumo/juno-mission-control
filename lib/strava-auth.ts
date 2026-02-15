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
  if (redisClient) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.REDIS_URL || undefined
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

const STRAVA_TOKEN_KEY = 'strava:tokens';

/**
 * Get tokens from Redis
 */
export async function getTokens(): Promise<StravaTokens | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      console.error('Redis unavailable - cannot retrieve Strava tokens');
      return null;
    }

    const data = await redis.get(STRAVA_TOKEN_KEY);
    if (!data) {
      console.log('No Strava tokens found in Redis');
      return null;
    }

    return JSON.parse(data) as StravaTokens;
  } catch (error) {
    console.error('Failed to get Strava tokens from Redis:', error);
    return null;
  }
}

/**
 * Save tokens to Redis
 */
export async function saveTokens(tokens: StravaTokens): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      console.error('Redis unavailable - cannot save Strava tokens');
      return false;
    }

    await redis.set(STRAVA_TOKEN_KEY, JSON.stringify(tokens));
    console.log('Strava tokens saved to Redis successfully');
    return true;
  } catch (error) {
    console.error('Failed to save Strava tokens to Redis:', error);
    return false;
  }
}

/**
 * Check if token is expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: number): boolean {
  const bufferSeconds = 300; // 5 minute buffer
  return Date.now() >= (expiresAt - bufferSeconds) * 1000;
}

/**
 * Refresh the Strava access token using the refresh token
 * Strava returns a NEW refresh token on every exchange - must persist it!
 */
export async function refreshStravaToken(refreshToken: string): Promise<StravaTokens | null> {
  try {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET');
      return null;
    }

    console.log('Refreshing Strava access token...');

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Strava token refresh failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    // Strava returns a NEW refresh token on every exchange - critical to save it!
    const tokens: StravaTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // NEW refresh token
      expires_at: data.expires_at,
      athlete_id: data.athlete?.id || 0,
    };

    // Persist the new tokens to Redis
    const saved = await saveTokens(tokens);
    if (!saved) {
      console.error('Failed to persist refreshed tokens to Redis');
      return null;
    }

    console.log('Strava token refreshed and persisted successfully');
    return tokens;
  } catch (error) {
    console.error('Error refreshing Strava token:', error);
    return null;
  }
}

/**
 * Initialize tokens from environment variables (for first-time setup)
 */
export async function initializeTokensFromEnv(): Promise<StravaTokens | null> {
  try {
    const accessToken = process.env.STRAVA_ACCESS_TOKEN;
    const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
    const expiresAt = process.env.STRAVA_EXPIRES_AT;

    if (!accessToken || !refreshToken) {
      console.log('No initial Strava tokens in environment variables');
      return null;
    }

    const tokens: StravaTokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt ? parseInt(expiresAt, 10) : Math.floor(Date.now() / 1000) + 21600, // 6 hours default
      athlete_id: 0,
    };

    const saved = await saveTokens(tokens);
    if (saved) {
      console.log('Strava tokens initialized from environment variables');
    }
    return tokens;
  } catch (error) {
    console.error('Error initializing tokens from env:', error);
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function to use when making API calls
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    // Try to get existing tokens from Redis
    let tokens = await getTokens();

    // If no tokens in Redis, try to initialize from env
    if (!tokens) {
      tokens = await initializeTokensFromEnv();
    }

    if (!tokens) {
      console.error('No Strava tokens available');
      return null;
    }

    // Check if token needs refresh
    if (isTokenExpired(tokens.expires_at)) {
      console.log('Strava access token expired, refreshing...');
      tokens = await refreshStravaToken(tokens.refresh_token);
      
      if (!tokens) {
        console.error('Failed to refresh Strava token');
        return null;
      }
    }

    return tokens.access_token;
  } catch (error) {
    console.error('Error getting valid access token:', error);
    return null;
  }
}

/**
 * Clear stored tokens (for logout/reset)
 */
export async function clearTokens(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return false;
    }

    await redis.del(STRAVA_TOKEN_KEY);
    console.log('Strava tokens cleared from Redis');
    return true;
  } catch (error) {
    console.error('Error clearing Strava tokens:', error);
    return false;
  }
}

// Export types
export type { StravaTokens };
