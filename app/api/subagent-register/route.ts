import { NextResponse } from 'next/server';
import { createClient } from 'redis';

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
      console.error('[SubagentRegister] Redis Client Error:', err.message);
    });

    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('[SubagentRegister] Failed to connect to Redis:', error);
    return null;
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
    console.error('Subagent registration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to register subagent'
    }, { status: 500 });
  }
}
