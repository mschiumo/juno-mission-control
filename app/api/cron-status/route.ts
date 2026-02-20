import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY = 'cron_results';

// Cron job definitions with their schedules - sorted chronologically (earliest to latest)
const CRON_JOBS = [
  { id: 'morning-wake', name: 'Morning Wake-up Check', schedule: '7:30 AM EST', cronExpression: '30 7 * * *', frequency: 'Daily', status: 'active' },
  { id: 'gap-scanner', name: 'Gap Scanner Pre-Market', schedule: 'Mon-Fri 8:30 AM EST', cronExpression: '30 8 * * 1-5', frequency: 'Mon-Fri', status: 'active' },
  { id: 'midday-checkin', name: 'Mid-Day Trading Check-in', schedule: '12:30 PM EST', cronExpression: '30 12 * * 0-4', frequency: 'Mon-Fri', status: 'active' },
  { id: 'market-close', name: 'Market Close Report', schedule: '5:00 PM EST', cronExpression: '30 21 * * 0-4', frequency: 'Mon-Fri', status: 'active' },
  { id: 'weekly-review', name: 'Weekly Habit Review', schedule: 'Friday 7:00 PM EST', cronExpression: '0 19 * * 5', frequency: 'Weekly', status: 'active' },
  { id: 'evening-checkin', name: 'Evening Habit Check-in', schedule: '8:00 PM EST', cronExpression: '0 20 * * *', frequency: 'Daily', status: 'active' },
  { id: 'task-approval', name: 'Nightly Task Approval', schedule: '10:00 PM EST', cronExpression: '0 22 * * *', frequency: 'Daily', status: 'active' },
  { id: 'token-summary', name: 'Daily Token Usage Summary', schedule: '11:00 PM EST', cronExpression: '0 23 * * *', frequency: 'Daily', status: 'active' },
];

// Map job names to cron result jobNames for matching
const JOB_NAME_MAP: Record<string, string[]> = {
  'morning-wake': ['Morning Wake-up Check'],
  'gap-scanner': ['Gap Scanner Pre-Market', 'Gap Scanner Monday Test'],
  'midday-checkin': ['Mid-Day Trading Check-in'],
  'market-close': ['Market Close Report'],
  'weekly-review': ['Weekly Habit Review'],
  'evening-checkin': ['Evening Habit Check-in'],
  'task-approval': ['Nightly Task Approval', 'Nightly Task Approval Request'],
  'token-summary': ['Daily Token Usage Summary'],
};

// Redis client - lazy initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined,
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    const redis = await getRedisClient();
    
    // Fetch all cron results from last 24 hours
    let cronResults: Array<{ jobName?: string; timestamp: string; type?: string; content?: string }> = [];
    
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        try {
          cronResults = JSON.parse(stored);
          // Sort by timestamp descending (newest first)
          cronResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (e) {
          console.error('Failed to parse cron results:', e);
        }
      }
    }
    
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