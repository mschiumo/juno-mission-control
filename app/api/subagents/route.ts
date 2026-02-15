import { NextResponse } from 'next/server';
import { createClient } from 'redis';

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
      console.error('[Subagents] Redis Client Error:', err.message);
    });

    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('[Subagents] Failed to connect to Redis:', error);
    return null;
  }
}

export async function GET() {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis connection failed'
      }, { status: 500 });
    }

    // Get all keys matching subagent:*
    const keys = await redis.keys(`${SUBAGENT_KEY_PREFIX}*`);
    const subagents: SubagentStatus[] = [];

    for (const key of keys) {
      try {
        const data = await redis.get(key);
        if (data) {
          const subagent = JSON.parse(data);
          subagents.push(subagent);
        }
      } catch (error) {
        console.error(`[Subagents] Failed to parse subagent data for ${key}:`, error);
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
    const { sessionKey, task, status = 'working' } = body;

    if (!sessionKey || !task) {
      return NextResponse.json({
        success: false,
        error: 'sessionKey and task are required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis connection failed'
      }, { status: 500 });
    }

    const subagent = {
      sessionKey,
      task,
      status,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    await redis.setEx(
      `${SUBAGENT_KEY_PREFIX}${sessionKey}`,
      SUBAGENT_TTL_SECONDS,
      JSON.stringify(subagent)
    );

    return NextResponse.json({ success: true, data: subagent });
  } catch (error) {
    console.error('Subagent status POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update subagent status'
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
        error: 'Redis connection failed'
      }, { status: 500 });
    }

    await redis.del(`${SUBAGENT_KEY_PREFIX}${sessionKey}`);

    return NextResponse.json({
      success: true,
      message: `Subagent ${sessionKey} removed from tracking`
    });
  } catch (error) {
    console.error('Subagent status DELETE error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to remove subagent'
    }, { status: 500 });
  }
}
