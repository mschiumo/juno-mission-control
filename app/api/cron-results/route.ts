import { NextResponse } from 'next/server';

interface CronResult {
  id: string;
  jobName: string;
  timestamp: string;
  content: string;
  type: 'market' | 'motivational' | 'check-in' | 'review' | 'error';
}

// In-memory storage - persists until server restart/deploy
// This is more reliable than Redis for Vercel serverless functions
const cronResults: CronResult[] = [];
const MAX_RESULTS = 100;

// Notifications stored in-memory too
interface Notification {
  id: string;
  type: 'blocker' | 'info' | 'success';
  title: string;
  message: string;
  action?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  createdAt: string;
}

const notifications: Notification[] = [];
const MAX_NOTIFICATIONS = 50;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('jobName');

    if (jobName) {
      // Get latest result for specific job
      const result = cronResults
        .filter(r => r.jobName === jobName)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
      if (!result) {
        return NextResponse.json({
          success: false,
          error: 'No results found for this job'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: result
      });
    }

    // Get all results for today
    const today = new Date().toDateString();
    const todayResults = cronResults.filter(r => 
      new Date(r.timestamp).toDateString() === today
    );

    // Deduplicate: keep only the latest report per job name
    const latestByJob = new Map<string, CronResult>();
    todayResults.forEach(result => {
      const existing = latestByJob.get(result.jobName);
      if (!existing || new Date(result.timestamp) > new Date(existing.timestamp)) {
        latestByJob.set(result.jobName, result);
      }
    });
    
    const dedupedResults = Array.from(latestByJob.values());

    return NextResponse.json({
      success: true,
      data: dedupedResults,
      count: dedupedResults.length
    });
  } catch (error) {
    console.error('Cron results GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch results'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobName, content, type } = body;

    if (!jobName || !content) {
      return NextResponse.json({
        success: false,
        error: 'jobName and content are required'
      }, { status: 400 });
    }

    // Create new result
    const newResult: CronResult = {
      id: Date.now().toString(),
      jobName,
      timestamp: new Date().toISOString(),
      content,
      type: type || 'check-in'
    };

    // Add to results (keep last 100 to prevent unbounded growth)
    cronResults.push(newResult);
    while (cronResults.length > MAX_RESULTS) {
      cronResults.shift(); // Remove oldest
    }

    // Check for timeout or failure and create notification
    const isTimeout = content.toLowerCase().includes('timeout') || 
                      content.toLowerCase().includes('timed out');
    const isError = type === 'error' || 
                    content.includes('❌') || 
                    content.includes('FAILED') ||
                    content.toLowerCase().includes('error');

    if (isTimeout || isError) {
      const newNotification: Notification = {
        id: `notif_${Date.now()}`,
        type: 'blocker',
        title: isTimeout ? '⏱️ Cron Job Timeout' : '❌ Cron Job Failed',
        message: `${jobName}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`,
        action: 'Check dashboard for details',
        priority: isTimeout ? 'high' : 'urgent',
        read: false,
        createdAt: new Date().toISOString(),
      };
      
      notifications.unshift(newNotification);
      
      // Keep only last 50 notifications
      while (notifications.length > MAX_NOTIFICATIONS) {
        notifications.pop();
      }
    }

    return NextResponse.json({
      success: true,
      data: newResult
    });
  } catch (error) {
    console.error('Cron results POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to store result'
    }, { status: 500 });
  }
}

// Export for use by notifications API
export { notifications };