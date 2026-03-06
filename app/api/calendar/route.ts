/**
 * Google Calendar API - OAuth Integration
 * 
 * Uses the same OAuth credentials as Gmail:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET  
 * - GOOGLE_REFRESH_TOKEN (stored in Redis with key `google:refresh_token:{userId}`)
 * 
 * Required OAuth scope: https://www.googleapis.com/auth/calendar.readonly
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

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  duration: number; // in minutes
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
  // Get today's start and end times in ISO format
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7); // Next 7 days
  
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

    // Map to our CalendarEvent interface
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
      
      // Calculate duration in minutes
      let duration = 0;
      if (isAllDay) {
        duration = 24 * 60; // All day events
      } else {
        duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60));
      }

      // Determine color based on event properties
      let color = '#F97316'; // Default tangerine
      const summary = (event.summary || '').toLowerCase();
      
      // Color mapping based on Google Calendar color IDs
      const colorMap: Record<string, string> = {
        '1': '#7986cb', // Lavender
        '2': '#33b679', // Sage
        '3': '#8e24aa', // Grape
        '4': '#e67c73', // Flamingo
        '5': '#f6c026', // Banana
        '6': '#f5511d', // Tangerine
        '7': '#039be5', // Peacock
        '8': '#616161', // Graphite
        '9': '#3f51b5', // Blueberry
        '10': '#0b8043', // Basil
        '11': '#d60000', // Tomato
      };

      if (event.colorId && colorMap[event.colorId]) {
        color = colorMap[event.colorId];
      } else if (summary.includes('workout') || summary.includes('gym') || summary.includes('lift')) {
        color = '#22c55e'; // Green for fitness
      } else if (summary.includes('trading') || summary.includes('market') || summary.includes('trade')) {
        color = '#F97316'; // Tangerine for trading
      } else if (summary.includes('meeting') || summary.includes('call')) {
        color = '#58a6ff'; // Blue for meetings
      } else if (summary.includes('personal') || summary.includes('family')) {
        color = '#d29922'; // Yellow for personal
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
    const cacheData = {
      events,
      timestamp: new Date().toISOString(),
      count: events.length
    };

    // Cache for 1 hour
    await redis.setEx(cacheKey, 3600, JSON.stringify(cacheData));
    return true;
  } catch (error) {
    console.error('Failed to cache events:', error);
    return false;
  }
}

/**
 * Get cached events from Redis
 */
async function getCachedEvents(userId: string): Promise<{ events: CalendarEvent[]; timestamp: string } | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const cacheKey = `calendar:events:${userId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('Failed to get cached events:', error);
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

// Mock events for development/testing
const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: '1',
    title: 'Morning Standup',
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
    duration: 30,
    calendar: 'Primary',
    color: '#58a6ff',
    description: 'Daily team sync',
    location: 'Zoom',
    isAllDay: false
  },
  {
    id: '2',
    title: 'Leg Day Workout',
    start: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 6.5 * 60 * 60 * 1000).toISOString(),
    duration: 90,
    calendar: 'Primary',
    color: '#22c55e',
    description: 'Squats, lunges, leg press',
    location: 'Gym',
    isAllDay: false
  },
  {
    id: '3',
    title: 'Trading Review',
    start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    duration: 60,
    calendar: 'Primary',
    color: '#F97316',
    description: 'Review today\'s trades and plan for tomorrow',
    location: 'Home Office',
    isAllDay: false
  }
];

/**
 * GET handler - Fetch calendar events
 * 
 * Query params:
 * - userId: User identifier (default: 'default')
 * - refresh: Force refresh from API (default: false)
 * - mock: Return mock data (default: false)
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const forceRefresh = searchParams.get('refresh') === 'true';
    const useMock = searchParams.get('mock') === 'true';

    // Return mock data if requested
    if (useMock) {
      return NextResponse.json({
        success: true,
        data: {
          events: MOCK_EVENTS,
          today: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() === new Date().toDateString()),
          upcoming: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() !== new Date().toDateString())
        },
        mock: true,
        timestamp: new Date().toISOString()
      });
    }

    // Try to get cached events first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedEvents(userId);
      if (cached) {
        const events = cached.events;
        const today = events.filter(e => new Date(e.start).toDateString() === new Date().toDateString());
        const upcoming = events.filter(e => new Date(e.start).toDateString() !== new Date().toDateString());
        
        return NextResponse.json({
          success: true,
          data: {
            events,
            today,
            upcoming
          },
          cached: true,
          cachedAt: cached.timestamp,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Get refresh token
    const refreshToken = await getRefreshToken(userId);
    
    if (!refreshToken) {
      console.log('No refresh token found, returning mock data');
      return NextResponse.json({
        success: true,
        data: {
          events: MOCK_EVENTS,
          today: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() === new Date().toDateString()),
          upcoming: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() !== new Date().toDateString())
        },
        mock: true,
        message: 'No Google Calendar authorization found. Please authorize the app.',
        timestamp: new Date().toISOString()
      });
    }

    // Get access token
    const accessToken = await getAccessToken(refreshToken);
    
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Failed to authenticate with Google Calendar',
        message: 'Please re-authorize the app with Calendar permissions'
      }, { status: 401 });
    }

    // Fetch events from Google Calendar
    const events = await fetchCalendarEvents(accessToken, 'primary', 20);
    
    // Cache the events
    await cacheEvents(userId, events);

    // Split into today and upcoming
    const today = events.filter(e => new Date(e.start).toDateString() === new Date().toDateString());
    const upcoming = events.filter(e => new Date(e.start).toDateString() !== new Date().toDateString());

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        events,
        today,
        upcoming
      },
      cached: false,
      durationMs: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('Calendar API error:', error);
    
    // Return mock data on error
    return NextResponse.json({
      success: true,
      data: {
        events: MOCK_EVENTS,
        today: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() === new Date().toDateString()),
        upcoming: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() !== new Date().toDateString())
      },
      mock: true,
      error: errorMessage,
      durationMs: duration,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * POST handler - Store refresh token
 * 
 * Body:
 * - userId: User identifier
 * - refreshToken: Google refresh token
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId = 'default', refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json({
        success: false,
        error: 'Refresh token is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis unavailable'
      }, { status: 500 });
    }

    // Store refresh token
    const key = `google:refresh_token:${userId}`;
    await redis.set(key, refreshToken);

    return NextResponse.json({
      success: true,
      message: 'Refresh token stored successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}
