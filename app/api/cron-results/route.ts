import { createClient } from 'redis';
import { NextResponse } from 'next/server';

interface CronResult {
  id: string;
  jobName: string;
  timestamp: string;
  content: string;
  type: 'market' | 'motivational' | 'check-in' | 'review';
}

const STORAGE_KEY = 'cron_results';

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.REDIS_URL || undefined
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
    
    // Get all results from Redis (or use empty array if Redis unavailable)
    let results: CronResult[] = [];
    if (redis) {
      const data = await redis.get(STORAGE_KEY);
      results = data ? JSON.parse(data) : [];
    }

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
    console.error('Redis GET error:', error);
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

    // Add to results (keep last 100 to prevent unbounded growth)
    results.push(newResult);
    if (results.length > 100) {
      results.shift(); // Remove oldest
    }

    // Save back to Redis
    await redis.set(STORAGE_KEY, JSON.stringify(results));

    return NextResponse.json({
      success: true,
      data: newResult
    });
  } catch (error) {
    console.error('Redis POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to store result'
    }, { status: 500 });
  }
}
