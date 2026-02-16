import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY = 'cron_results';

// Cron job definitions with their schedules - sorted chronologically (earliest to latest)
// schedule: human-readable display format
// cronExpression: standard cron format for parsing (minute hour day month dayOfWeek)
// NOTE: This list matches the DailyReportsCard filter - excluded jobs go to Telegram/banner only
const CRON_JOBS = [
  { id: 'london-session', name: 'London Session Update', schedule: '3:00 AM EST', cronExpression: '0 3 * * 0-4', frequency: 'Sun-Thu', status: 'active' },
  // Daily Motivational excluded - shows in banner, not reports
  { id: 'morning-wake', name: 'Morning Wake-up Check', schedule: '7:30 AM EST', cronExpression: '30 7 * * *', frequency: 'Daily', status: 'active' },
  { id: 'market-brief', name: 'Morning Market Briefing', schedule: '8:00 AM EST', cronExpression: '0 8 * * 0-4', frequency: 'Mon-Fri', status: 'active' },
  { id: 'gap-scanner', name: 'Gap Scanner Pre-Market', schedule: 'Mon-Fri 7:30 AM EST', cronExpression: '30 7 * * 1-5', frequency: 'Mon-Fri', status: 'active' },
  // Mid-Day Trading Check-in excluded - Telegram only
  { id: 'market-close', name: 'Market Close Report', schedule: '5:00 PM EST', cronExpression: '30 21 * * 0-4', frequency: 'Mon-Fri', status: 'active' },
  // Post-Market Trading Review excluded - Telegram only
  { id: 'asia-session', name: 'Asia Session Update', schedule: '7:00 PM EST', cronExpression: '0 19 * * 0-4', frequency: 'Sun-Thu', status: 'active' },
  { id: 'weekly-review', name: 'Weekly Habit Review', schedule: 'Friday 7:00 PM EST', cronExpression: '0 19 * * 5', frequency: 'Weekly', status: 'active' },
  { id: 'task-approval', name: 'Nightly Task Approval', schedule: '10:00 PM EST', cronExpression: '0 22 * * *', frequency: 'Daily', status: 'active' },
  { id: 'token-summary', name: 'Daily Token Usage Summary', schedule: '11:00 PM EST', cronExpression: '0 23 * * *', frequency: 'Daily', status: 'active' },
  // Evening Habit Check-in excluded - has its own UI card
  // GitHub PR Monitor excluded - internal tool
];

// Map job names to cron result jobNames for matching
const JOB_NAME_MAP: Record<string, string[]> = {
  'london-session': ['London Session Update', 'London Session Open Update'],
  // Daily Motivational excluded - shows in banner
  'morning-wake': ['Morning Wake-up Check'],
  'market-brief': ['Morning Market Briefing'],
  'gap-scanner': ['Gap Scanner Pre-Market', 'Gap Scanner Monday Test'],
  // Mid-Day Trading Check-in excluded - Telegram only
  'market-close': ['Market Close Report'],
  // Post-Market Trading Review excluded - Telegram only
  'asia-session': ['Asia Session Update', 'Asia Session Open Update'],
  'weekly-review': ['Weekly Habit Review'],
  'task-approval': ['Nightly Task Approval', 'Nightly Task Approval Request'],
  'token-summary': ['Daily Token Usage Summary'],
  // Evening Habit Check-in excluded - has its own card
  // GitHub PR Monitor excluded - internal tool
};

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    const redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    await redis.connect();
    
    // Fetch all cron results from last 24 hours
    const stored = await redis.get(STORAGE_KEY);
    let cronResults: Array<{ jobName?: string; timestamp: string; type?: string; content?: string }> = [];

    if (stored) {
      try {
        cronResults = JSON.parse(stored);
        // Sort by timestamp descending (newest first) - timestamps are ISO strings
        cronResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (e) {
        console.error('Failed to parse cron results:', e);
      }
    }
    
    await redis.disconnect();
    
    // Fetch last run status for each cron job
    const cronStatus = CRON_JOBS.map((job) => {
      // Find matching results for this job
      const matchingNames = JOB_NAME_MAP[job.id] || [job.name];
      const jobResults = cronResults.filter((r) => 
        matchingNames.some(name => r.jobName?.includes(name))
      );
      
      // Get the most recent result
      const lastResult = jobResults[0];
      
      let lastStatus = 'pending';
      if (lastResult) {
        if (lastResult.type === 'error' || lastResult.content?.includes('FAILED') || lastResult.content?.includes('❌')) {
          lastStatus = 'failed';
        } else if (lastResult.content?.includes('timeout') || lastResult.content?.includes('timed out')) {
          lastStatus = 'timeout';
        } else {
          lastStatus = 'completed';
        }
      }
      
      return {
        ...job,
        lastRun: lastResult ? new Date(lastResult.timestamp).toISOString() : null,
        lastStatus,
        lastOutput: lastResult ? lastResult.content?.substring(0, 100) + '...' : null,
      };
    });
    
    // Calculate summary stats
    const completed = cronStatus.filter(c => c.lastStatus === 'completed').length;
    const failed = cronStatus.filter(c => c.lastStatus === 'failed' || c.lastStatus === 'timeout').length;
    const pending = cronStatus.filter(c => c.lastStatus === 'pending').length;
    
    return NextResponse.json({
      success: true,
      crons: cronStatus,
      summary: {
        total: CRON_JOBS.length,
        completed,
        failed,
        pending,
        active: CRON_JOBS.filter(j => j.status === 'active').length,
      },
      timestamp,
    });
    
  } catch (error) {
    console.error('Cron status fetch error:', error);
    
    // Return job list without status if Redis fails
    return NextResponse.json({
      success: true,
      crons: CRON_JOBS.map(job => ({
        ...job,
        lastRun: null,
        lastStatus: 'unknown',
        lastOutput: null,
      })),
      summary: {
        total: CRON_JOBS.length,
        completed: 0,
        failed: 0,
        pending: CRON_JOBS.length,
        active: CRON_JOBS.filter(j => j.status === 'active').length,
      },
      timestamp,
      error: 'Failed to fetch run status from Redis',
    });
  }
}
