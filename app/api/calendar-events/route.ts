import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'mschiumo18@gmail.com';
const IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER || 'mschiumo18@gmail.com';

const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Trading Review & Analysis',
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    calendar: 'mschiumo18@gmail.com',
    color: '#ff6b35',
    description: 'Review today\'s trades and plan for tomorrow',
    location: 'Home Office'
  },
  {
    id: '2',
    title: 'Leg Day Workout',
    start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    calendar: 'mschiumo18@gmail.com',
    color: '#238636',
    description: 'Squats, lunges, leg press',
    location: 'Gym'
  },
  {
    id: '3',
    title: 'KeepLiving Product Planning',
    start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
    calendar: 'mschiumo18@gmail.com',
    color: '#ff6b35',
    description: 'Finalize product descriptions and pricing',
    location: 'Coffee Shop'
  }
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const useMock = searchParams.get('mock') === 'true';
    
    if (useMock) {
      return NextResponse.json({
        success: true,
        data: MOCK_EVENTS,
        count: MOCK_EVENTS.length,
        mock: true,
        timestamp: new Date().toISOString()
      });
    }

    // PRIORITY: Use GOOGLE_SERVICE_ACCOUNT_JSON first
    let credentialsEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    let source = 'GOOGLE_SERVICE_ACCOUNT_JSON';
    
    // Fallback to GOOGLE_CALENDAR_CREDENTIALS only if primary not set
    if (!credentialsEnv) {
      credentialsEnv = process.env.GOOGLE_CALENDAR_CREDENTIALS;
      source = 'GOOGLE_CALENDAR_CREDENTIALS';
    }
    
    console.log('[Calendar API] Debug info:');
    console.log('[Calendar API] Source:', source);
    console.log('[Calendar API] Credentials length:', credentialsEnv?.length || 0);
    console.log('[Calendar API] First 50 chars:', credentialsEnv?.substring(0, 50) || 'undefined');
    
    if (!credentialsEnv || credentialsEnv.length < 10) {
      console.log('[Calendar API] No valid credentials found');
      return NextResponse.json({
        success: true,
        data: MOCK_EVENTS,
        count: MOCK_EVENTS.length,
        mock: true,
        message: 'Using mock data - GOOGLE_SERVICE_ACCOUNT_JSON not set or empty',
        debug: {
          serviceAccountSet: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
          calendarCredsSet: !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
          serviceAccountLength: process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length || 0,
          calendarCredsLength: process.env.GOOGLE_CALENDAR_CREDENTIALS?.length || 0,
        },
        timestamp: new Date().toISOString()
      });
    }

    // Try to parse credentials
    let credentials;
    try {
      // Try raw JSON first (most common)
      credentials = JSON.parse(credentialsEnv);
      console.log('[Calendar API] Parsed as raw JSON');
    } catch (rawError) {
      try {
        // Try base64 decode
        const decoded = Buffer.from(credentialsEnv, 'base64').toString('utf-8');
        credentials = JSON.parse(decoded);
        console.log('[Calendar API] Parsed as base64');
      } catch (base64Error) {
        console.error('[Calendar API] Failed to parse credentials:', base64Error);
        return NextResponse.json({
          success: true,
          data: MOCK_EVENTS,
          count: MOCK_EVENTS.length,
          mock: true,
          message: 'Using mock data - credentials parse error',
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log('[Calendar API] Authenticating with service account:', credentials.client_email);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
      clientOptions: {
        subject: IMPERSONATE_USER,
      },
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log('[Calendar API] Fetching events for:', CALENDAR_ID);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const events = response.data.items || [];
    console.log('[Calendar API] Found', events.length, 'events');

    const formattedEvents = events.map(event => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      
      let color = '#ff6b35';
      const summary = (event.summary || '').toLowerCase();
      
      if (summary.includes('lift') || summary.includes('workout')) {
        color = '#238636';
      } else if (summary.includes('trading') || summary.includes('market')) {
        color = '#ff6b35';
      } else if (summary.includes('lab') || summary.includes('medical')) {
        color = '#d29922';
      } else if (event.colorId === '6') {
        color = '#ff6b35';
      }

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        start: start,
        end: end,
        calendar: CALENDAR_ID,
        color: color,
        description: event.description || '',
        location: event.location || ''
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedEvents,
      count: formattedEvents.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Calendar API] Error:', error);
    return NextResponse.json({
      success: true,
      data: MOCK_EVENTS,
      count: MOCK_EVENTS.length,
      mock: true,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
