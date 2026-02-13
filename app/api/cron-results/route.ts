import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

interface CronResult {
  id: string;
  jobName: string;
  timestamp: string;
  content: string;
  type: 'market' | 'motivational' | 'check-in' | 'review';
}

const STORAGE_KEY = 'cron_results';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('jobName');

    // Get all results from KV
    const results: CronResult[] = (await kv.get(STORAGE_KEY)) || [];

    if (jobName) {
      // Get latest result for specific job
      const result = results
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
    const todayResults = results.filter(r => 
      new Date(r.timestamp).toDateString() === today
    );

    return NextResponse.json({
      success: true,
      data: todayResults,
      count: todayResults.length
    });
  } catch (error) {
    console.error('KV GET error:', error);
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

    // Get existing results
    const results: CronResult[] = (await kv.get(STORAGE_KEY)) || [];

    // Create new result
    const newResult: CronResult = {
      id: Date.now().toString(),
      jobName,
      timestamp: new Date().toISOString(),
      content,
      type: type || 'check-in'
    };

    // Add to results (keep last 100 to prevent unbounded growth)
    results.push(newResult);
    if (results.length > 100) {
      results.shift(); // Remove oldest
    }

    // Save back to KV
    await kv.set(STORAGE_KEY, results);

    return NextResponse.json({
      success: true,
      data: newResult
    });
  } catch (error) {
    console.error('KV POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to store result'
    }, { status: 500 });
  }
}
