import { NextResponse } from 'next/server';
import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  
  try {
    const client = createClient({ url: process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

/**
 * POST /api/evening-checkin/clear
 * 
 * Wipes all evening check-in history
 */
export async function POST() {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    // Delete the evening_checkins key
    const result = await redis.del('evening_checkins');
    
    return NextResponse.json({
      success: true,
      message: 'Evening check-in history cleared',
      deleted: result === 1
    });
    
  } catch (error) {
    console.error('Evening checkin clear error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear check-in history' },
      { status: 500 }
    );
  }
}
