/**
 * Google Calendar API - Service Account Integration
 * 
 * Uses Google Service Account for server-to-server authentication:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL (juno-calendar@juno-487215.iam.gserviceaccount.com)
 * - GOOGLE_SERVICE_ACCOUNT_KEY (private key)
 * 
 * No user OAuth flow required - always returns real calendar data
 */

import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import { google } from 'googleapis';

// Service Account configuration
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'juno-calendar@juno-487215.iam.gserviceaccount.com';
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

// Redis client for caching
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
 * Initialize Google Auth with service account
 */
function getGoogleAuth() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_SERVICE_ACCOUNT_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
}

/**
 * Fetch calendar events from Google Calendar API using service account
 */
async function fetchCalendarEvents(
  calendarId: string = GOOGLE_CALENDAR_ID,
  maxResults: number = 20
): Promise<CalendarEvent[]> {
  try {
    const auth = getGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    // Get today's start and next 7 days
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

    const response = await calendar.events.list({
      calendarId,
      maxResults,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    // Map to our CalendarEvent interface
    return events.map((event): CalendarEvent => {
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
        id: event.id || '',
        title: event.summary || 'Untitled Event',
        start,
        end,
        duration,
        calendar: calendarId === 'primary' ? 'Primary' : calendarId,
        color,
        description: event.description || '',
        location: event.location || '',
        isAllDay,
        hangoutLink: event.hangoutLink || undefined,
        attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean) || []
      };
    });
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    throw error;
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

// Mock events for fallback when service account is not configured
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

    // Return mock data if explicitly requested
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

    // Check if service account is configured
    if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.warn('GOOGLE_SERVICE_ACCOUNT_KEY not configured, returning mock data');
      return NextResponse.json({
        success: true,
        data: {
          events: MOCK_EVENTS,
          today: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() === new Date().toDateString()),
          upcoming: MOCK_EVENTS.filter(e => new Date(e.start).toDateString() !== new Date().toDateString())
        },
        mock: true,
        message: 'Service account not configured',
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

    // Fetch events from Google Calendar using service account
    const events = await fetchCalendarEvents(GOOGLE_CALENDAR_ID, 20);
    
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
