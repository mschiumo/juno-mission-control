/**
 * Google Calendar API utilities
 * 
 * To use in production:
 * 1. Set up Google Cloud project
 * 2. Enable Google Calendar API
 * 3. Create OAuth 2.0 credentials
 * 4. Add credentials to .env.local
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  calendarId?: string;
}

/**
 * Get access token from refresh token
 */
export async function getAccessToken(): Promise<string | null> {
  if (!GOOGLE_REFRESH_TOKEN || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google credentials');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Fetch events from Google Calendar
 */
export async function fetchCalendarEvents(
  calendarId: string = 'primary',
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  const timeMin = new Date().toISOString();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 7);

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
      `maxResults=${maxResults}&` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax.toISOString())}&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${event.calendarId || 'primary'}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end
        })
      }
    );

    return await response.json();
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    return null;
  }
}
