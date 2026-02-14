import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_ID = 'mschiumo18@gmail.com';

// Mock events for testing UI when credentials aren't working
const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Trading Review & Analysis',
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
    end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    calendar: 'mschiumo18@gmail.com',
    color: '#ff6b35',
    description: 'Review today\'s trades and plan for tomorrow',
    location: 'Home Office'
  },
  {
    id: '2',
    title: 'Leg Day Workout',
    start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    calendar: 'mschiumo18@gmail.com',
    color: '#238636',
    description: 'Squats, lunges, leg press',
    location: 'Gym'
  },
  {
    id: '3',
    title: 'KeepLiving Product Planning',
    start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
    end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
    calendar: 'mschiumo18@gmail.com',
    color: '#ff6b35',
    description: 'Finalize product descriptions and pricing',
    location: 'Coffee Shop'
  }
];

export async function GET(request: Request) {
  try {
    // Check for mock mode (for testing UI)
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

    // Get credentials from environment variable
    const credentialsEnv = process.env.GOOGLE_CALENDAR_CREDENTIALS;
    
    if (!credentialsEnv) {
      console.log('GOOGLE_CALENDAR_CREDENTIALS not set, returning mock data');
      return NextResponse.json({
        success: true,
        data: MOCK_EVENTS,
        count: MOCK_EVENTS.length,
        mock: true,
        message: 'Using mock data - GOOGLE_CALENDAR_CREDENTIALS not configured',
        timestamp: new Date().toISOString()
      });
    }

    // Try to parse credentials
    let credentials;
    try {
      // Try base64 decode first
      const decoded = Buffer.from(credentialsEnv, 'base64').toString('utf-8');
      credentials = JSON.parse(decoded);
    } catch {
      try {
        // If base64 fails, try raw JSON
        credentials = JSON.parse(credentialsEnv);
      } catch (parseError) {
        console.error('Failed to parse credentials:', parseError);
        // Return mock data instead of error
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

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Get events for next 7 days
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const events = response.data.items || [];

    const formattedEvents = events.map(event => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      
      // Determine color based on event title or colorId
      let color = '#ff6b35'; // Default tangerine
      const summary = (event.summary || '').toLowerCase();
      
      if (summary.includes('lift') || summary.includes('workout')) {
        color = '#238636'; // Green for fitness
      } else if (summary.includes('trading') || summary.includes('market')) {
        color = '#ff6b35'; // Tangerine for trading
      } else if (summary.includes('lab') || summary.includes('medical')) {
        color = '#d29922'; // Yellow for appointments
      } else if (event.colorId === '6') {
        color = '#ff6b35'; // Juno's tangerine
      }

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        start: start,
        end: end,
        calendar: 'mschiumo18@gmail.com',
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
    console.error('Calendar fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: true,
      data: MOCK_EVENTS,
      count: MOCK_EVENTS.length,
      mock: true,
      message: 'Using mock data - API error: ' + errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}
