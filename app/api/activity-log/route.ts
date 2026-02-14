import { createClient } from 'redis';
import { NextResponse } from 'next/server';

interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  type: 'cron' | 'api' | 'user' | 'system';
  url?: string;
}

const STORAGE_KEY = 'activity_log';

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

export async function GET() {
  try {
    const redis = await getRedisClient();
    
    // Get activities from Redis (or use empty array if Redis unavailable)
    let activities: ActivityItem[] = [];
    if (redis) {
      const data = await redis.get(STORAGE_KEY);
      activities = data ? JSON.parse(data) : [];
    }

    // Get all activities for today
    const today = new Date().toDateString();
    const todayActivities = activities.filter(a => 
      new Date(a.timestamp).toDateString() === today
    );

    return NextResponse.json({
      success: true,
      data: todayActivities,
      count: todayActivities.length
    });
  } catch (error) {
    console.error('Activity log GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch activities'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, details, type, url } = body;

    if (!action) {
      return NextResponse.json({
        success: false,
        error: 'action is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis unavailable'
      }, { status: 503 });
    }

    // Get existing activities
    const data = await redis.get(STORAGE_KEY);
    const activities: ActivityItem[] = data ? JSON.parse(data) : [];

    // Create new activity
    const newActivity: ActivityItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details: details || '',
      type: type || 'system',
      url: url || undefined
    };

    // Add to activities (keep last 200 to prevent unbounded growth)
    activities.push(newActivity);
    if (activities.length > 200) {
      activities.shift(); // Remove oldest
    }

    // Save back to Redis
    await redis.set(STORAGE_KEY, JSON.stringify(activities));

    return NextResponse.json({
      success: true,
      data: newActivity
    });
  } catch (error) {
    console.error('Activity log POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to store activity'
    }, { status: 500 });
  }
}
