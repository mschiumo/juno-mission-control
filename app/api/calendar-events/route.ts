import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const DEFAULT_CALENDAR_ID = 'mschiumo18@gmail.com';

// Mock events for testing UI when credentials aren't working
const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Trading Review & Analysis',
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    calendar: DEFAULT_CALENDAR_ID,
    color: '#ff6b35',
    description: 'Review today\'s trades and plan for tomorrow',
    location: 'Home Office'
  },
  {
    id: '2',
    title: 'Leg Day Workout',
    start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    calendar: DEFAULT_CALENDAR_ID,
    color: '#238636',
    description: 'Squats, lunges, leg press',
    location: 'Gym'
  },
  {
    id: '3',
    title: 'KeepLiving Product Planning',
    start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
    calendar: DEFAULT_CALENDAR_ID,
    color: '#ff6b35',
    description: 'Finalize product descriptions and pricing',
    location: 'Coffee Shop'
  }
];

function colorForEvent(summary: string, colorId?: string | null): string {
  const lower = summary.toLowerCase();
  if (lower.includes('lift') || lower.includes('workout')) return '#238636';
  if (lower.includes('trading') || lower.includes('market')) return '#ff6b35';
  if (lower.includes('lab') || lower.includes('medical')) return '#d29922';
  if (colorId === '6') return '#ff6b35';
  return '#ff6b35';
}

// Build authenticated calendar client — tries OAuth2 first, then service account.
async function buildCalendarClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // 1. OAuth2 refresh token (works with personal Gmail — preferred)
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return google.calendar({ version: 'v3', auth: oauth2 });
  }

  // 2. Service account JSON (legacy — requires domain-wide delegation for personal accounts)
  const serviceAccountEnv =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_CALENDAR_CREDENTIALS;

  if (serviceAccountEnv) {
    let credentials;
    try {
      const decoded = Buffer.from(serviceAccountEnv, 'base64').toString('utf-8');
      credentials = JSON.parse(decoded);
    } catch {
      try {
        credentials = JSON.parse(serviceAccountEnv);
      } catch {
        return null;
      }
    }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    return google.calendar({ version: 'v3', auth });
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get('mock') === 'true') {
      return NextResponse.json({ success: true, data: MOCK_EVENTS, count: MOCK_EVENTS.length, mock: true, timestamp: new Date().toISOString() });
    }

    const calendarId = process.env.GOOGLE_CALENDAR_ID ?? DEFAULT_CALENDAR_ID;
    const days = Math.min(parseInt(searchParams.get('days') ?? '7', 10) || 7, 30);

    const calendarClient = await buildCalendarClient();

    if (!calendarClient) {
      return NextResponse.json({
        success: true,
        data: MOCK_EVENTS,
        count: MOCK_EVENTS.length,
        mock: true,
        message: 'Using mock data — no Google Calendar credentials configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN for OAuth2, or GOOGLE_SERVICE_ACCOUNT_JSON for a service account.',
        timestamp: new Date().toISOString()
      });
    }

    const now = new Date();
    const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendarClient.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const formattedEvents = (response.data.items ?? []).map(event => ({
      id: event.id,
      title: event.summary || 'Untitled Event',
      start: event.start?.dateTime ?? event.start?.date,
      end: event.end?.dateTime ?? event.end?.date,
      calendar: calendarId,
      color: colorForEvent(event.summary ?? '', event.colorId),
      description: event.description ?? '',
      location: event.location ?? '',
    }));

    return NextResponse.json({
      success: true,
      data: formattedEvents,
      count: formattedEvents.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Calendar fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: true,
      data: MOCK_EVENTS,
      count: MOCK_EVENTS.length,
      mock: true,
      message: 'Using mock data — API error: ' + errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}
