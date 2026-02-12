import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder calendar events
  // In production, this would fetch from Google Calendar API
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const events = [
    {
      id: '1',
      title: 'Team Standup',
      start: new Date(today.setHours(9, 0, 0, 0)).toISOString(),
      end: new Date(today.setHours(9, 30, 0, 0)).toISOString(),
      calendar: 'Work',
      color: '#4285f4',
      description: 'Daily team sync'
    },
    {
      id: '2',
      title: 'Project Review',
      start: new Date(today.setHours(14, 0, 0, 0)).toISOString(),
      end: new Date(today.setHours(15, 0, 0, 0)).toISOString(),
      calendar: 'Work',
      color: '#4285f4',
      description: 'Q1 project review'
    },
    {
      id: '3',
      title: 'Gym Session',
      start: new Date(today.setHours(18, 0, 0, 0)).toISOString(),
      end: new Date(today.setHours(19, 0, 0, 0)).toISOString(),
      calendar: 'Personal',
      color: '#34a853',
      description: 'Strength training'
    },
    {
      id: '4',
      title: 'Dentist Appointment',
      start: new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString(),
      end: new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString(),
      calendar: 'Health',
      color: '#ea4335',
      description: 'Regular checkup'
    },
    {
      id: '5',
      title: 'Lunch with Sarah',
      start: new Date(tomorrow.setHours(12, 30, 0, 0)).toISOString(),
      end: new Date(tomorrow.setHours(13, 30, 0, 0)).toISOString(),
      calendar: 'Personal',
      color: '#34a853',
      description: 'Catch up'
    }
  ];

  return NextResponse.json({ 
    success: true, 
    data: events,
    timestamp: new Date().toISOString()
  });
}
