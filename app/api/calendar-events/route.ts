import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_ID = 'mschiumo18@gmail.com';

export async function GET() {
  try {
    // Get credentials from environment variable
    const credentialsEnv = process.env.GOOGLE_CALENDAR_CREDENTIALS;
    
    if (!credentialsEnv) {
      return NextResponse.json({
        success: false,
        error: 'GOOGLE_CALENDAR_CREDENTIALS not configured',
        data: [],
        count: 0,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    // Try to parse credentials
    // Supports both base64 encoded and raw JSON
    let credentialsJson: string;
    try {
      // Try base64 decode first
      const decoded = Buffer.from(credentialsEnv, 'base64').toString('utf-8');
      // Verify it's valid JSON
      JSON.parse(decoded);
      credentialsJson = decoded;
    } catch {
      // If base64 fails, use raw
      credentialsJson = credentialsEnv;
    }

    const credentials = JSON.parse(credentialsJson);

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

  } catch (error: any) {
    console.error('Calendar fetch error:', error);
    
    // Return error details for debugging
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      errorDetails: error.response?.data || null,
      data: [],
      count: 0,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
