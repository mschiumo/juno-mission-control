import { createClient } from 'redis';
import { NextResponse } from 'next/server';

export interface SubagentStatus {
  sessionKey: string;
  task: string;
  status: 'working' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  lastUpdated: string;
}

const SUBAGENT_KEY_PREFIX = 'subagent:';
const SUBAGENT_TTL_SECONDS = 30 * 60; // 30 minutes

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
    
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis unavailable'
      }, { status: 503 });
    }

    // Get all keys matching subagent:*
    const keys = await redis.keys(`${SUBAGENT_KEY_PREFIX}*`);
    
    const subagents: SubagentStatus[] = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const subagent: SubagentStatus = JSON.parse(data);
          subagents.push(subagent);
        } catch (e) {
          console.error('Failed to parse subagent data:', e);
        }
      }
    }

    // Sort by lastUpdated (newest first)
    subagents.sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    return NextResponse.json({
      success: true,
      data: subagents,
      count: subagents.length,
      activeCount: subagents.filter(s => s.status === 'working' || s.status === 'in_progress').length
    });
  } catch (error) {
    console.error('Subagent status GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch subagent status'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionKey, task, status } = body;

    if (!sessionKey) {
      return NextResponse.json({
        success: false,
        error: 'sessionKey is required'
      }, { status: 400 });
    }

    if (!task) {
      return NextResponse.json({
        success: false,
        error: 'task is required'
      }, { status: 400 });
    }

    if (!status || !['working', 'in_progress', 'completed', 'failed'].includes(status)) {
      return NextResponse.json({
        success: false,
        error: 'status must be one of: working, in_progress, completed, failed'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis unavailable'
      }, { status: 503 });
    }

    const key = `${SUBAGENT_KEY_PREFIX}${sessionKey}`;
    
    // Get existing data to preserve startedAt if it exists
    const existingData = await redis.get(key);
    let startedAt = new Date().toISOString();
    
    if (existingData) {
      try {
        const existing: SubagentStatus = JSON.parse(existingData);
        startedAt = existing.startedAt;
      } catch (e) {
        // Use new startedAt if parsing fails
      }
    }

    const subagent: SubagentStatus = {
      sessionKey,
      task,
      status,
      startedAt,
      lastUpdated: new Date().toISOString()
    };

    // Save to Redis with TTL
    await redis.setEx(key, SUBAGENT_TTL_SECONDS, JSON.stringify(subagent));

    return NextResponse.json({
      success: true,
      data: subagent
    });
  } catch (error) {
    console.error('Subagent status POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to store subagent status'
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionKey = searchParams.get('sessionKey');

    if (!sessionKey) {
      return NextResponse.json({
        success: false,
        error: 'sessionKey is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis unavailable'
      }, { status: 503 });
    }

    const key = `${SUBAGENT_KEY_PREFIX}${sessionKey}`;
    await redis.del(key);

    return NextResponse.json({
      success: true,
      message: `Subagent ${sessionKey} removed`
    });
  } catch (error) {
    console.error('Subagent status DELETE error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to remove subagent'
    }, { status: 500 });
  }
}
