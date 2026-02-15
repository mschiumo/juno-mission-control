/**
 * Google Calendar API utilities
 * 
 * Uses Google Service Account via GOOGLE_CALENDAR_CREDENTIALS env var
 * Credentials should be base64 encoded JSON service account key
 */

import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

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
}

/**
 * Get authenticated Google Calendar client
 */
async function getCalendarClient() {
  const credentialsEnv = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  
  if (!credentialsEnv) {
    throw new Error('GOOGLE_CALENDAR_CREDENTIALS not set');
  }

  // Try base64 decode first, then raw JSON
  let credentials;
  try {
    const decoded = Buffer.from(credentialsEnv, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } catch {
    credentials = JSON.parse(credentialsEnv);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return google.calendar({ version: 'v3', auth });
}

/**
 * Fetch events from Google Calendar
 */
export async function fetchCalendarEvents(
  calendarId: string = CALENDAR_ID,
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient();
    const timeMin = new Date().toISOString();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 7);

    const response = await calendar.events.list({
      calendarId,
      maxResults,
      timeMin,
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []) as CalendarEvent[];
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
  try {
    const calendar = await getCalendarClient();

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
      },
    });

    return response.data as CalendarEvent;
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    throw error; // Let the API route handle the error response
  }
}
