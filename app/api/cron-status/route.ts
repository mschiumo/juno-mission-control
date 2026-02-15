import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY = 'cron_results';

// Cron job definitions with their schedules - sorted chronologically (earliest to latest)
const CRON_JOBS = [
  { id: 'london-session', name: 'London Session Update', schedule: '3:00 AM EST', frequency: 'Sun-Thu', status: 'active' },
  { id: 'motivational', name: 'Daily Motivational Message', schedule: '7:00 AM EST', frequency: 'Daily', status: 'active' },
  { id: 'morning-wake', name: 'Morning Wake-up Check', schedule: '7:30 AM EST', frequency: 'Daily', status: 'active' },
  { id: 'market-brief', name: 'Morning Market Briefing', schedule: '8:00 AM EST', frequency: 'Daily', status: 'active' },
  { id: 'gap-monday-test', name: 'Gap Scanner Monday Test', schedule: 'Monday 9:05 AM EST', frequency: 'Weekly', status: 'active' },
  { id: 'mid-day-check', name: 'Mid-Day Trading Check-in', schedule: '12:30 PM EST', frequency: 'Daily', status: 'active' },
  { id: 'market-close', name: 'Market Close Report', schedule: '5:00 PM EST', frequency: 'Sun-Thu', status: 'active' },
  { id: 'post-market', name: 'Post-Market Trading Review', schedule: '5:00 PM EST', frequency: 'Sun-Thu', status: 'active' },
  { id: 'asia-session', name: 'Asia Session Update', schedule: '7:00 PM EST', frequency: 'Sun-Thu', status: 'active' },
  { id: 'weekly-review', name: 'Weekly Habit Review', schedule: 'Friday 7:00 PM EST', frequency: 'Weekly', status: 'active' },
  { id: 'task-approval', name: 'Nightly Task Approval', schedule: '10:00 PM EST', frequency: 'Daily', status: 'active' },
  { id: 'token-summary', name: 'Daily Token Usage Summary', schedule: '11:00 PM EST', frequency: 'Daily', status: 'active' },
  { id: 'pr-monitor', name: 'GitHub PR Monitor', schedule: 'Every 10 min', frequency: 'Continuous', status: 'disabled' },
];

// Map job names to cron result jobNames for matching
const JOB_NAME_MAP: Record<string, string[]> = {
  'london-session': ['London Session Update', 'London Session Open Update'],
  'motivational': ['Daily Motivational Message'],
  'morning-wake': ['Morning Wake-up Check'],
  'market-brief': ['Morning Market Briefing'],
  'gap-monday-test': ['Gap Scanner Monday Test'],
  'mid-day-check': ['Mid-Day Trading Check-in'],
  'market-close': ['Market Close Report'],
  'post-market': ['Post-Market Trading Review'],
  'asia-session': ['Asia Session Update', 'Asia Session Open Update'],
  'weekly-review': ['Weekly Habit Review'],
  'task-approval': ['Nightly Task Approval', 'Nightly Task Approval Request'],
  'token-summary': ['Daily Token Usage Summary'],
  'pr-monitor': ['GitHub PR Monitor'],
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
