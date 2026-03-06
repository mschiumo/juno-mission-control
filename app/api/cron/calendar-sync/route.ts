/**
 * Calendar Background Sync Cron Job
 * 
 * Fetches calendar events from Google Calendar every 15-30 minutes
 * and stores them in Redis cache for instant dashboard loading.
 * 
 * Schedule: Every 15 minutes
 * Cache key: calendar:events:{userId}
 * Cache TTL: 1 hour
 */

import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const JOB_NAME = 'Calendar Background Sync';
const JOB_ID = 'calendar-sync-001';

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

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  duration: number;
  calendar: string;
  color: string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  hangoutLink?: string;
  attendees?: string[];
}

/**
 * Get access token from refresh token
 */
async function getAccessToken(refreshToken: string): Promise<string | null> {
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
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Token refresh error:', data);
      return null;
    }
    
    return data.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Fetch calendar events from Google Calendar API
 */
async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string = 'primary',
  maxResults: number = 20
): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  
  const timeMin = startOfDay.toISOString();
  const timeMax = endOfDay.toISOString();

  try {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.append('maxResults', maxResults.toString());
    url.searchParams.append('timeMin', timeMin);
    url.searchParams.append('timeMax', timeMax);
    url.searchParams.append('singleEvents', 'true');
    url.searchParams.append('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Calendar API error:', error);
      return [];
    }

    const data = await response.json();
    const events = data.items || [];

    return events.map((event: {
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      colorId?: string;
      hangoutLink?: string;
      attendees?: Array<{ email: string; displayName?: string }>;
    }): CalendarEvent => {
      const start = event.start?.dateTime || event.start?.date || now.toISOString();
      const end = event.end?.dateTime || event.end?.date || now.toISOString();
      const isAllDay = !event.start?.dateTime && !!event.start?.date;
      
      let duration = 0;
      if (isAllDay) {
        duration = 24 * 60;
      } else {
        duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60));
      }

      let color = '#F97316';
      const summary = (event.summary || '').toLowerCase();
      
      const colorMap: Record<string, string> = {
        '1': '#7986cb',
        '2': '#33b679',
        '3': '#8e24aa',
        '4': '#e67c73',
        '5': '#f6c026',
        '6': '#f5511d',
        '7': '#039be5',
        '8': '#616161',
        '9': '#3f51b5',
        '10': '#0b8043',
        '11': '#d60000',
      };

      if (event.colorId && colorMap[event.colorId]) {
        color = colorMap[event.colorId];
      } else if (summary.includes('workout') || summary.includes('gym') || summary.includes('lift')) {
        color = '#22c55e';
      } else if (summary.includes('trading') || summary.includes('market') || summary.includes('trade')) {
        color = '#F97316';
      } else if (summary.includes('meeting') || summary.includes('call')) {
        color = '#58a6ff';
      } else if (summary.includes('personal') || summary.includes('family')) {
        color = '#d29922';
      }

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        start,
        end,
        duration,
        calendar: calendarId === 'primary' ? 'Primary' : calendarId,
        color,
        description: event.description || '',
        location: event.location || '',
        isAllDay,
        hangoutLink: event.hangoutLink,
        attendees: event.attendees?.map(a => a.displayName || a.email).filter(Boolean) || []
      };
    });
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}

/**
 * Store events in Redis cache
 */
