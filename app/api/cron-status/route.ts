import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder cron jobs data
  // In production, this would read from actual cron configuration
  const cronJobs = [
    {
      id: '1',
      name: 'Morning Briefing',
      schedule: '0 8 * * *',
      lastRun: '2024-01-15T08:00:00Z',
      status: 'active',
      description: 'Daily morning summary'
    },
    {
      id: '2',
      name: 'Market Check',
      schedule: '0 9,12,16 * * 1-5',
      lastRun: '2024-01-15T16:00:00Z',
      status: 'active',
      description: 'Check market prices'
    },
    {
      id: '3',
      name: 'Weekly Report',
      schedule: '0 18 * * 5',
      lastRun: '2024-01-12T18:00:00Z',
      status: 'active',
      description: 'Weekly summary email'
    },
    {
      id: '4',
      name: 'Backup Database',
      schedule: '0 2 * * *',
      lastRun: '2024-01-15T02:00:00Z',
      status: 'completed',
      description: 'Daily backup'
    },
    {
      id: '5',
      name: 'Health Check',
      schedule: '*/30 * * * *',
      lastRun: '2024-01-15T22:30:00Z',
      status: 'active',
      description: 'System health monitoring'
    }
  ];

  return NextResponse.json({ 
    success: true, 
    data: cronJobs,
    timestamp: new Date().toISOString()
  });
}
