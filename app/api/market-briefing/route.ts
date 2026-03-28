/**
 * Market Briefing API — serves the cached morning briefing to the UI.
 *
 * GET /api/market-briefing
 *   Returns the latest cached briefing from Redis, or null if none exists.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const BRIEFING_CACHE_KEY = 'market_briefing_latest';

export async function GET() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(BRIEFING_CACHE_KEY);

    if (!raw) {
      return NextResponse.json({ success: true, briefing: null });
    }

    const briefing = JSON.parse(raw);
    return NextResponse.json({ success: true, briefing });
  } catch (error) {
    console.error('[MarketBriefing] Failed to fetch cached briefing:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch market briefing' },
      { status: 500 },
    );
  }
}
