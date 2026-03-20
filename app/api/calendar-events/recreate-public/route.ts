/**
 * Recreate Calendar Events as Public
 * 
 * POST /api/calendar-events/recreate-public
 * Deletes existing Juno events and recreates as public
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

const EVENTS_TO_CREATE = [
  {
    summary: 'Trading Week Review',
    start: { dateTime: '2026-03-20T19:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-20T20:00:00', timeZone: 'America/New_York' },
    description: 'Weekly trading analysis:\n• Review all trades (wins/losses)\n• Calculate P&L\n• Identify patterns\n• Lessons learned\n• Adjust strategy for next week\n• Update trading journal\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR'],
  },
  {
    summary: 'Lift: Lower B (Hip/Ham) - Lean Mass',
    start: { dateTime: '2026-03-20T21:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-20T22:00:00', timeZone: 'America/New_York' },
    description: 'Lean Mass Building - Hip/Hamstring Dominant\n\nWARM-UP (5 min):\n• Hip circles\n• Glute activation (bridges)\n• Light hamstring mobility\n\nWORKOUT:\n1. Deadlift (Conventional) - 4x5\n2. Hip Thrusts - 4x10\n3. Lying Leg Curls - 3x12\n4. Walking Lunges - 3x12/leg\n5. Seated Calf Raises - 4x15\n6. Hanging Leg Raises - 3x15\n\nNUTRITION:\n• Dinner: 7:00-7:30 PM (protein + complex carbs)\n• Pre-workout: Banana at 8:30 PM if needed\n• Post-workout: Protein shake immediately after\n\nNOTES:\n• Rest: 60-90 seconds between sets\n• Focus: Controlled descent on deadlifts\n• Sleep target: 11:00 PM\n• Fri night workout - stay focused!\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '2',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR'],
  },
  {
    summary: '📖 Reading Time - Growth & Reflection',
    start: { dateTime: '2026-03-20T22:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-20T22:30:00', timeZone: 'America/New_York' },
    description: 'Daily reading block for personal growth.\n\nSUGGESTED TOPICS:\n• Trading psychology (Douglas, Elder)\n• Philosophy & mindset (Stoicism)\n• Poetry (your own writing, inspiration)\n• Business / entrepreneurship\n• Biographies of successful traders\n\nBENEFITS:\n• Wind down from screens\n• Mental expansion\n• Inspiration for trading & writing\n• Better sleep prep than scrolling\n\nTIPS:\n• Physical book or e-ink (not phone)\n• Comfy spot, good lighting\n• 30 minutes of focused reading\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=DAILY'],
  },
  {
    summary: '📝 Journaling - Clear the Mind',
    start: { dateTime: '2026-03-20T22:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-20T23:00:00', timeZone: 'America/New_York' },
    description: 'Daily journaling practice before sleep.\n\nPROMPTS TO CONSIDER:\n• What am I grateful for today?\n• What went well in trading?\n• What challenged me?\n• What did I learn?\n• How did I practice discipline?\n• What\'s my intention for tomorrow?\n\nKEEPLIVING ANGLE:\n• Capture poem ideas\n• Process emotions through words\n• Document the journey\n• Build content for blog/memoir\n\nJOURNALING FORMAT OPTIONS:\n• Stream of consciousness\n• Gratitude list (3 things)\n• Trading log reflections\n• Poetry drafts\n• Letter to future self\n\nBENEFITS:\n• Mental clarity\n• Emotional processing\n• Better sleep\n• Track growth over time\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=DAILY'],
  },
  {
    summary: '🌙 Wind Down - Prepare for Sleep',
    start: { dateTime: '2026-03-20T23:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-20T23:30:00', timeZone: 'America/New_York' },
    description: 'Final 30 minutes before sleep routine.\n\nWIND-DOWN CHECKLIST:\n• Close all screens (phone, laptop, TV)\n• Dim the lights\n• Brush teeth, skincare\n• Set out clothes for tomorrow\n• Set alarm for 7:30 AM\n• Quick stretch or breathing\n• Gratitude moment\n\nNO SCREENS RULE:\n• Blue light disrupts sleep\n• Trading/news can wait until morning\n• Your edge tomorrow requires rest tonight\n\nREMEMBER:\n"Recovery is training."\nYour muscles grow during sleep.\nYour trading mind resets during sleep.\nYour creativity regenerates during sleep.\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=DAILY'],
  },
  {
    summary: '🌙 Bedtime - Wind Down for 7:30 AM Wake-up',
    start: { dateTime: '2026-03-21T00:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-21T00:15:00', timeZone: 'America/New_York' },
    description: 'Time to wind down and prepare for sleep.\n\nGOAL: 7:30 AM wake-up requires sleep by 12:00 AM\nSleep duration: 7.5 hours\n\nWIND-DOWN ROUTINE:\n• 11:30 PM - Start winding down (screens off soon)\n• 11:45 PM - Final tasks, set alarm\n• 12:00 AM - Lights out, sleep\n\nRECOVERY IS TRAINING:\n• Muscles grow during sleep\n• Trading decisions require clear mind\n• Discipline includes rest discipline\n\nTOMORROW\'S SUCCESS STARTS TONIGHT.\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=DAILY'],
  },
  {
    summary: 'Trading Coaching Session',
    start: { dateTime: '2026-03-22T10:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-22T12:00:00', timeZone: 'America/New_York' },
    description: 'Weekly trading coaching\n• Review week\'s trades\n• Strategy discussion\n• Skill development\n• Goal setting\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
  },
  {
    summary: 'Lift: Upper A (Push) - Lean Mass',
    start: { dateTime: '2026-03-23T21:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-23T22:00:00', timeZone: 'America/New_York' },
    description: 'Lean Mass Building - Push Focus\n\nWARM-UP (5 min):\n• Band pull-aparts\n• Shoulder circles\n• Light mobility\n\nWORKOUT:\n1. Bench Press - 4x8\n2. Overhead Press - 3x10\n3. Incline Dumbbell Press - 3x12\n4. Weighted Dips - 3x10\n5. Lateral Raises - 3x15\n6. Tricep Rope Pushdowns - 3x15\n\nNUTRITION:\n• Dinner: 7:00-7:30 PM (protein + complex carbs)\n• Pre-workout: Banana at 8:30 PM if needed\n• Post-workout: Protein shake immediately after\n\nNOTES:\n• Rest: 60-90 seconds between sets\n• Focus: Mind-muscle connection\n• Sleep target: 11:00 PM\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '2',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
  },
  {
    summary: 'Trading Prep - Pre-Market Analysis',
    start: { dateTime: '2026-03-24T07:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-24T08:30:00', timeZone: 'America/New_York' },
    description: 'Pre-market routine:\n• Review Asia/London sessions\n• Check gap scanner (5 bullish/5 bearish)\n• Review overnight news\n• Set watchlist for the day\n• Prepare entry/exit plans\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU,WE,TH,FR'],
  },
  {
    summary: 'Market Open - Focus Time (DND)',
    start: { dateTime: '2026-03-24T09:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-24T11:00:00', timeZone: 'America/New_York' },
    description: 'Market open - first 90 minutes.\n• Execute trades\n• Monitor positions\n• NO distractions\n• Full focus mode\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU,WE,TH,FR'],
  },
  {
    summary: 'Lift: Lower A (Quad) - Lean Mass',
    start: { dateTime: '2026-03-24T21:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-24T22:00:00', timeZone: 'America/New_York' },
    description: 'Lean Mass Building - Quad Dominant\n\nWARM-UP (5 min):\n• Dynamic leg swings\n• Bodyweight squats\n• Hip mobility\n\nWORKOUT:\n1. Back Squat - 4x6-8\n2. Leg Press - 3x12\n3. Bulgarian Split Squats - 3x10/leg\n4. Leg Extensions - 3x15\n5. Standing Calf Raises - 4x15\n\nNUTRITION:\n• Dinner: 7:00-7:30 PM (protein + complex carbs)\n• Pre-workout: Banana at 8:30 PM if needed\n• Post-workout: Protein shake immediately after\n\nNOTES:\n• Rest: 60-90 seconds between sets\n• Focus: Full range of motion on squats\n• Sleep target: 11:00 PM\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '2',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
  },
  {
    summary: 'Live Trading with Emanuel (Twitch)',
    start: { dateTime: '2026-03-26T08:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-26T11:30:00', timeZone: 'America/New_York' },
    description: 'Live trading session with mentor Emanuel\n• Platform: Twitch\n• Focus: Real-time market analysis\n• Trade execution\n• Q&A\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '6',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TH'],
  },
  {
    summary: 'Lift: Upper B (Pull) - Lean Mass',
    start: { dateTime: '2026-03-26T21:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-26T22:00:00', timeZone: 'America/New_York' },
    description: 'Lean Mass Building - Pull Focus\n\nWARM-UP (5 min):\n• Band dislocations\n• Scapular pull-ups\n• Light back mobility\n\nWORKOUT:\n1. Barbell Rows - 4x8\n2. Weighted Pull-ups - 4x8 (or Lat Pulldowns)\n3. Romanian Deadlifts - 3x10\n4. Chest-Supported Rows - 3x12\n5. Barbell Curls - 3x12\n6. Face Pulls - 3x20\n\nNUTRITION:\n• Dinner: 7:00-7:30 PM (protein + complex carbs)\n• Pre-workout: Banana at 8:30 PM if needed\n• Post-workout: Protein shake immediately after\n\nNOTES:\n• Rest: 60-90 seconds between sets\n• Focus: Squeeze at top of rows\n• Sleep target: 11:00 PM\n\n---\nCreated by MJ\'s assistant, Juno',
    colorId: '2',
    visibility: 'public',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TH'],
  },
];

export async function POST() {
  try {
    const calendar = await getCalendarClient();

    // Step 1: Find and delete existing Juno events
    const existingResponse = await calendar.events.list({
      calendarId: 'primary',
      maxResults: 2500,
      singleEvents: false,
    });

    const existingEvents = existingResponse.data.items || [];
    const junoEvents = existingEvents.filter(event => 
      event.description?.includes("Created by MJ's assistant, Juno")
    );

    console.log(`Found ${junoEvents.length} existing Juno events to delete`);

    // Delete existing events
    const deleteResults = await Promise.allSettled(
      junoEvents.map(async (event) => {
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: event.id!,
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

    const deletedCount = deleteResults.filter(r => 
      r.status === 'fulfilled' && (r as any).value.success
    ).length;

    // Step 2: Create new public events
    const createResults = await Promise.allSettled(
      EVENTS_TO_CREATE.map(async (eventData) => {
        try {
          const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: eventData,
          });
          return { 
            success: true, 
            id: response.data.id, 
            summary: eventData.summary,
            visibility: eventData.visibility 
          };
        } catch (error) {
          return { 
            success: false, 
            summary: eventData.summary,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    const createdCount = createResults.filter(r => 
      r.status === 'fulfilled' && (r as any).value.success
    ).length;

    const failedCreates = createResults.filter(r => 
      r.status === 'rejected' || !(r as any).value.success
    );

    return NextResponse.json({
      success: true,
      stats: {
        deleted: deletedCount,
        created: createdCount,
        failed: failedCreates.length,
      },
      details: {
        deletions: deleteResults.map(r => r.status === 'fulfilled' ? r.value : r.reason),
        creations: createResults.map(r => r.status === 'fulfilled' ? r.value : r.reason),
      },
    });

  } catch (error) {
    console.error('Error recreating events:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recreate events',
      },
      { status: 500 }
    );
  }
}
