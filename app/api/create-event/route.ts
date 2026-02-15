import { NextResponse } from 'next/server';
import { createCalendarEvent } from '@/lib/google-calendar';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      title, 
      description, 
      startDate, 
      endDate
    } = body;

    if (!title || !startDate) {
      return NextResponse.json(
        { success: false, error: 'Title and start date are required' },
        { status: 400 }
      );
    }

    // Create event via Google Calendar API
    const event = await createCalendarEvent({
      summary: title,
      description: description || '',
      start: {
        dateTime: startDate
      },
      end: {
        dateTime: endDate || new Date(new Date(startDate).getTime() + 60 * 60 * 1000).toISOString()
      }
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Failed to create calendar event - check Google credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}