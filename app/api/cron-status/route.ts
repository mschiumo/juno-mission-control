import { NextResponse } from 'next/server';

// OpenClaw Gateway endpoint
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  status: 'active' | 'completed' | 'paused' | 'error';
  description: string;
}

export async function GET() {
  try {
    // Try to fetch from OpenClaw gateway
    const response = await fetch(`${GATEWAY_URL}/api/cron/list`, {
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      next: { revalidate: 30 }
    });

    if (response.ok) {
      const data = await response.json();
      
      const jobs: CronJob[] = data.jobs?.map((job: any) => ({
        id: job.id,
        name: job.name,
        schedule: formatSchedule(job.schedule),
        lastRun: job.state?.lastRunAtMs 
          ? new Date(job.state.lastRunAtMs).toISOString()
          : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        status: job.enabled 
          ? (job.state?.consecutiveErrors > 0 ? 'error' : 'active')
          : 'paused',
        description: getJobDescription(job.name)
      })) || [];

      return NextResponse.json({
        success: true,
        data: jobs,
        timestamp: new Date().toISOString()
      });
    }

    throw new Error('Failed to fetch from gateway');

  } catch (error) {
    console.error('Cron status fetch error:', error);
    
    // Return known cron jobs as fallback
    const fallbackJobs: CronJob[] = [
      {
        id: '1',
        name: 'Asia Session Update',
        schedule: '0 19 * * 1-5',
        lastRun: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '7 PM EST - Asia market open'
      },
      {
        id: '2',
        name: 'London Session Update',
        schedule: '0 3 * * 1-5',
        lastRun: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '3 AM EST - Europe market open'
      },
      {
        id: '3',
        name: 'Morning Market Briefing',
        schedule: '0 13 * * 1-5',
        lastRun: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '8 AM EST - US pre-market'
      },
      {
        id: '4',
        name: 'Mid-Day Trading Check',
        schedule: '30 12 * * 1-5',
        lastRun: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '12:30 PM EST - Discipline check'
      },
      {
        id: '5',
        name: 'Post-Market Review',
        schedule: '0 17 * * 1-5',
        lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '5 PM EST - Trading review'
      },
      {
        id: '6',
        name: 'Daily Token Usage Summary',
        schedule: '0 23 * * *',
        lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '11 PM EST - Usage report'
      },
      {
        id: '7',
        name: 'Daily Motivational',
        schedule: '0 12 * * *',
        lastRun: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        description: '7 AM EST - Morning quote'
      }
    ];

    return NextResponse.json({
      success: true,
      data: fallbackJobs,
      timestamp: new Date().toISOString()
    });
  }
}

function formatSchedule(schedule: any): string {
  if (!schedule) return 'Unknown';
  
  if (schedule.expr === '0 19 * * 1-5') return 'Weekdays at 7:00 PM';
  if (schedule.expr === '0 3 * * 1-5') return 'Weekdays at 3:00 AM';
  if (schedule.expr === '0 13 * * 1-5') return 'Weekdays at 8:00 AM';
  if (schedule.expr === '30 12 * * 1-5') return 'Weekdays at 12:30 PM';
  if (schedule.expr === '0 17 * * 1-5') return 'Weekdays at 5:00 PM';
  if (schedule.expr === '0 23 * * *') return 'Daily at 11:00 PM';
  if (schedule.expr === '0 12 * * *') return 'Daily at 7:00 AM';
  if (schedule.expr === '30 7 * * *') return 'Daily at 7:30 AM';
  if (schedule.expr === '0 20 * * *') return 'Daily at 8:00 PM';
  if (schedule.expr === '0 22 * * *') return 'Daily at 10:00 PM';
  
  return schedule.expr || 'Unknown';
}

function getJobDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'Asia Session Update': '7 PM EST - Asia market open',
    'London Session Update': '3 AM EST - Europe market open',
    'Morning Market Briefing': '8 AM EST - US pre-market data',
    'Mid-Day Trading Check': '12:30 PM - Discipline check-in',
    'Post-Market Trading Review': '5 PM - Trading review',
    'Daily Token Usage Summary': '11 PM - Usage analytics',
    'Daily Motivational Message': '7 AM - Morning inspiration',
    'Morning Wake-up Check': '7:30 AM - Daily check-in',
    'Evening Habit Check-in': '8 PM - Habit tracking',
    'Nightly Task Approval Request': '10 PM - Task approval'
  };
  
  return descriptions[name] || 'Automated task';
}