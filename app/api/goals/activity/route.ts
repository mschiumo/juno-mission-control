/**
 * Owner-gated read endpoint for the Collaborative activity feed.
 * Returns events (oldest→newest as stored) written by /api/goals (MJ actions)
 * and /api/goals/agent (Claude actions).
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';
import { readActivity } from '@/lib/goals/activity';

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const events = await readActivity(redis, userId);
    return NextResponse.json({ success: true, events, generatedAt: getNowInEST() });
  } catch (err) {
    console.error('Goals activity error:', err);
    return NextResponse.json({ success: true, events: [], generatedAt: getNowInEST() });
  }
}
