/**
 * Google Calendar API with Service Account
 * 
 * GET /api/calendar-events?maxResults=10
 * Returns events from the primary calendar
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';

const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const GOOGLE_IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER;

interface CalendarEvent {
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
  location?: string;
  status: string;
}

async function getCalendarClient() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  }

  // Load service account credentials
  const credentials = JSON.parse(readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY, 'utf-8'));

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: GOOGLE_IMPERSONATE_USER, // Impersonate the user
  });

  await auth.authorize();

  return google.calendar({ version: 'v3', auth });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const maxResults = parseInt(searchParams.get('maxResults') || '10', 10);
    const timeMin = searchParams.get('timeMin') || new Date().toISOString();

    const calendar = await getCalendarClient();

    const response = await calendar.events.list({
      calendarId: 'primary',
      maxResults,
      timeMin,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events: CalendarEvent[] = (response.data.items || []).map(event => ({
      id: event.id || '',
      summary: event.summary || 'No Title',
      description: event.description ?? undefined,
      start: {
        dateTime: event.start?.dateTime ?? undefined,
        date: event.start?.date ?? undefined,
      },
      end: {
        dateTime: event.end?.dateTime ?? undefined,
        date: event.end?.date ?? undefined,
      },
      location: event.location ?? undefined,
      status: event.status || 'confirmed',
    }));

    return NextResponse.json({
      success: true,
      data: events,
      count: events.length,
    });

  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch calendar events',
      },
      { status: 500 }
    );
  }
}
