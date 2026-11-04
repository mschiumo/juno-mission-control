/**
 * Market News refresh cron
 *
 * Runs every 15 minutes, around the clock (schedule in vercel.json). Pulls
 * every configured news source, categorizes and de-dupes the stories, and
 * stores the payload in Redis so /api/news-screener is always serving fresh
 * headlines without any user request having to wait on 30 upstream feeds.
 *
 * Auth: middleware.ts gates /api/cron-jobs/* with CRON_SECRET (Vercel sends it
 * as a Bearer token), so no in-route auth is needed.
 */

import { NextResponse } from 'next/server';
import { refreshMarketNews } from '@/lib/news/market-news';

export const dynamic = 'force-dynamic';

async function run() {
  const started = Date.now();
  try {
    const payload = await refreshMarketNews();
    return NextResponse.json({
      success: true,
      generatedAt: payload.generatedAt,
      source: payload.source,
      totalScanned: payload.totalScanned,
      categorized: payload.categorized,
      counts: payload.counts,
      sourcesOk: payload.sourcesOk,
      sourcesFailed: payload.sourcesFailed,
      failedSources: payload.failedSources,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    console.error('[MarketNewsRefresh] failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - started,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
