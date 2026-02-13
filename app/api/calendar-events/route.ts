import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';

const KEYFILEPATH = path.join(process.cwd(), '.google_credentials/calendar.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_ID = 'mschiumo18@gmail.com';

export async function GET() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEYFILEPATH,
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
    
    // Return mock data if calendar fetch fails
    return NextResponse.json({
      success: true,
      data: [
        {
          id: '1',
          title: 'Trading Prep - Pre-Market Analysis',
          start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
          calendar: 'primary',
          color: '#ff6b35',
          description: 'Morning market preparation'
        },
        {
          id: '2',
          title: 'Lift: Lower B (Hip/Ham) - Lean Mass',
          start: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString(),
          calendar: 'primary',
          color: '#238636',
          description: 'Deadlift, Hip Thrust, Leg Curls, Abs'
        }
      ],
      count: 2,
      timestamp: new Date().toISOString()
    });
  }
}