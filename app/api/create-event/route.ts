import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      title, 
      description, 
      startDate, 
      endDate, 
      calendar = 'primary' 
    } = body;

    if (!title || !startDate) {
      return NextResponse.json(
        { success: false, error: 'Title and start date are required' },
        { status: 400 }
      );
    }

    // Placeholder: In production, this would create an event via Google Calendar API
    // Requires OAuth2 authentication with Google

    const newEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      description: description || '',
      start: startDate,
      end: endDate || new Date(new Date(startDate).getTime() + 60 * 60 * 1000).toISOString(),
      calendar,
      createdAt: new Date().toISOString()
    };

    console.log('Creating calendar event:', newEvent);

    return NextResponse.json({ 
      success: true, 
      message: 'Event created successfully',
      data: newEvent
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}
