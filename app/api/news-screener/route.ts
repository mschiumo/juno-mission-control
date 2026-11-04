import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { getMarketNews } from '@/lib/news/market-news';
import { NEWS_CATEGORY_META, NEWS_CATEGORY_ORDER, NEWS_REFRESH_INTERVAL_MS } from '@/lib/news/categories';

export const dynamic = 'force-dynamic';

/**
 * Market News for the Trading → Market News tab.
 *
 * Serves the Redis-cached payload that `/api/cron-jobs/market-news-refresh`
 * rebuilds every 15 minutes from ~30 free news feeds (see lib/news/market-news.ts).
 * If the cache is stale or missing, the read refreshes inline. The response is
 * never CDN-cached: the Redis cache is the single source of truth, so every
 * user sees the same, current set of headlines.
 */
export async function GET() {
  const { error: entitlementError } = await requireFeature('marketNews');
  if (entitlementError) return entitlementError;

  try {
    const payload = await getMarketNews();
    const generatedMs = Date.parse(payload.generatedAt);

    return NextResponse.json(
      {
        success: true,
        data: payload,
        timestamp: payload.generatedAt,
        source: payload.source,
        categories: NEWS_CATEGORY_ORDER,
        categoryMeta: NEWS_CATEGORY_META,
        refreshIntervalMs: NEWS_REFRESH_INTERVAL_MS,
        nextUpdate: new Date(generatedMs + NEWS_REFRESH_INTERVAL_MS).toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[NewsScreener] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch news',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
