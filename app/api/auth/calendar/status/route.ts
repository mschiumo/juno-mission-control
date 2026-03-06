/**
 * Google Calendar Authorization Status Check
 * 
 * Returns whether the user has authorized Calendar access
 * and if the stored token is valid.
 */

import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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
 * Get refresh token for user from Redis
 */
async function getRefreshToken(userId: string): Promise<string | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    // Try different key patterns
    const keys = [
      `google:refresh_token:${userId}`,
      `calendar:refresh_token:${userId}`,
      `gmail:refresh_token:${userId}`,
      'google:refresh_token:default',
      process.env.GOOGLE_REFRESH_TOKEN // Fallback to env var
    ];

    for (const key of keys) {
      if (!key) continue;
      const token = await redis.get(key);
      if (token) return token;
    }

    return null;
  } catch (error) {
    console.error('Failed to get refresh token:', error);
    return null;
  }
}

/**
 * Test if a refresh token is valid by getting an access token
 */
async function testTokenValidity(refreshToken: string): Promise<boolean> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return false;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Token validity check failed:', error);
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';

    // Get the refresh token
    const refreshToken = await getRefreshToken(userId);
    
    if (!refreshToken) {
      return NextResponse.json({
        success: true,
        authorized: false,
        message: 'No refresh token found'
      });
    }

    // Test if the token is valid
    const isValid = await testTokenValidity(refreshToken);

    if (!isValid) {
      return NextResponse.json({
        success: true,
        authorized: false,
        message: 'Stored token is invalid or expired'
      });
    }

    return NextResponse.json({
      success: true,
      authorized: true,
      message: 'Calendar access authorized'
    });
  } catch (error) {
    console.error('Auth status check error:', error);
    return NextResponse.json({
      success: false,
      authorized: false,
      error: 'Failed to check authorization status'
    }, { status: 500 });
  }
}
