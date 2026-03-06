/**
 * Google Calendar OAuth Callback Handler
 * 
 * Handles the OAuth callback from Google, exchanges the authorization code
 * for tokens, and stores the refresh token in Redis.
 */

import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/auth/calendar/callback` : 'http://localhost:3000/api/auth/calendar/callback');

// Redis client
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined,
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

/**
 * Parse cookies from request headers
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  
  return cookies;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
} | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Token exchange error:', data);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to exchange code for tokens:', error);
    return null;
  }
}

/**
 * Store refresh token in Redis
 */
async function storeRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      console.error('Redis unavailable - cannot store token');
      return false;
    }

    // Store with multiple keys for compatibility
    const keys = [
      `google:refresh_token:${userId}`,
      `calendar:refresh_token:${userId}`,
      `gmail:refresh_token:${userId}`
    ];

    for (const key of keys) {
      await redis.set(key, refreshToken);
    }

    // Also update the environment variable storage for immediate use
    await redis.set('google:refresh_token:default', refreshToken);

    console.log(`Stored refresh token for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to store refresh token:', error);
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    
    // Parse cookies from request
    const cookieHeader = request.headers.get('cookie');
    const cookies = parseCookies(cookieHeader);
    
    const storedState = cookies.oauth_state;
    const codeVerifier = cookies.oauth_code_verifier;
    const userId = cookies.oauth_user_id || 'default';

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/?calendar_auth=error&error=${encodeURIComponent(error)}`, request.url)
      );
    }

    // Validate state parameter (CSRF protection)
    if (!state || state !== storedState) {
      console.error('State mismatch - possible CSRF attack');
      return NextResponse.redirect(
        new URL('/?calendar_auth=error&error=invalid_state', request.url)
      );
    }

    // Validate code verifier
    if (!codeVerifier) {
      console.error('Missing code verifier');
      return NextResponse.redirect(
        new URL('/?calendar_auth=error&error=missing_verifier', request.url)
      );
    }

    // Validate authorization code
    if (!code) {
      console.error('Missing authorization code');
      return NextResponse.redirect(
        new URL('/?calendar_auth=error&error=missing_code', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    
    if (!tokens) {
      return NextResponse.redirect(
        new URL('/?calendar_auth=error&error=token_exchange_failed', request.url)
      );
    }

    // Check if we have a refresh token
    if (!tokens.refresh_token) {
      console.warn('No refresh token received - user may have already authorized');
      // This can happen if the user has already authorized the app
      // We should still mark as success if we have an access token
    }

    // Store the refresh token
    if (tokens.refresh_token) {
      const stored = await storeRefreshToken(userId, tokens.refresh_token);
      if (!stored) {
        console.error('Failed to store refresh token');
        // Continue anyway - we'll try to use the access token
      }
    }

    // Clear OAuth cookies
    const clearCookie = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    
    const response = NextResponse.redirect(
      new URL('/?calendar_auth=success', request.url)
    );
    
    response.headers.append('Set-Cookie', `oauth_state=; ${clearCookie}${secureFlag}`);
    response.headers.append('Set-Cookie', `oauth_code_verifier=; ${clearCookie}${secureFlag}`);
    response.headers.append('Set-Cookie', `oauth_user_id=; ${clearCookie}${secureFlag}`);

    console.log(`Calendar authorization successful for user: ${userId}`);
    return response;
  } catch (error) {
    console.error('Calendar callback error:', error);
    return NextResponse.redirect(
      new URL('/?calendar_auth=error&error=unknown', request.url)
    );
  }
}
