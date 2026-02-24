import { createClient } from 'redis';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getUserId, getActivityLogKey } from '@/lib/db/user-data';

interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  type: 'cron' | 'api' | 'user' | 'system';
  url?: string;
}

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
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const redis = await getRedisClient();
    const storageKey = getActivityLogKey(userId);
    
    // Get activities from Redis (or use empty array if Redis unavailable)
    let activities: ActivityItem[] = [];
    if (redis) {
      const data = await redis.get(storageKey);
      activities = data ? JSON.parse(data) : [];
    }

    // Get all activities from last 48 hours
    const cutoffTime = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
    const recentActivities = activities
      .filter(a => new Date(a.timestamp).getTime() > cutoffTime)
      .map(a => ({
        ...a,
        // Ensure action and details are always strings
        action: typeof a.action === 'string' ? a.action : JSON.stringify(a.action),
        details: typeof a.details === 'string' ? a.details : JSON.stringify(a.details, null, 2)
      }));

    return NextResponse.json({
      success: true,
      data: recentActivities,
      count: recentActivities.length
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
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
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

    const storageKey = getActivityLogKey(userId);

    // Get existing activities
    const data = await redis.get(storageKey);
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

    // Add to activities (keep last 25 max)
    activities.push(newActivity);
    if (activities.length > 25) {
      activities.shift(); // Remove oldest
    }

    // Save back to Redis
    await redis.set(storageKey, JSON.stringify(activities));

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