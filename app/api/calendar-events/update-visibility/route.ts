/**
 * Update Calendar Events Visibility
 * 
 * POST /api/calendar-events/update-visibility
 * Makes all events created by Juno public
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const GOOGLE_IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER;

async function getCalendarClient() {
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  }

  const credentials = require(GOOGLE_SERVICE_ACCOUNT_KEY);

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: GOOGLE_IMPERSONATE_USER,
  });

  await auth.authorize();

  return google.calendar({ version: 'v3', auth });
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const makePublic = searchParams.get('public') === 'true';
    
    const calendar = await getCalendarClient();

    // Get all events
    const eventsResponse = await calendar.events.list({
      calendarId: 'primary',
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = eventsResponse.data.items || [];
    
    // Filter events created by Juno
    const junoEvents = events.filter(event => 
      event.description?.includes('Created by MJ\'s assistant, Juno')
    );

    console.log(`Found ${junoEvents.length} events created by Juno`);

    // Update each event
    const results = await Promise.allSettled(
      junoEvents.map(async (event) => {
        try {
          await calendar.events.patch({
            calendarId: 'primary',
            eventId: event.id!,
            requestBody: {
              visibility: makePublic ? 'public' : 'default',
            },
          });
          return { success: true, id: event.id, summary: event.summary };
        } catch (error) {
          return { 
            success: false, 
            id: event.id, 
            summary: event.summary,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r as any).value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !(r as any).value.success).length;

    return NextResponse.json({
      success: true,
      message: `Updated ${successful} events to ${makePublic ? 'public' : 'default'} visibility`,
      stats: {
        total: junoEvents.length,
        successful,
        failed,
      },
      details: results.map(r => r.status === 'fulfilled' ? r.value : r.reason),
    });

  } catch (error) {
    console.error('Error updating calendar events:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update events',
      },
      { status: 500 }
    );
  }
}
