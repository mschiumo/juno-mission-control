import { NextResponse } from 'next/server';
import { createClient } from 'redis';

interface CronResult {
  id: string;
  jobName: string;
  timestamp: string;
  content: string;
  type: 'market' | 'motivational' | 'check-in' | 'review' | 'error';
}

const STORAGE_KEY = 'cron_results';
const MAX_RESULTS = 100;

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('jobName');
    
    const redis = await getRedisClient();
    
    let results: CronResult[] = [];
    if (redis) {
      const data = await redis.get(STORAGE_KEY);
      results = data ? JSON.parse(data) : [];
    }

    if (jobName) {
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

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis unavailable'
      }, { status: 503 });
    }

    // Get existing results
    const data = await redis.get(STORAGE_KEY);
    const results: CronResult[] = data ? JSON.parse(data) : [];

    // Create new result
    const newResult: CronResult = {
      id: Date.now().toString(),
      jobName,
      timestamp: new Date().toISOString(),
      content,
      type: type || 'check-in'
    };

    // Add to results (keep last 100)
    results.push(newResult);
    while (results.length > MAX_RESULTS) {
      results.shift();
    }

    // Save to Redis
    await redis.set(STORAGE_KEY, JSON.stringify(results));

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