async function cacheEvents(userId: string, events: CalendarEvent[]): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;

    const cacheKey = `calendar:events:${userId}`;
    const today = events.filter(e => new Date(e.start).toDateString() === new Date().toDateString());
    const upcoming = events.filter(e => new Date(e.start).toDateString() !== new Date().toDateString());
    
    const cacheData = {
      events,
      today,
      upcoming,
      timestamp: new Date().toISOString(),
      count: events.length
    };

    // Cache for 1 hour
    await redis.setEx(cacheKey, 3600, JSON.stringify(cacheData));
    console.log(`[CalendarSync] Cached ${events.length} events for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to cache events:', error);
    return false;
  }
}

/**
 * Get refresh token for user from Redis
 */
async function getRefreshToken(userId: string): Promise<string | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const keys = [
      `google:refresh_token:${userId}`,
      `gmail:refresh_token:${userId}`,
      'google:refresh_token:default',
      process.env.GOOGLE_REFRESH_TOKEN
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
 * Log activity to activity log
 */
async function logActivity(action: string, details: string, type: 'cron' | 'api' | 'user' | 'system' = 'cron'): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;

    const STORAGE_KEY = 'activity_log';
    const data = await redis.get(STORAGE_KEY);
    const activities = data ? JSON.parse(data) : [];

    const newActivity = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details,
      type
    };

    activities.push(newActivity);
    if (activities.length > 25) {
      activities.shift();
    }

    await redis.set(STORAGE_KEY, JSON.stringify(activities));
    return true;
  } catch (error) {
    console.error('Failed to log activity:', error);
    return false;
  }
}

/**
 * Post cron result
 */
async function postCronResult(content: string, type: string = 'sync'): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;

    const STORAGE_KEY = 'cron_results';
    const MAX_RESULTS = 100;
    
    const data = await redis.get(STORAGE_KEY);
    const results = data ? JSON.parse(data) : [];

    const newResult = {
      id: Date.now().toString(),
      jobName: JOB_NAME,
      timestamp: new Date().toISOString(),
      content,
      type
    };

    results.push(newResult);
    while (results.length > MAX_RESULTS) {
      results.shift();
    }

    await redis.set(STORAGE_KEY, JSON.stringify(results));
    return true;
  } catch (error) {
    console.error('Failed to post cron result:', error);
    return false;
  }
}

/**
 * Sync calendar for a specific user
 */
async function syncUserCalendar(userId: string): Promise<{ success: boolean; eventCount: number; error?: string }> {
  try {
    // Get refresh token
    const refreshToken = await getRefreshToken(userId);
    
    if (!refreshToken) {
      return { success: false, eventCount: 0, error: 'No refresh token found' };
    }

    // Get access token
    const accessToken = await getAccessToken(refreshToken);
    
    if (!accessToken) {
      return { success: false, eventCount: 0, error: 'Failed to authenticate' };
    }

    // Fetch events
    const events = await fetchCalendarEvents(accessToken, 'primary', 20);
    
    // Cache events
    await cacheEvents(userId, events);

    return { success: true, eventCount: events.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, eventCount: 0, error: errorMessage };
  }
}

/**
 * GET handler - Returns sync status without running sync
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';

    // Check if we have cached events
    const redis = await getRedisClient();
    let cached = null;
    
    if (redis) {
      const cacheKey = `calendar:events:${userId}`;
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        cached = JSON.parse(cachedData);
      }
    }

    return NextResponse.json({
      success: true,
      job: JOB_NAME,
      jobId: JOB_ID,
      userId,
      cached: cached ? {
        eventCount: cached.count,
        cachedAt: cached.timestamp
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}

/**
 * POST handler - Run the calendar sync
 * 
 * This is called by the cron scheduler every 15-30 minutes
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';

    console.log(`[CalendarSync] Starting sync for user: ${userId}`);

    // Sync calendar
    const result = await syncUserCalendar(userId);
    const duration = Date.now() - startTime;

    if (result.success) {
      // Log success
      await logActivity(
        'Calendar Sync Completed',
        `Synced ${result.eventCount} events in ${duration}ms`,
        'cron'
      );

      // Post result
      await postCronResult(
        `✅ Calendar sync completed: ${result.eventCount} events synced`,
        'sync'
      );

      return NextResponse.json({
        success: true,
        job: JOB_NAME,
        jobId: JOB_ID,
        data: {
          userId,
          eventCount: result.eventCount,
          durationMs: duration
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // Log failure
      await logActivity(
        'Calendar Sync Failed',
        `Error: ${result.error}`,
        'cron'
      );

      // Post error result
      await postCronResult(
        `❌ Calendar sync failed: ${result.error}`,
        'error'
      );

      return NextResponse.json({
        success: false,
        job: JOB_NAME,
        jobId: JOB_ID,
        error: result.error,
        durationMs: duration,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[CalendarSync] Unexpected error:', error);

    // Log error
    await logActivity('Calendar Sync Error', errorMessage, 'cron');
    await postCronResult(`❌ Calendar sync error: ${errorMessage}`, 'error');

    return NextResponse.json({
      success: false,
      job: JOB_NAME,
      jobId: JOB_ID,
      error: errorMessage,
      durationMs: duration,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
